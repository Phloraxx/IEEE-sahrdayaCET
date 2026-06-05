import type { CollectionConfig } from 'payload'
import { createDdmTicket, propagatePaymentToRegistration } from '../hooks/orders'
import { isAdmin, isAuthenticated } from '../access'

export const Orders: CollectionConfig = {
  slug: 'orders',
  admin: {
    useAsTitle: 'id',
    group: 'Events',
  },
  access: {
    read: isAdmin,
    create: isAuthenticated,
    update: isAdmin,
    delete: isAdmin,
  },
  hooks: {
    beforeChange: [createDdmTicket],
    afterChange: [propagatePaymentToRegistration],
  },
  fields: [
    { name: 'user', type: 'relationship', relationTo: 'users', required: true },
    { name: 'registration', type: 'relationship', relationTo: 'registrations', required: true },
    { name: 'amount', type: 'number', required: true },
    { name: 'paymentMethod', type: 'select', defaultValue: 'upi', options: [{ label: 'UPI', value: 'upi' }, { label: 'Cash', value: 'cash' }] },
    { name: 'paymentStatus', type: 'select', defaultValue: 'pending', options: [{ label: 'Pending', value: 'pending' }, { label: 'Paid', value: 'paid' }, { label: 'Failed', value: 'failed' }, { label: 'Refunded', value: 'refunded' }] },
    { name: 'ddmTicketId', type: 'text' },
    { name: 'ddmResponse', type: 'json' },
    { name: 'coupon', type: 'relationship', relationTo: 'coupons' },
    { name: 'discountedAmount', type: 'number' },
    { name: 'createdAt', type: 'date', admin: { readOnly: true } },
  ],
}
