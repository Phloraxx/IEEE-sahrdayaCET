/**
 * Migration script: imports societies, execom, and events from ieee_export.sql
 * into Payload CMS with image uploads.
 *
 * Usage: npx tsx migration/migrate-from-sql.ts
 *
 * Expects:
 *   - ieee_export.sql in project root (MariaDB dump from Appwrite)
 *   - public/Societies/, public/Execom/, public/Events/ with image files
 */

import { readFileSync, existsSync, readdirSync } from 'fs'
import { join, dirname, extname, basename } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const publicDir = join(root, 'public')

async function uploadMedia(
  payload: any,
  filePath: string,
  alt: string
): Promise<{ id: number; url: string } | null> {
  if (!filePath || !existsSync(filePath)) return null
  try {
    const buffer = readFileSync(filePath)
    const ext = extname(filePath).toLowerCase()
    const mime: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' }
    const originalName = basename(filePath).replace(/[^a-zA-Z0-9._-]/g, '_').toLowerCase()
    const result = await payload.create({
      collection: 'media',
      data: { alt },
      file: { data: buffer, name: originalName, mimetype: mime[ext] || 'image/jpeg', size: buffer.length },
      overrideAccess: true,
    })
    const fullUrl = result.url as string
    const url = fullUrl ? fullUrl.replace(/^https?:\/\/[^\/]+/, '') : fullUrl
    return { id: result.id as number, url }
  } catch (e) {
    console.error(`\n  [upload fail] ${filePath.slice(-40)}: ${String(e).slice(0, 100)}`)
    return null
  }
}

