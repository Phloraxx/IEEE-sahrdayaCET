import sharp from 'sharp'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { sqliteAdapter } from '@payloadcms/db-sqlite'
import { index, uniqueIndex } from '@payloadcms/db-sqlite/drizzle/sqlite-core'
import { buildConfig } from 'payload'
import { authjsPlugin } from 'payload-authjs'
import { nodemailerAdapter } from '@payloadcms/email-nodemailer'
import { collections } from './src/payload/collections'
import { authConfig } from './auth.config'

export default buildConfig({
  editor: lexicalEditor(),
  collections,
  serverURL: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
  secret: process.env.PAYLOAD_SECRET || '',
  db: sqliteAdapter({
    client: {
      url: process.env.DATABASE_URI || '',
    },
    wal: true,
    afterSchemaInit: [
      ({ schema, extendTable }) => {
        if (schema.tables.events) {
          extendTable({
            table: schema.tables.events,
            extraConfig: (table) => ({
              events_status_idx: index('events_status_idx').on(table.status),
              events_is_deleted_idx: index('events_is_deleted_idx').on(table.isDeleted),
              events_date_idx: index('events_date_idx').on(table.date),
            }),
          })
        }

        if (schema.tables.registrations) {
          extendTable({
            table: schema.tables.registrations,
            extraConfig: (table) => ({
              registrations_registration_status_idx: index('registrations_registration_status_idx').on(table.registrationStatus),
              registrations_payment_status_idx: index('registrations_payment_status_idx').on(table.paymentStatus),
              registrations_user_event_unique: uniqueIndex('registrations_user_event_unique').on(table.user, table.event),
            }),
          })
        }

        if (schema.tables.orders) {
          extendTable({
            table: schema.tables.orders,
            extraConfig: (table) => ({
              orders_payment_status_idx: index('orders_payment_status_idx').on(table.paymentStatus),
            }),
          })
        }

        return schema
      },
    ],
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
  cors: (process.env.CORS_ORIGINS || 'https://ieeesahrdaya.com').split(','),
  csrf: (process.env.CORS_ORIGINS || 'https://ieeesahrdaya.com').split(','),
  maxDepth: 2,
  admin: {
    theme: 'light',
    components: {
      graphics: {
        Logo: '@/payload/admin/Logo',
        Icon: '@/payload/admin/Icon',
      },
      beforeLogin: ['@/payload/admin/BeforeLogin#default'],
      views: {
        dashboard: {
          Component: '@/payload/admin/BeforeDashboard#default',
          meta: { title: 'Dashboard' },
        },
        eventDashboard: {
          Component: '@/payload/admin/views/EventDashboard#default',
          path: '/event-dashboard/:id',
          meta: { title: 'Event Dashboard' },
        },
      },
    },
    meta: {
      titleSuffix: ' | IEEE Sahrdaya SB',
      icons: [
        { url: '/favicon.svg', type: 'image/svg+xml', rel: 'icon' },
        { url: '/favicon.svg', type: 'image/svg+xml', rel: 'apple-touch-icon' },
      ],
    },
  },
  plugins: [
    authjsPlugin({
      authjsConfig: authConfig,
    }),
  ],
})
