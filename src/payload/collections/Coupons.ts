import type { CollectionConfig } from 'payload'

export const Coupons: CollectionConfig = {
  slug: 'coupons',
  admin: {
    useAsTitle: 'code',
    group: 'Events',
  },
  fields: [
    { name: 'code', type: 'text', required: true, unique: true },
    {
      name: 'discountType',
      type: 'select',
      required: true,
      options: [
        { label: 'Percentage', value: 'percentage' },
        { label: 'Fixed', value: 'fixed' },
      ],
    },
    { name: 'discountValue', type: 'number', required: true },
    { name: 'maxUses', type: 'number' },
    { name: 'usedCount', type: 'number', defaultValue: 0, admin: { readOnly: true } },
    { name: 'expiresAt', type: 'date' },
    { name: 'event', type: 'relationship', relationTo: 'events' },
    { name: 'isActive', type: 'checkbox', defaultValue: true },
  ],
}
