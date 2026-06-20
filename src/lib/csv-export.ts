import type PocketBase from 'pocketbase'
import { escapeFilterValue } from './pb'

/** CSV batch size for streaming exports. */
const CSV_BATCH_SIZE = 500

function escapeCsv(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  if (/[",\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

interface FormFieldDef {
  id: string
  label: string
  type?: string
}

interface EventLite {
  id: string
  formTemplate?: unknown
  title?: string
}

/**
 * Streams a CSV of registrations for an event as a ReadableStream<string>,
 * paginating through registrations in batches to bound memory. Pass the
 * already-fetched event (with formTemplate) to avoid a redundant getOne.
 */
export async function streamRegistrationsCSV(
  pb: PocketBase,
  eventId: string,
  options?: { adminFormat?: boolean; event?: EventLite },
): Promise<ReadableStream<Uint8Array>> {
  const encoder = new TextEncoder()
  const isAdmin = options?.adminFormat ?? false

  // Resolve formTemplate for dynamic columns (use provided event if available)
  let customFields: FormFieldDef[] = []
  let eventTitle = 'event'
  try {
    const event = options?.event ?? await pb.collection('events').getOne<EventLite>(eventId, { fields: 'id,formTemplate,title' })
    eventTitle = event.title || 'event'
    const template = event.formTemplate
    if (Array.isArray(template)) customFields = template as FormFieldDef[]
  } catch {
    // Non-fatal — proceed with static columns only
  }

  const staticHeaders = isAdmin
    ? ['name', 'email', 'phone', 'payment_status', 'registration_status', 'checked_in', 'checked_in_at', 'ticket_id', 'registration_date']
    : ['Name', 'Email', 'Phone', 'Registration Date', 'Payment Status', 'Registration Status', 'Checked In', 'Checked In At', 'Ticket ID']
  const couponHeaders = ['coupon_code', 'discount_amount']
  const customHeaders = customFields.map((f) => f.label || f.id)

  const headerRow = [...staticHeaders, ...couponHeaders, ...customHeaders].join(',')

  const formatter = (iso: string | null | undefined) => {
    if (!iso) return ''
    try { return new Date(iso).toISOString() } catch { return '' }
  }

  const queue: string[] = [headerRow + '\n']
  let page = 1
  let exhausted = false

  const pullBatch = async () => {
    if (exhausted) return
    const result = await pb.collection('registrations').getList(page, CSV_BATCH_SIZE, {
      filter: `event = ${escapeFilterValue(eventId)}`,
      sort: '-registrationDate',
    })
    for (const reg of result.items) {
      const r = reg as unknown as Record<string, unknown>
      const formResponses = (r.formResponses as Record<string, unknown>) || {}
      const staticCols = [
        escapeCsv(r.userName),
        escapeCsv(r.userEmail),
        escapeCsv(r.userPhone),
        isAdmin ? escapeCsv(formatter(r.registrationDate as string)) : escapeCsv(r.registrationDate ? new Date(r.registrationDate as string).toLocaleDateString('en-IN') : ''),
        escapeCsv(r.paymentStatus),
        escapeCsv(r.registrationStatus),
        isAdmin ? escapeCsv(r.checkedIn ? 'yes' : 'no') : (r.checkedIn ? 'Yes' : 'No'),
        isAdmin ? escapeCsv(formatter(r.checkedInAt as string)) : escapeCsv(r.checkedInAt ? new Date(r.checkedInAt as string).toLocaleDateString('en-IN') : ''),
        isAdmin ? escapeCsv((r.ticketId as string) || (r.paymentTicketId as string)) : escapeCsv(r.ticketId as string),
      ]
      const couponCols = [
        escapeCsv(r.couponCode as string),
        escapeCsv((r.discountAmount as number) ? `₹${r.discountAmount}` : ''),
      ]
      const customCols = customFields.map((f) => escapeCsv(formResponses[f.id]))
      queue.push([...staticCols, ...couponCols, ...customCols].join(',') + '\n')
    }
    if (result.items.length < CSV_BATCH_SIZE) exhausted = true
    page++
  }

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        if (queue.length > 0) {
          controller.enqueue(encoder.encode(queue.shift()!))
        } else if (!exhausted) {
          await pullBatch()
          if (queue.length > 0) {
            controller.enqueue(encoder.encode(queue.shift()!))
          } else {
            controller.close()
          }
        } else {
          controller.close()
        }
      } catch (err) {
        controller.error(err)
      }
    },
  })
}

/** Filename for a CSV export, sanitized from the event title. */
export function csvFilename(eventTitle: string | undefined, eventId: string): string {
  const base = (eventTitle || `registrations-${eventId}`).replace(/[^a-zA-Z0-9]/g, '_')
  return `${base}_registrations.csv`
}
