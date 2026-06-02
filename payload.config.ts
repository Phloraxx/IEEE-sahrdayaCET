import sharp from 'sharp'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { sqliteAdapter } from '@payloadcms/db-sqlite'
import { buildConfig } from 'payload'
import { authjsPlugin } from 'payload-authjs'
import { nodemailerAdapter } from '@payloadcms/email-nodemailer'
import { collections } from './src/payload/collections'
import { authConfig } from './auth.config'

export default buildConfig({
  editor: lexicalEditor(),
  collections,
  secret: process.env.PAYLOAD_SECRET || '',
  db: sqliteAdapter({
    client: {
      url: process.env.DATABASE_URI || '',
    },
  }),
  email: process.env.SMTP_HOST
    ? nodemailerAdapter({
        defaultFromAddress: 'noreply@ieeesahrdaya.com',
        defaultFromName: 'IEEE Sahrdaya SB',
        transportOptions: {
          host: process.env.SMTP_HOST,
          port: Number(process.env.SMTP_PORT) || 587,
          auth: {
            user: process.env.SMTP_USER || '',
            pass: process.env.SMTP_PASS || '',
          },
        },
      })
    : undefined,
  sharp,
  graphQL: {
    disable: true,
  },
  cors: ['http://localhost:3000', 'https://ieeesahrdaya.com'],
  csrf: ['http://localhost:3000', 'https://ieeesahrdaya.com'],
  maxDepth: 2,
  plugins: [
    authjsPlugin({
      authjsConfig: authConfig,
    }),
  ],
})
