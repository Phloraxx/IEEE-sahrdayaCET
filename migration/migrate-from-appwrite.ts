/**
 * Migration script: Appwrite → Payload CMS
 *
 * Usage:
 *   APPWRITE_ENDPOINT=https://... APPWRITE_PROJECT_ID=... APPWRITE_API_KEY=... \
 *   PAYLOAD_URL=http://localhost:3000 PAYLOAD_API_KEY=... \
 *   npx tsx migration/migrate-from-appwrite.ts
 *
 * Environment variables required:
 *   APPWRITE_ENDPOINT       - Appwrite server URL
 *   APPWRITE_PROJECT_ID     - Appwrite project ID
 *   APPWRITE_API_KEY        - Appwrite API key (server-side)
 *   PAYLOAD_URL             - New Payload server URL (default: http://localhost:3000)
 *   PAYLOAD_API_KEY         - Payload API key for admin operations
 *   APPWRITE_DATABASE_ID    - Appwrite database ID
 *
 * Collection IDs (optional, defaults used if not set):
 *   APPWRITE_SOCIETIES_COLLECTION_ID, APPWRITE_EXECOM_COLLECTION_ID,
 *   APPWRITE_MEMBERS_COLLECTION_ID, APPWRITE_EVENTS_COLLECTION_ID,
 *   APPWRITE_REGISTRATIONS_COLLECTION_ID, APPWRITE_EMAIL_LOGS_COLLECTION_ID
 */

import { Client, Databases, Users as AppwriteUsers, Query } from 'node-appwrite'

const requiredEnv = (name: string): string => {
  const val = process.env[name]
  if (!val) throw new Error(`Missing required env var: ${name}`)
  return val
}

const APPWRITE_ENDPOINT = requiredEnv('APPWRITE_ENDPOINT')
const APPWRITE_PROJECT_ID = requiredEnv('APPWRITE_PROJECT_ID')
const APPWRITE_API_KEY = requiredEnv('APPWRITE_API_KEY')
const APPWRITE_DATABASE_ID = requiredEnv('APPWRITE_DATABASE_ID')
const PAYLOAD_URL = process.env.PAYLOAD_URL || 'http://localhost:3000'

const COLLECTIONS = {
  SOCIETIES: process.env.APPWRITE_SOCIETIES_COLLECTION_ID || 'societies',
  EXECOM: process.env.APPWRITE_EXECOM_COLLECTION_ID || 'execom_members',
  MEMBERS: process.env.APPWRITE_MEMBERS_COLLECTION_ID || 'members',
  EVENTS: process.env.APPWRITE_EVENTS_COLLECTION_ID || 'events',
  REGISTRATIONS: process.env.APPWRITE_REGISTRATIONS_COLLECTION_ID || 'event_registrations',
  EMAIL_LOGS: process.env.APPWRITE_EMAIL_LOGS_COLLECTION_ID || 'email_logs',
}

const appwriteClient = new Client()
  .setEndpoint(APPWRITE_ENDPOINT)
  .setProject(APPWRITE_PROJECT_ID)
  .setKey(APPWRITE_API_KEY)

const db = new Databases(appwriteClient)
const users = new AppwriteUsers(appwriteClient)

interface MigrationResult {
  societies: number
  execom: number
  users: number
  events: number
  registrations: number
  emailLogs: number
}

async function fetchAllDocuments(collectionId: string): Promise<Record<string, unknown>[]> {
  const docs: Record<string, unknown>[] = []
  let offset = 0
  const limit = 100

  while (true) {
    const result = await db.listDocuments(APPWRITE_DATABASE_ID, collectionId, [
      Query.limit(limit),
      Query.offset(offset),
    ])
    docs.push(...result.documents.map(d => ({ ...d })))
    if (result.documents.length < limit) break
    offset += limit
  }

  return docs
}

async function postToPayload(path: string, data: unknown): Promise<Record<string, unknown> | null> {
  const url = `${PAYLOAD_URL}/api${path}`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  })

  if (!res.ok) {
    const text = await res.text()
    console.error(`  [FAIL] ${url}: ${res.status} - ${text}`)
    return null
  }

  return await res.json()
}

