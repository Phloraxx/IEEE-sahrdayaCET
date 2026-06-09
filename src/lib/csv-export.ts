import { escapeFilterValue } from './pb'

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

export async function generateRegistrationsCSV(
  pb: import('pocketbase').default,
  eventId: string,
  options?: { adminFormat?: boolean }
): Promise<string> {
  // Fetch event to get formTemplate for dynamic columns
  let customFields: FormFieldDef[] = []
  try {
    const event = await pb.collection('events').getOne(eventId, { fields: 'id,formTemplate' })
    const template = (event as Record<string, unknown>).formTemplate
    if (Array.isArray(template)) {
      customFields = template as FormFieldDef[]
    }
  } catch {
    // Non-fatal — proceed with static columns only
  }

  const registrations = await pb.collection('registrations').getFullList({
    filter: `event = ${escapeFilterValue(eventId)}`,
    sort: '-registrationDate',
  })

  const rows: string[] = []
  const isAdmin = options?.adminFormat

  // Build header row
  const staticHeaders = isAdmin
    ? ['name', 'email', 'phone', 'payment_status', 'registration_status', 'checked_in', 'checked_in_at', 'ticket_id', 'registration_date']
    : ['Name', 'Email', 'Phone', 'Registration Date', 'Payment Status', 'Registration Status', 'Checked In', 'Checked In At', 'Ticket ID']

  const couponHeaders = ['coupon_code', 'discount_amount']
  const customHeaders = customFields.map((f) => f.label || f.id)

  rows.push([...staticHeaders, ...couponHeaders, ...customHeaders].join(','))

  for (const reg of registrations) {
    const r = reg as unknown as Record<string, unknown>
    const formResponses = (r.formResponses as Record<string, unknown>) || {}

    const formatDate = (iso: string | null | undefined) => {
      if (!iso) return ''
      try {
        return new Date(iso).toISOString()
      } catch {
        return ''
      }
    }

    // Build static columns
    const staticCols = [
      escapeCsv(r.userName),
      escapeCsv(r.userEmail),
      escapeCsv(r.userPhone),
      isAdmin ? escapeCsv(formatDate(r.registrationDate as string)) : escapeCsv(r.registrationDate ? new Date(r.registrationDate as string).toLocaleDateString('en-IN') : ''),
      escapeCsv(r.paymentStatus),
      escapeCsv(r.registrationStatus),
      isAdmin ? escapeCsv(r.checkedIn ? 'yes' : 'no') : (r.checkedIn ? 'Yes' : 'No'),
      isAdmin ? escapeCsv(formatDate(r.checkedInAt as string)) : escapeCsv(r.checkedInAt ? new Date(r.checkedInAt as string).toLocaleDateString('en-IN') : ''),
      isAdmin ? escapeCsv((r.ticketId as string) || (r.paymentTicketId as string)) : escapeCsv(r.ticketId as string),
    ]

    // Coupon columns
    const couponCols = [
      escapeCsv(r.couponCode as string),
      escapeCsv((r.discountAmount as number) ? `₹${r.discountAmount}` : ''),
    ]

    // Dynamic custom field columns
    const customCols = customFields.map((f) => escapeCsv(formResponses[f.id]))

    rows.push([...staticCols, ...couponCols, ...customCols].join(','))
  }

  return rows.join('\n') + '\n'
}