function findFile(baseDir: string, relativePath: string): string | null {
  if (!relativePath) return null
  const full = join(baseDir, relativePath.replace(/^\//, ''))
  if (existsSync(full)) return full
  const parts = relativePath.replace(/^\//, '').split('/')
  let current = baseDir
  for (const part of parts) {
    try {
      const entries = readdirSync(current, { withFileTypes: true })
      const match = entries.find(e => e.name.toLowerCase() === part.toLowerCase())
      if (!match) return null
      current = join(current, match.name)
    } catch {
      return null
    }
  }
  return existsSync(current) ? current : null
}

function extractEmail(raw: string | null | undefined): string | undefined {
  if (!raw || typeof raw !== 'string') return undefined
  const match = raw.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)
  if (match) return match[0]
  if (raw.includes('@')) return raw.trim()
  return undefined
}

function parseSQLValues(sql: string, tableSuffix: string): Record<string, string>[] {
  const rows: Record<string, string>[] = []
  const tableName = `_3_database_1_collection_${tableSuffix}`
  const regex = new RegExp(`INSERT INTO \`${tableName}\` VALUES\\s*([\\s\\S]*?);`, 'm')
  const match = regex.exec(sql)
  if (!match) return rows

  const allValuesText = match[1].trim()
  const names = getColumnNames(sql, tableSuffix)

  let depth = 0
  let start = 0
  for (let i = 0; i < allValuesText.length; i++) {
    const ch = allValuesText[i]
    if (ch === '(') {
      if (depth === 0) start = i + 1
      depth++
    } else if (ch === ')') {
      depth--
      if (depth === 0 && start > 0) {
        const rowText = allValuesText.slice(start, i)
        const fields: string[] = []
        let current = ''
        let inString = false
        let prevChar = ''
        for (const ch2 of rowText) {
          if (ch2 === "'" && prevChar !== '\\') { inString = !inString; current += ch2; prevChar = ch2; continue }
          if (ch2 === ',' && !inString) { fields.push(current); current = ''; prevChar = ch2; continue }
          current += ch2
          prevChar = ch2
        }
        fields.push(current)

        const row: Record<string, string> = {}
        let colIdx = 0
        for (const field of fields) {
          const name = names[colIdx] || `col${colIdx}`
          const val = field.startsWith("'") && field.endsWith("'") ? field.slice(1, -1) : field
          if (!name.startsWith('_') || name === '_uid') {
            const cleaned = val.replace(/''/g, "'").replace(/\\n/g, '\n').trim()
            row[name] = cleaned === 'NULL' || cleaned === '' ? '' : cleaned
          }
          colIdx++
        }
        rows.push(row)
      }
    }
  }
  return rows
}

function getColumnNames(sql: string, tableSuffix: string): string[] {
  const tableName = `_3_database_1_collection_${tableSuffix}`
  const regex = new RegExp(`CREATE TABLE \`${tableName}\`\\s*\\(([\\s\\S]*?)\\)\\s*ENGINE=`)
  const match = regex.exec(sql)
  if (!match) return []
  const colDefs = match[1]
  const names: string[] = []
  for (const line of colDefs.split('\n')) {
    const m = line.match(/^\s*`(\w+)`/)
    if (m) names.push(m[1])
  }
  return names
}

async function main() {
  const sqlPath = join(root, 'ieee_export.sql')
  if (!existsSync(sqlPath)) {
    console.error('❌ ieee_export.sql not found in project root')
    process.exit(1)
  }

  const sql = readFileSync(sqlPath, 'utf-8')

  const { getPayload } = await import('payload')
  const { default: payloadConfig } = await import('@payload-config')
  const payload = await getPayload({ config: payloadConfig })

  // ============================
  // 0. SB SOCIETY (first entry)
  // ============================
  console.log('\n📋 Creating SB society...')
  const appwriteUidToPayloadId: Record<string, number> = {}
  const slugToPayloadId: Record<string, number> = {}

  const sbExisting = await payload.find({ collection: 'societies', where: { slug: { equals: 'sb' } }, depth: 0 })
  let sbPid: number
  if (sbExisting.docs.length > 0) {
    sbPid = sbExisting.docs[0].id as number
    console.log('  ⏭  IEEE Sahrdaya SB (already exists)')
  } else {
    const sb = await payload.create({
      collection: 'societies',
      data: { name: 'IEEE Sahrdaya SB', slug: 'sb', bio: 'IEEE Sahrdaya Student Branch Core' },
      overrideAccess: true,
    })
    sbPid = sb.id as number
    console.log('  ✅ IEEE Sahrdaya SB')
  }
  appwriteUidToPayloadId['SB'] = sbPid
  slugToPayloadId['core'] = sbPid

  // ============================
  // 1. SOCIETIES
  // ============================
  console.log('\n📋 Migrating societies...')
  const societyRows = parseSQLValues(sql, '5')
  let societyCount = 0

  for (const row of societyRows) {
    const uid = row._uid || ''
    const name = row.name || ''
    let slug = row.slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    if (!slug) slug = `society-${Date.now()}`

    const existing = await payload.find({ collection: 'societies', where: { slug: { equals: slug } }, depth: 0 })
    if (existing.docs.length > 0) {
      const pid = existing.docs[0].id as number
      appwriteUidToPayloadId[uid] = pid
      slugToPayloadId[slug] = pid
      console.log(`  ⏭  ${name} (already exists)`)
      societyCount++
      continue
    }

    let logoResult: { id: number; url: string } | null = null
    if (row.logo_url) {
      const filePath = findFile(publicDir, row.logo_url)
      if (filePath) logoResult = await uploadMedia(payload, filePath, `${name} logo`)
    }

    const data: Record<string, unknown> = { name, slug, bio: row.bio || '' }
    if (logoResult) { data.logo = logoResult.id; }

    try {
      const c = await payload.create({ collection: 'societies', data, overrideAccess: true })
      const pid = c.id as number
      appwriteUidToPayloadId[uid] = pid
      slugToPayloadId[slug] = pid
      societyCount++
      console.log(`  ✅ ${name}${logoResult ? ' +logo' : ''}`)
    } catch (e) {
      console.error(`  ❌ ${name}: ${String(e).slice(0, 400)}`)
    }
  }
  console.log(`  ${societyCount}/${societyRows.length} societies`)

  // ============================
  // 2. EXECOM
  // ============================
  console.log('\n📋 Migrating execom...')
  const execomRows = parseSQLValues(sql, '9')
  let execomCount = 0

  for (const row of execomRows) {
    const name = row.name || ''
    const sectionId = row.sectionId || ''
    const societyPid = slugToPayloadId[sectionId] || undefined
    const email = extractEmail(row.email)

    let photoResult: { id: number; url: string } | null = null
    if (row.photoUrl) {
      const filePath = findFile(publicDir, row.photoUrl)
      if (filePath) photoResult = await uploadMedia(payload, filePath, name)
    }

    const execomData: Record<string, unknown> = {
      name,
      position: row.position || '',
      sectionId: row.sectionId || '',
      order: Number(row.slNo) || 0,
      batch: row.semester || '',
      department: row.department || '',
      linkedin: row.linkedin || '',
      phone: row.phone || '',
    }
    if (societyPid) execomData.society = societyPid
    if (photoResult) { execomData.photo = photoResult.id; }
    if (email) execomData.email = email

    try {
      await payload.create({ collection: 'execom', data: execomData, overrideAccess: true })
      execomCount++
      process.stdout.write('.')
    } catch (e) {
      const msg = String(e).slice(0, 200)
      if (msg.includes('email') || msg.includes('Email')) {
        delete execomData.email
        try {
          await payload.create({ collection: 'execom', data: execomData, overrideAccess: true })
          execomCount++
          process.stdout.write('·')
        } catch {
          process.stdout.write('x')
        }
      } else {
        process.stdout.write('x')
      }
    }
  }
  console.log(`\n  ${execomCount}/${execomRows.length} execom members`)

  // ============================
  // 3. EVENTS
  // ============================
  console.log('\n📋 Migrating events...')
  const eventRows = parseSQLValues(sql, '8')
  let eventCount = 0

  for (const row of eventRows) {
    const title = row.title || ''
    const slug = ((row.title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80)) + '-' + Date.now()
    const societyPid = appwriteUidToPayloadId[row.society_id || ''] || undefined
    const price = Number(row.price) || 0

    let bannerResult: { id: number; url: string } | null = null
    const bannerUrl = row.banner_url || ''
    if (bannerUrl && !bannerUrl.startsWith('http')) {
      const filePath = findFile(publicDir, bannerUrl)
      if (filePath) bannerResult = await uploadMedia(payload, filePath, title)
    }

    const validStatuses = ['draft', 'published', 'archived', 'completed', 'cancelled']
    const rawStatus = (row.status || 'draft').toLowerCase()
    const status = validStatuses.includes(rawStatus) ? rawStatus : 'draft'
    const endDateVal = row.end_date ? row.end_date : undefined
    const email = extractEmail(row.contact_email)

    if (!societyPid) {
      console.log(`\n  ⏭  ${title.slice(0, 30)} (no society mapping)`)
      continue
    }

    const eventData: Record<string, unknown> = {
      title,
      slug,
      date: row.date || new Date().toISOString(),
      venue: row.venue || 'TBA',
      price,
      society: societyPid,
      status,
      maxCapacity: Number(row.max_capacity) || 0,
      registeredCount: Number(row.current_registrations) || 0,
      registrationOpen: row.registration_open === '1',
      description: row.description || '',
      isPaid: price > 0,
      tags: row.tags || '',
      checkInEnabled: row.check_in_enabled !== '0',
      isDeleted: row.is_deleted === '1',
    }
    if (endDateVal && endDateVal !== 'NULL') eventData.endDate = endDateVal
    if (bannerResult) { eventData.banner = bannerResult.id; }
    if (email) eventData.contactEmail = email
    if (row.category && row.category !== 'NULL') eventData.category = row.category

    try {
      await payload.create({ collection: 'events', data: eventData, overrideAccess: true })
      eventCount++
      process.stdout.write('.')
    } catch (e) {
      const msg = String(e).slice(0, 150)
      process.stdout.write('x')
      if (eventCount < 3) {
        console.log(`\n  ❌ ${title.slice(0, 30)}: ${msg}`)
      }
    }
  }
  console.log(`\n  ${eventCount}/${eventRows.length} events`)

  console.log('\n═══════════════════════════════')
  console.log(`  Societies:     ${societyCount + 1}`)
  console.log(`  Execom:        ${execomCount}`)
  console.log(`  Events:        ${eventCount}`)
  console.log('═══════════════════════════════\n')
  process.exit(0)
}

main().catch((e) => {
  console.error('Migration failed:', e)
  process.exit(1)
})
