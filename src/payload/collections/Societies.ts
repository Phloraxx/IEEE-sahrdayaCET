import type { CollectionConfig } from 'payload'

export const Societies: CollectionConfig = {
  slug: 'societies',
  admin: {
    useAsTitle: 'name',
    group: 'Content',
  },
  upload: {
    mimeTypes: ['image/*'],
    imageSizes: [
      { name: 'thumbnail', width: 400, height: 300, position: 'centre' },
      { name: 'card', width: 768, height: 1024, position: 'centre' },
    ],
    adminThumbnail: 'thumbnail',
  },
  fields: [
    { name: 'name', type: 'text', required: true, unique: true },
    { name: 'slug', type: 'text', required: true, unique: true, admin: { readOnly: true } },
    { name: 'bio', type: 'textarea' },
    { name: 'chairs', type: 'relationship', relationTo: 'users', hasMany: true },
  ],
}
