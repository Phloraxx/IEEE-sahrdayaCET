import type { CollectionConfig } from 'payload'
import { sendConfirmation, validateRegistration, incrementOnConfirm, incrementCheckedInOnTransition } from '../hooks/registrations'
import { isAdmin, isAuthenticated, isChairOfSocietyForEventDoc, isChairOrAdminForEventRead } from '../access'

/**
 * Registrations state machine
 * ────────────────────────────────────────────────────────────────
 * paymentStatus:
 *   pending       → initial, awaiting payment
 *   paid          → payment confirmed (webhook or chair PATCH)
 *   not_required  → free event, no payment needed
 *   failed        → payment attempt failed
 *   refunded      → refunded (future)
 *
 * registrationStatus:
 *   pending       → initial
 *   confirmed     → ticket issued (paid OR not_required)
 *   cancelled     → admin/chair cancelled
 *   expired       → registration window closed (future)
 *
 * A registration is "ticket-issuable" when:
 *   (paymentStatus === 'paid' OR 'not_required') AND registrationStatus === 'confirmed'
 *
 * The sendConfirmation afterChange hook fires on this transition
 * and generates the ticket (ticket_id, qr_code).
 *
 * Note: the legacy 'completed' value for paymentStatus was removed —
 * use 'paid' instead. See EventRegistrationModal.tsx client-side state.
 */
export const Registrations: CollectionConfig = {
  slug: 'registrations',
  admin: {
    useAsTitle: 'id',
    group: 'Events',
  },
  access: {
    read: isChairOrAdminForEventRead,
    create: isAuthenticated,
    update: isChairOfSocietyForEventDoc,
    delete: isAdmin,
  },
  hooks: {
    beforeChange: [validateRegistration],
    afterChange: [incrementOnConfirm, incrementCheckedInOnTransition, sendConfirmation],
  },
  fields: [
    { name: 'user', type: 'relationship', relationTo: 'users', required: true },
    { name: 'event', type: 'relationship', relationTo: 'events', required: true },
    { name: 'userName', type: 'text' },
    { name: 'userEmail', type: 'email' },
    { name: 'userPhone', type: 'text' },
    { name: 'formResponses', type: 'json' },
    { name: 'paymentStatus', type: 'select', defaultValue: 'pending', options: [{ label: 'Pending', value: 'pending' }, { label: 'Paid', value: 'paid' }, { label: 'Failed', value: 'failed' }, { label: 'Refunded', value: 'refunded' }, { label: 'Not Required', value: 'not_required' }] },
    { name: 'paymentAmount', type: 'number' },
    { name: 'paymentTicketId', type: 'text' },
    { name: 'registrationStatus', type: 'select', defaultValue: 'pending', options: [{ label: 'Pending', value: 'pending' }, { label: 'Confirmed', value: 'confirmed' }, { label: 'Cancelled', value: 'cancelled' }, { label: 'Expired', value: 'expired' }] },
    { name: 'registrationDate', type: 'date', admin: { readOnly: true } },
    { name: 'ticket', type: 'json', admin: { description: 'Embedded ticket data: { ticket_id, ticket_code, qr_code, is_scanned }' } },
    { name: 'checkedIn', type: 'checkbox', defaultValue: false },
    { name: 'checkedInAt', type: 'date' },
    { name: 'checkedInBy', type: 'relationship', relationTo: 'users' },
    { name: 'lastCheckInLocation', type: 'text' },
    { name: 'checkInHistory', type: 'json', admin: { description: 'Multi-location check-in timeline' } },
  ],
}
