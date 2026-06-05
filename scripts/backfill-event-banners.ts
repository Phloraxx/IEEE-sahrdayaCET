import { readFileSync } from 'fs'
import { join } from 'path'
import { getPayload } from 'payload'
import config from '../payload.config'

const sql = readFileSync(join(process.cwd(), 'ieee_export.sql'), 'utf-8')

const insertMatch = sql.match(/INSERT INTO `_3_database_1_collection_8` VALUES\s*([\s\S]*?);/m)
if (!insertMatch) {
  console.error('No events INSERT found in SQL')
  process.exit(1)
}

interface SqlEvent {
  title: string
  slug: string
  bannerUrl: string
  date: string
}

const eventsBlock = insertMatch[1]
const rows: SqlEvent[] = []
let depth = 0
let start = 0
for (let i = 0; i < eventsBlock.length; i++) {
  const ch = eventsBlock[i]
  if (ch === '(') {
    if (depth === 0) start = i + 1
    depth++
  } else if (ch === ')') {
    depth--
    if (depth === 0 && start > 0) {
      const text = eventsBlock.slice(start, i)
      const fields: string[] = []
      let cur = ''
      let inStr = false
      let prev = ''
      for (const c of text) {
        if (c === "'" && prev !== '\\') { inStr = !inStr; cur += c; prev = c; continue }
        if (c === ',' && !inStr) { fields.push(cur); cur = ''; prev = c; continue }
        cur += c
        prev = c
      }
      fields.push(cur)
      const clean = (f: string) => f.replace(/^'|'$/g, '').replace(/''/g, "'").replace(/\\n/g, '\n').trim()
      const fields_clean = fields.map(clean)
      const title = fields_clean[5] || ''
      const bannerUrl = fields_clean[10] || ''
      const date = fields_clean[7] || ''
      const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').replace(/['']/g, '')
      if (title && bannerUrl && bannerUrl.startsWith('http')) {
        rows.push({ title, slug, bannerUrl, date })
      }
      start = 0
    }
  }
}

console.log(`Parsed ${rows.length} events with banner URLs from SQL`)

const payload = await getPayload({ config })
let updated = 0, skipped = 0, notFound = 0

for (const r of rows) {
  const found = await payload.find({
    collection: 'events',
    where: { title: { equals: r.title } },
    limit: 1,
    overrideAccess: true,
    depth: 0,
  })
  if (!found.docs.length) {
    console.log(`  ✗ not found in DB: ${r.title}`)
    notFound++
    continue
  }
  const ev = found.docs[0]
  if (ev.bannerUrl) {
    skipped++
    continue
  }
  await payload.update({
    collection: 'events',
    id: ev.id,
    data: { bannerUrl: r.bannerUrl },
    overrideAccess: true,
  })
  console.log(`  ✓ ${r.title} → ${r.bannerUrl.slice(0, 60)}...`)
  updated++
}

console.log(`\nDone: ${updated} updated, ${skipped} skipped (already had URL), ${notFound} not found in DB`)
process.exit(0)
