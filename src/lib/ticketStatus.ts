export interface TicketStatusInfo {
    iconName: string
    text: string
    color: string
    description: string
}

export function getTicketStatusInfo(
    status: string,
    isPast: boolean
): TicketStatusInfo {
    if (status === 'checked_in') {
        return { iconName: 'CheckCircle2', text: 'Checked In', color: 'bg-green-100 text-green-700 border-green-200', description: '' }
    }
    if (isPast) {
        return { iconName: 'Clock', text: 'Past Event', color: 'bg-gray-100 text-gray-600 border-gray-200', description: 'This event has already concluded' }
    }
    if (status === 'pending') {
        return { iconName: 'AlertCircle', text: 'Payment Pending', color: 'bg-yellow-100 text-yellow-700 border-yellow-200', description: 'Complete your payment to confirm registration' }
    }
    if (status === 'confirmed') {
        return { iconName: 'Ticket', text: 'Confirmed', color: 'bg-ieee-blue/10 text-ieee-blue border-ieee-blue/20', description: 'Use this QR at each check-in point during the event' }
    }
    return { iconName: 'AlertCircle', text: status, color: 'bg-gray-100 text-gray-600 border-gray-200', description: '' }
}
