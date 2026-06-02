import type { CollectionConfig } from 'payload'
import { sendConfirmation } from '../hooks/registrations'

export const Registrations: CollectionConfig = {
  slug: 'registrations',
  admin: {
    useAsTitle: 'id',
    group: 'Events',
  },
  hooks: {
    afterChange: [sendConfirmation],
  },
  fields: [
    { name: 'user', type: 'relationship', relationTo: 'users', required: true },
    { name: 'event', type: 'relationship', relationTo: 'events', required: true },
    { name: 'userName', type: 'text' },
    { name: 'userEmail', type: 'email' },
    { name: 'userPhone', type: 'text' },
    { name: 'formResponses', type: 'json' },
    { name: 'paymentStatus', type: 'select', defaultValue: 'pending', options: [{ label: 'Pending', value: 'pending' }, { label: 'Paid', value: 'paid' }, { label: 'Completed', value: 'completed' }, { label: 'Failed', value: 'failed' }, { label: 'Refunded', value: 'refunded' }, { label: 'Not Required', value: 'not_required' }] },
    { name: 'paymentAmount', type: 'number' },
    { name: 'paymentTicketId', type: 'text' },
    { name: 'registrationStatus', type: 'select', defaultValue: 'pending', options: [{ label: 'Pending', value: 'pending' }, { label: 'Confirmed', value: 'confirmed' }, { label: 'Cancelled', value: 'cancelled' }, { label: 'Expired', value: 'expired' }] },
    { name: 'registrationDate', type: 'date', admin: { readOnly: true } },
    { name: 'ticket', type: 'json', admin: { description: 'Embedded ticket data: { ticket_id, ticket_code, qr_code, is_scanned, issued_at }' } },
    { name: 'checkedIn', type: 'checkbox', defaultValue: false },
    { name: 'checkedInAt', type: 'date' },
    { name: 'checkedInBy', type: 'relationship', relationTo: 'users' },
    { name: 'lastCheckInLocation', type: 'text' },
    { name: 'checkInHistory', type: 'json', admin: { description: 'Multi-location check-in timeline' } },
  ],
}
