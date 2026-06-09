export interface TicketStatusInfo {
    iconName: string
    text: string
    color: string
    description: string
}

const STATUS_MAP: Record<string, TicketStatusInfo> = {
    checked_in: { iconName: 'CheckCircle2', text: 'Checked In', color: 'bg-green-100 text-green-700 border-green-200', description: '' },
    pending: { iconName: 'AlertCircle', text: 'Payment Pending', color: 'bg-yellow-100 text-yellow-700 border-yellow-200', description: 'Complete your payment to confirm registration' },
    confirmed: { iconName: 'Ticket', text: 'Confirmed', color: 'bg-ieee-blue/10 text-ieee-blue border-ieee-blue/20', description: 'Use this QR at each check-in point during the event' },
}

const PAST_EVENT: TicketStatusInfo = { iconName: 'Clock', text: 'Past Event', color: 'bg-gray-100 text-gray-600 border-gray-200', description: 'This event has already concluded' }

const FALLBACK: TicketStatusInfo = { iconName: 'AlertCircle', text: '', color: 'bg-gray-100 text-gray-600 border-gray-200', description: '' }

export function getTicketStatusInfo(
    status: string,
    isPast: boolean
): TicketStatusInfo {
    if (isPast) return PAST_EVENT
    return STATUS_MAP[status] ?? { ...FALLBACK, text: status }
}
