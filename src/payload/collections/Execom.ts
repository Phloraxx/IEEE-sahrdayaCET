import type { CollectionConfig } from 'payload'
import { isChairOfSociety } from '../access'

export const Execom: CollectionConfig = {
  slug: 'execom',
  admin: {
    useAsTitle: 'name',
    group: 'Team',
  },
  access: {
    read: () => true,
    create: ({ req: { user } }) => user?.role === 'admin',
    update: isChairOfSociety,
    delete: ({ req: { user } }) => user?.role === 'admin',
  },
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'position', type: 'text', required: true },
    { name: 'society', type: 'relationship', relationTo: 'societies' },
    { name: 'photo', type: 'upload', relationTo: 'media' },
    { name: 'sectionId', type: 'text', index: true },
    { name: 'order', type: 'number' },
    { name: 'batch', type: 'text' },
    { name: 'department', type: 'text' },
    { name: 'linkedin', type: 'text' },
    { name: 'email', type: 'email' },
    { name: 'phone', type: 'text' },
  ],
}