async function migrateSocieties(): Promise<number> {
  console.log('\n📋 Migrating societies...')
  const docs = await fetchAllDocuments(COLLECTIONS.SOCIETIES)
  let count = 0

  for (const doc of docs) {
    const payload = await postToPayload('/societies', {
      name: doc.name,
      slug: doc.slug || (doc.name as string)?.toLowerCase().replace(/\s+/g, '-'),
      bio: doc.bio || '',
    })
    if (payload) count++
  }

  console.log(`  ✅ ${count}/${docs.length} societies migrated`)
  return count
}

async function migrateExecom(societyMap: Map<string, string>): Promise<number> {
  console.log('\n📋 Migrating execom members...')
  const docs = await fetchAllDocuments(COLLECTIONS.EXECOM)
  let count = 0

  for (const doc of docs) {
    const societyId = societyMap.get(doc.society_id as string) || null
    const payload = await postToPayload('/execom', {
      name: doc.name,
      position: doc.position,
      society: societyId,
      order: doc.order || 0,
      batch: doc.batch || '',
      linkedin: doc.linkedin || '',
      email: doc.email || '',
    })
    if (payload) count++
  }

  console.log(`  ✅ ${count}/${docs.length} execom members migrated`)
  return count
}

async function migrateUsers(): Promise<{ userMap: Map<string, string> }> {
  console.log('\n📋 Migrating users...')
  const userMap = new Map<string, string>()

  try {
    const appwriteUsersResponse = await users.list([Query.limit(100)])
    let count = 0

    for (const user of appwriteUsersResponse.users) {
      const memberDocs = await db.listDocuments(APPWRITE_DATABASE_ID, COLLECTIONS.MEMBERS, [
        Query.equal('userID', user.$id),
        Query.limit(1),
      ])
      const member = memberDocs.documents[0] || {}

      const payload = await postToPayload('/users', {
        email: user.email || '',
        name: member.fullName || user.name || '',
        phone: member.phone || '',
        sahrdayaEmail: member.sahrdayaEmail || '',
        semester: member.semester || null,
        department: member.course || null,
        section: member.class || null,
        foodPreference: member.foodPreference || '',
        residence: member.residence || '',
        profileCompleted: member.profileCompleted || false,
        role: 'user',
        appwriteUserId: user.$id,
      })
      if (payload) {
        userMap.set(user.$id, payload.id as string)
        count++
      }
    }

    console.log(`  ✅ ${count}/${appwriteUsersResponse.users.length} users migrated`)
  } catch (error) {
    console.error('  ⚠️  Failed to migrate users (Appwrite Users API may not be available):', error)
  }

  return { userMap }
}

async function migrateEvents(societyMap: Map<string, string>): Promise<number> {
  console.log('\n📋 Migrating events...')
  const docs = await fetchAllDocuments(COLLECTIONS.EVENTS)
  let count = 0

  for (const doc of docs) {
    const societyId = societyMap.get(doc.society_id as string) || null
    const payload = await postToPayload('/events', {
      title: doc.title,
      slug: (doc.title as string)?.toLowerCase().replace(/\s+/g, '-') + '-' + Date.now(),
      date: doc.start_date || doc.date,
      endDate: doc.end_date || null,
      venue: doc.venue || '',
      price: doc.price || 0,
      society: societyId,
      status: doc.status || 'draft',
      maxCapacity: doc.max_capacity || 0,
      registeredCount: doc.current_registrations || 0,
      registrationOpen: doc.registration_open ?? true,
      description: doc.description || '',
      isPaid: doc.is_paid || doc.requires_payment || false,
      contactEmail: doc.contact_email || '',
      tags: doc.tags || '',
      category: doc.category || null,
      checkInEnabled: doc.check_in_enabled ?? true,
      isDeleted: doc.is_deleted || false,
    })
    if (payload) count++
  }

  console.log(`  ✅ ${count}/${docs.length} events migrated`)
  return count
}

