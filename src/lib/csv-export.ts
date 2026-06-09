import { escapeFilterValue } from './pb'

function escapeCsv(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  if (/[",\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

interface RegistrationRow {
  userName?: string
  userEmail?: string
  userPhone?: string
  registrationDate?: string
  paymentStatus?: string
  registrationStatus?: string
  checkedIn?: boolean
  checkedInAt?: string
  ticketId?: string
  paymentTicketId?: string
}

export async function generateRegistrationsCSV(
  pb: import('pocketbase').default,
  eventId: string,
  options?: { adminFormat?: boolean }
): Promise<string> {
  const registrations = await pb.collection('registrations').getFullList({
    filter: `event = ${escapeFilterValue(eventId)}`,
    sort: '-registrationDate',
  })

  const rows: string[] = []
  const isAdmin = options?.adminFormat

  if (isAdmin) {
    rows.push([
      'name',
      'email',
      'phone',
      'payment_status',
      'registration_status',
      'checked_in',
      'checked_in_at',
      'ticket_id',
      'registration_date',
    ].join(','))
  } else {
    rows.push([
      'Name',
      'Email',
      'Phone',
      'Registration Date',
      'Payment Status',
      'Registration Status',
      'Checked In',
      'Checked In At',
      'Ticket ID',
    ].join(','))
  }

  for (const reg of registrations) {
    const r = reg as unknown as RegistrationRow
    const formatDate = (iso: string | null | undefined) => {
      if (!iso) return ''
      try {
        return new Date(iso).toISOString()
      } catch {
        return ''
      }
    }
    const formatLocale = (iso: string | null | undefined) => {
      if (!iso) return ''
      try {
        return new Date(iso).toLocaleDateString('en-IN')
      } catch {
        return ''
      }
    }

    rows.push([
      escapeCsv(r.userName),
      escapeCsv(r.userEmail),
      escapeCsv(r.userPhone),
      isAdmin ? escapeCsv(formatDate(r.registrationDate)) : escapeCsv(formatLocale(r.registrationDate)),
      escapeCsv(r.paymentStatus),
      escapeCsv(r.registrationStatus),
      isAdmin ? escapeCsv(r.checkedIn ? 'yes' : 'no') : (r.checkedIn ? 'Yes' : 'No'),
      isAdmin ? escapeCsv(formatDate(r.checkedInAt)) : escapeCsv(formatLocale(r.checkedInAt)),
      isAdmin ? escapeCsv(r.ticketId || r.paymentTicketId) : escapeCsv(r.ticketId),
    ].join(','))
  }

  return rows.join('\n') + '\n'
}
