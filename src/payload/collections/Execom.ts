import type { CollectionConfig } from 'payload'

export const Execom: CollectionConfig = {
  slug: 'execom',
  admin: {
    useAsTitle: 'name',
    group: 'Content',
  },
  access: {
    read: () => true,
    create: ({ req: { user } }) => user?.role === 'admin',
    update: ({ req: { user } }) => user?.role === 'admin',
    delete: ({ req: { user } }) => user?.role === 'admin',
  },
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'position', type: 'text', required: true },
    { name: 'society', type: 'relationship', relationTo: 'societies' },
    { name: 'photo', type: 'upload', relationTo: 'media' },
    { name: 'photoUrl', type: 'text', admin: { hidden: true } },
    { name: 'sectionId', type: 'text', index: true },
    { name: 'order', type: 'number' },
    { name: 'batch', type: 'text' },
    { name: 'department', type: 'text' },
    { name: 'linkedin', type: 'text' },
    { name: 'email', type: 'email' },
    { name: 'phone', type: 'text' },
  ],
}
