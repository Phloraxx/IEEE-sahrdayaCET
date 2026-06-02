import type { CollectionConfig } from 'payload'

export const Execom: CollectionConfig = {
  slug: 'execom',
  admin: {
    useAsTitle: 'name',
    group: 'Content',
  },
  upload: {
    mimeTypes: ['image/*'],
    imageSizes: [
      { name: 'thumbnail', width: 200, height: 200, position: 'centre' },
    ],
    adminThumbnail: 'thumbnail',
  },
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'position', type: 'text', required: true },
    { name: 'society', type: 'relationship', relationTo: 'societies', required: true },
    { name: 'order', type: 'number' },
    { name: 'batch', type: 'text' },
    { name: 'linkedin', type: 'text' },
    { name: 'email', type: 'email' },
  ],
}
