import type { CollectionConfig } from 'payload'
import { isChairOrAdmin, isChairOfSociety } from '../access'

export const Events: CollectionConfig = {
  slug: 'events',
  admin: {
    useAsTitle: 'title',
    group: 'Events',
    components: {
      afterList: ['@/payload/admin/components/EventDashboardCard#default'],
    },
  },
  access: {
    read: () => true,
    create: isChairOrAdmin,
    update: isChairOfSociety,
    delete: isChairOfSociety,
  },
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'slug', type: 'text', required: true, unique: true },
    { name: 'description', type: 'textarea' },
    { name: 'date', type: 'date', required: true },
    { name: 'endDate', type: 'date' },
    { name: 'venue', type: 'text', required: true },
    { name: 'price', type: 'number', defaultValue: 0, required: true },
    { name: 'society', type: 'relationship', relationTo: 'societies', required: true },
    { name: 'banner', type: 'upload', relationTo: 'media' },
    { name: 'bannerUrl', type: 'text', admin: { description: 'External URL for banner (used if no upload)' } },
    { name: 'status', type: 'select', defaultValue: 'draft', options: [{ label: 'Draft', value: 'draft' }, { label: 'Published', value: 'published' }, { label: 'Archived', value: 'archived' }, { label: 'Completed', value: 'completed' }, { label: 'Cancelled', value: 'cancelled' }] },
    { name: 'maxCapacity', type: 'number', defaultValue: 0 },
    { name: 'registeredCount', type: 'number', defaultValue: 0, admin: { readOnly: true } },
    { name: 'checkedInCount', type: 'number', defaultValue: 0, admin: { readOnly: true } },
    { name: 'registrationOpen', type: 'checkbox', defaultValue: true },
    { name: 'registrationStart', type: 'date' },
    { name: 'registrationDeadline', type: 'date' },
    { name: 'formTemplate', type: 'json' },
    { name: 'enableWaitlist', type: 'checkbox', defaultValue: false },
    { name: 'waitlistLimit', type: 'number' },
    { name: 'waitlistCount', type: 'number', defaultValue: 0, admin: { readOnly: true } },
    { name: 'isPaid', type: 'checkbox', defaultValue: false },
    { name: 'ieeeMemberPrice', type: 'number' },
    { name: 'nonMemberPrice', type: 'number' },
    { name: 'earlyBirdPrice', type: 'number' },
    { name: 'earlyBirdDeadline', type: 'date' },
    { name: 'pricingTiers', type: 'json' },
    // TODO: planned for future pricing model — currently not read by any code path.
    // When implementing, the registration hook (validateRegistration) should
    // resolve the effective price from isPaid + these fields + earlyBirdDeadline
    // instead of always using event.price.
    { name: 'currency', type: 'text', defaultValue: 'INR' },
    { name: 'checkInEnabled', type: 'checkbox', defaultValue: true },
    { name: 'selfCheckIn', type: 'checkbox', defaultValue: false },
    { name: 'contactEmail', type: 'email' },
    { name: 'contactPhone', type: 'text' },
    { name: 'externalLink', type: 'text' },
    { name: 'tags', type: 'text' },
    { name: 'category', type: 'select', options: [{ label: 'Technical', value: 'technical' }, { label: 'Cultural', value: 'cultural' }, { label: 'Workshop', value: 'workshop' }, { label: 'Seminar', value: 'seminar' }, { label: 'Competition', value: 'competition' }, { label: 'Other', value: 'other' }] },
    { name: 'speakers', type: 'json' },
    { name: 'schedule', type: 'json' },
    { name: 'faqs', type: 'json' },
    { name: 'isDeleted', type: 'checkbox', defaultValue: false },
  ],
}
