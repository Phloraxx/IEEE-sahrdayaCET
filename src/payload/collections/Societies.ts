import type { CollectionConfig } from 'payload'
import { isChairOfSociety } from '../access'

export const Societies: CollectionConfig = {
  slug: 'societies',
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
    { name: 'name', type: 'text', required: true, unique: true },
    { name: 'slug', type: 'text', required: true, unique: true },
    { name: 'bio', type: 'textarea' },
    { name: 'logo', type: 'upload', relationTo: 'media' },
    { name: 'banner', type: 'upload', relationTo: 'media' },
    { name: 'isHidden', type: 'checkbox', defaultValue: false, admin: { position: 'sidebar' } },
    { name: 'displayOrder', type: 'number', admin: { position: 'sidebar' } },
    { name: 'chairs', type: 'relationship', relationTo: 'users', hasMany: true },
  ],
}
