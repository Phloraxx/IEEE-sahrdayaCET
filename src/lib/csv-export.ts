import type PocketBase from 'pocketbase'
import { escapeFilterValue } from './pb'
import { getField } from './safe-get'

/** CSV batch size for streaming exports. */
const CSV_BATCH_SIZE = 500

function escapeCsv(v: unknown): string {
  if (v === null || v === undefined) return ''
  let s = String(v)
  // Formula-injection protection: prefix dangerous leading chars so spreadsheet
  // apps don't evaluate the cell as a formula. Prefix with a single quote and
  // let Excel/Sheets strip it on import.
  if (/^[=+\-\t\r@]/.test(s)) {
    s = `'${s}`
  }
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

export interface EventLite {
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
  try {
    const event = options?.event ?? await pb.collection('events').getOne<EventLite>(eventId, { fields: 'id,formTemplate,title' })
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

  const queue: string[] = [`${headerRow  }\n`]
  let page = 1
  let exhausted = false

  const pullBatch = async () => {
    if (exhausted) return
    const result = await pb.collection('registrations').getList(page, CSV_BATCH_SIZE, {
      filter: `event = ${escapeFilterValue(eventId)}`,
      sort: '-registrationDate',
    })
    for (const reg of result.items) {
      const formResponses = getField<Record<string, unknown>>(reg, 'formResponses', {});
      const staticCols = [
        escapeCsv(getField(reg, 'userName', '')),
        escapeCsv(getField(reg, 'userEmail', '')),
        escapeCsv(getField(reg, 'userPhone', '')),
        isAdmin ? escapeCsv(formatter(getField(reg, 'registrationDate', ''))) : escapeCsv(getField(reg, 'registrationDate', '') ? new Date(getField(reg, 'registrationDate', '')).toLocaleDateString('en-IN') : ''),
        escapeCsv(getField(reg, 'paymentStatus', '')),
        escapeCsv(getField(reg, 'registrationStatus', '')),
        isAdmin ? escapeCsv(getField(reg, 'checkedIn', false) ? 'yes' : 'no') : (getField(reg, 'checkedIn', false) ? 'Yes' : 'No'),
        isAdmin ? escapeCsv(formatter(getField(reg, 'checkedInAt', ''))) : escapeCsv(getField(reg, 'checkedInAt', '') ? new Date(getField(reg, 'checkedInAt', '')).toLocaleDateString('en-IN') : ''),
        isAdmin ? escapeCsv(getField(reg, 'ticketId', '') || getField(reg, 'paymentTicketId', '')) : escapeCsv(getField(reg, 'ticketId', '')),
      ]
      const couponCols = [
        escapeCsv(getField(reg, 'couponCode', '')),
        escapeCsv(getField(reg, 'discountAmount', 0) ? `₹${getField(reg, 'discountAmount', 0)}` : ''),
      ]
      const customCols = customFields.map((f) => escapeCsv(formResponses[f.id]))
      queue.push(`${[...staticCols, ...couponCols, ...customCols].join(',')  }\n`)
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