async function migrateRegistrations(
  userMap: Map<string, string>,
  eventMap: Map<string, string>
): Promise<number> {
  console.log('\n📋 Migrating registrations...')
  const docs = await fetchAllDocuments(COLLECTIONS.REGISTRATIONS)
  let count = 0

  for (const doc of docs) {
    const userId = userMap.get(doc.user_id as string)
    const eventId = eventMap.get(doc.event_id as string)
    if (!userId || !eventId) continue

    const payload = await postToPayload('/registrations', {
      user: userId,
      event: eventId,
      userName: doc.user_name || '',
      userEmail: doc.user_email || '',
      userPhone: doc.user_phone || '',
      formResponses: doc.form_responses || doc.form_data || {},
      paymentStatus: doc.payment_status || 'pending',
      paymentAmount: doc.payment_amount || 0,
      paymentTicketId: doc.payment_ticket_id || doc.payment_reference || '',
      registrationStatus: doc.registration_status || 'confirmed',
      registrationDate: doc.registration_date || doc.$createdAt,
      ticket: doc.ticket ? (typeof doc.ticket === 'string' ? JSON.parse(doc.ticket as string) : doc.ticket) : null,
      checkedIn: !!doc.checked_in,
      checkedInAt: doc.checked_in_at || doc.check_in_time || null,
      checkInHistory: doc.check_in_history ? (typeof doc.check_in_history === 'string' ? JSON.parse(doc.check_in_history as string) : doc.check_in_history) : null,
    })
    if (payload) count++
  }

  console.log(`  ✅ ${count}/${docs.length} registrations migrated`)
  return count
}

async function migrateEmailLogs(
  registrationMap: Map<string, string>
): Promise<number> {
  console.log('\n📋 Migrating email logs...')
  try {
    const docs = await fetchAllDocuments(COLLECTIONS.EMAIL_LOGS)
    let count = 0
    for (const doc of docs) {
      const registrationId = registrationMap.get(doc.$id as string) || null
      const payload = await postToPayload('/email-logs', {
        recipient: doc.recipient || '',
        subject: doc.subject || '',
        template: doc.template || '',
        status: doc.status || 'sent',
        error: doc.error || '',
        sentAt: doc.sentAt || doc.$createdAt,
        registration: registrationId,
      })
      if (payload) count++
    }
    console.log(`  ✅ ${count}/${docs.length} email logs migrated`)
    return count
  } catch {
    console.log('  ⚠️  No email logs collection found, skipping')
    return 0
  }
}

async function main(): Promise<void> {
  console.log('🚀 Starting Appwrite → Payload migration')
  console.log(`   Appwrite: ${APPWRITE_ENDPOINT}`)
  console.log(`   Payload:  ${PAYLOAD_URL}`)

  const societyMap = new Map<string, string>()
  const eventMap = new Map<string, string>()
  const registrationMap = new Map<string, string>()

  // Step 1: Societies
  const societyCount = await migrateSocieties()

  // Step 2: Execom
  const execomCount = await migrateExecom(societyMap)

  // Step 3: Users
  const { userMap } = await migrateUsers()

  // Step 4: Events
  const eventCount = await migrateEvents(societyMap)

  // Step 5: Registrations
  const registrationCount = await migrateRegistrations(userMap, eventMap)

  // Step 6: Email logs
  const emailLogCount = await migrateEmailLogs(registrationMap)

  console.log('\n═══════════════════════════════════')
  console.log('  Migration Complete')
  console.log('═══════════════════════════════════')
  console.log(`  Societies:      ${societyCount}`)
  console.log(`  Execom:         ${execomCount}`)
  console.log(`  Users:          ${userMap.size}`)
  console.log(`  Events:         ${eventCount}`)
  console.log(`  Registrations:  ${registrationCount}`)
  console.log(`  Email logs:     ${emailLogCount}`)
  console.log('═══════════════════════════════════\n')
}

main().catch((error) => {
  console.error('Migration failed:', error)
  process.exit(1)
})
