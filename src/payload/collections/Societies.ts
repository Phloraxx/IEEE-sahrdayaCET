import type { CollectionConfig } from 'payload'

export const Societies: CollectionConfig = {
  slug: 'societies',
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
    { name: 'name', type: 'text', required: true, unique: true },
    { name: 'slug', type: 'text', required: true, unique: true },
    { name: 'bio', type: 'textarea' },
    { name: 'logo', type: 'upload', relationTo: 'media' },
    { name: 'logoUrl', type: 'text', admin: { hidden: true } },
    { name: 'banner', type: 'upload', relationTo: 'media' },
    { name: 'bannerUrl', type: 'text', admin: { hidden: true } },
    { name: 'chairs', type: 'relationship', relationTo: 'users', hasMany: true },
  ],
}
