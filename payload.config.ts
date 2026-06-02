import sharp from 'sharp'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { sqliteAdapter } from '@payloadcms/db-sqlite'
import { buildConfig } from 'payload'
import { collections } from './src/payload/collections'

export default buildConfig({
  editor: lexicalEditor(),
  collections,
  secret: process.env.PAYLOAD_SECRET || '',
  db: sqliteAdapter({
    client: {
      url: process.env.DATABASE_URI || '',
    },
  }),
  sharp,
  graphQL: {
    disable: true,
  },
  cors: ['http://localhost:3000', 'https://ieeesahrdaya.com'],
  csrf: ['http://localhost:3000', 'https://ieeesahrdaya.com'],
  maxDepth: 2,
})
