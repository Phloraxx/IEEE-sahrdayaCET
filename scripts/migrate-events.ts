import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const PB_URL = process.env.POCKETBASE_URL || process.env.PB_URL || 'http://127.0.0.1:8090'
const PB_ADMIN_EMAIL = process.env.PB_ADMIN_EMAIL!
const PB_ADMIN_PASSWORD = process.env.PB_ADMIN_PASSWORD!
const PB_SUPERUSER_TOKEN = process.env.POCKETBASE_SUPERUSER_TOKEN!

let AUTH_TOKEN = ''

function tmpFile(ext: string): string {
  const dir = execSync('echo %TEMP%', { encoding: 'utf-8', shell: true }).trim()
  return path.join(dir, `pb_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`)
}

function run(method: string, endpoint: string, opts?: { body?: string; files?: Record<string, string> }): string {
  const headers = ['Content-Type: application/json']
  if (AUTH_TOKEN) headers.push(`Authorization: Bearer ${AUTH_TOKEN}`)
  const hf = headers.map(h => `-H "${h}"`).join(' ')

  let dataFlag = ''
  let formFlags = ''
  if (opts?.body) {
    const fp = tmpFile('json')
    fs.writeFileSync(fp, opts.body)
    dataFlag = `-d @"${fp}"`
  }
  if (opts?.files) {
    for (const [k, v] of Object.entries(opts.files)) {
      formFlags += ` -F "${k}=${v}"`
    }
  }

  const cmd = `curl -s -X ${method} ${hf} ${dataFlag} "${PB_URL}${endpoint}"${formFlags}`
  const out = execSync(cmd, { encoding: 'utf-8', timeout: 60000, shell: true })
  try {
    const parsed = JSON.parse(out)
    if (parsed.status && parsed.status >= 400) {
      throw new Error(`PB API error (${parsed.status}): ${parsed.message || JSON.stringify(parsed.data)}`)
    }
    if (parsed.code && parsed.code >= 400) {
      throw new Error(`PB API error (${parsed.code}): ${parsed.message || JSON.stringify(parsed.data)}`)
    }
  } catch (e: any) {
    if (e.message?.startsWith('PB API error')) throw e
  }
  return out
}

function pbGet(endpoint: string): any {
  return JSON.parse(run('GET', endpoint))
}

function pbPost(endpoint: string, body: object): any {
  return JSON.parse(run('POST', endpoint, { body: JSON.stringify(body) }))
}

function checkPberror(out: string): void {
  try {
    const parsed = JSON.parse(out)
    if (parsed.code && parsed.code >= 400) {
      throw new Error(`PB API error (${parsed.code}): ${parsed.message || JSON.stringify(parsed.data)}`)
    }
  } catch (e: any) {
    if (e.message?.startsWith('PB API error')) throw e
  }
}

function pbFormPost(endpoint: string, fields: Record<string, string | { path: string; mime: string }>): any {
  const parts: string[] = []
  const cleanup: string[] = []
  for (const [k, v] of Object.entries(fields)) {
    if (typeof v === 'string') {
      const fp = tmpFile('txt')
      fs.writeFileSync(fp, v, 'utf-8')
      cleanup.push(fp)
      parts.push(`-F "${k}=<${fp}"`)
    } else {
      parts.push(`-F "${k}=@${v.path};type=${v.mime}"`)
    }
  }
  const ff = parts.join(' ')
  const headers = [`Authorization: Bearer ${AUTH_TOKEN}`]
  const hf = headers.map(h => `-H "${h}"`).join(' ')
  const cmd = `curl -s -X POST ${hf} "${PB_URL}${endpoint}" ${ff}`
  let out: string
  try {
    out = execSync(cmd, { encoding: 'utf-8', timeout: 60000, shell: true })
  } finally {
    for (const fp of cleanup) {
      try { if (fs.existsSync(fp)) fs.unlinkSync(fp) } catch {}
    }
  }
  checkPberror(out)
  return JSON.parse(out)
}

function pbPostWithCheck(endpoint: string, body: object): any {
  const fp = tmpFile('json')
  fs.writeFileSync(fp, JSON.stringify(body), 'utf-8')
  const headers = [`Content-Type: application/json`, `Authorization: Bearer ${AUTH_TOKEN}`]
  const hf = headers.map(h => `-H "${h}"`).join(' ')
  const cmd = `curl -s -X POST ${hf} -d @"${fp}" "${PB_URL}${endpoint}"`
  try {
    const out = execSync(cmd, { encoding: 'utf-8', timeout: 60000, shell: true })
    checkPberror(out)
    return JSON.parse(out)
  } finally {
    try { if (fs.existsSync(fp)) fs.unlinkSync(fp) } catch {}
  }
}

// --- SQL Parser ---
function readSQL(filePath: string) {
  const raw = fs.readFileSync(filePath, 'utf-8')

  function extractTable(tableName: string): string[][] {
    const marker = `INSERT INTO \`${tableName}\` VALUES`
    let start = raw.indexOf(marker)
    if (start === -1) return []
    start = raw.indexOf('(', start)
    if (start === -1) return []

    let end = raw.indexOf('/*!40000 ALTER TABLE', start)
    if (end === -1) end = raw.indexOf('UNLOCK TABLES', start)
    if (end === -1) end = raw.length

    const block = raw.slice(start, end)
    const rows: string[][] = []
    let i = 0
    while (i < block.length) {
      if (block[i] === '(') {
        let depth = 1, j = i + 1
        while (j < block.length && depth > 0) {
          if (block[j] === "'") {
            j++
            while (j < block.length && block[j] !== "'") {
              if (block[j] === '\\') j++
              j++
            }
          } else if (block[j] === '(') depth++
          else if (block[j] === ')') depth--
          j++
        }
        rows.push(parseRow(block.slice(i + 1, j - 1)))
        i = j
      } else i++
    }
    return rows
  }

  function parseRow(s: string): string[] {
    const vals: string[] = []
    let cur = '', inQ = false
    for (let i = 0; i < s.length; i++) {
      const ch = s[i]
      if (ch === "'" && !inQ) { inQ = true; continue }
      if (ch === "'" && inQ) { inQ = false; continue }
      if (ch === '\\' && inQ) { cur += s[++i]; continue }
      if (ch === ',' && !inQ) { vals.push(cur.trim()); cur = ''; continue }
      if (inQ) cur += ch
    }
    if (cur.trim()) vals.push(cur.trim())
    return vals
  }

  return {
    societies: extractTable('_3_database_1_collection_5'),
    events: extractTable('_3_database_1_collection_8'),
  }
}

// Appwrite document UID → society slug
const APPWRITE_SLUG_MAP: Record<string, string | null> = {
  '699588900008bffcb2d1': 'cs',
  '69958890001d23480eeb': 'ras',
  '69958890003135f35f0b': 'wie',
  '69958891000666bcd7e2': 'ias',
  '69958891002d0f991342': 'pes',
  '6995889200029b375197': 'sight',
  '699588920015ce8fc81b': 'embs',
  '69958892002a096493b5': 'sps',
  '699588930000d821e360': 'cas',
  '69958893001494f61313': 'css',
  '69958893002b079465d9': 'edsoc',
  '69958893003e0d1997ef': 'ies',
  '69958894001695828ca5': 'npss',
  '69958894002a5c757f2e': 'ps',
  SB: null,  // Student Branch-level events (AGM, ADSSSC) — no society link
}

function slugify(title: string): string {
  return title
    .replace(/\u200B/g, '')       // strip zero-width spaces
    .replace(/['']/g, '')          // strip typographic apostrophes
    .replace(/[^a-zA-Z0-9\s-]/g, '')  // remove non-alphanumeric (except spaces/hyphens)
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .toLowerCase()
    .replace(/^-+|-+$/g, '')
}

function downloadImage(url: string, tmpPath: string): { path: string; mime: string } | null {
  try {
    const httpCode = execSync(`curl -L -s -o "${tmpPath}" -w "%{http_code}" "${url}"`, { encoding: 'utf-8', timeout: 30000, shell: true }).trim()
    if (httpCode !== '200' || !fs.existsSync(tmpPath) || fs.statSync(tmpPath).size === 0) return null
    const ext = path.extname(url).split('?')[0].toLowerCase()
    const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg'
    return { path: tmpPath, mime }
  } catch {
    return null
  }
}

async function main() {
  if (!PB_SUPERUSER_TOKEN && (!PB_ADMIN_EMAIL || !PB_ADMIN_PASSWORD)) {
    console.error('Set POCKETBASE_SUPERUSER_TOKEN or PB_ADMIN_EMAIL + PB_ADMIN_PASSWORD')
    process.exit(1)
  }

  const { societies, events } = readSQL(path.resolve(__dirname, '..', 'ieee_export.sql'))
  console.log(`Parsed ${societies.length} societies, ${events.length} events`)

  // Authenticate
  if (PB_SUPERUSER_TOKEN) {
    console.log('\nUsing superuser token...')
    AUTH_TOKEN = PB_SUPERUSER_TOKEN
  } else if (PB_ADMIN_EMAIL && PB_ADMIN_PASSWORD) {
    console.log('\nLogging in as admin...')
    const loginRes = JSON.parse(run('POST', '/api/collections/_superusers/auth-with-password', {
      body: JSON.stringify({ identity: PB_ADMIN_EMAIL, password: PB_ADMIN_PASSWORD }),
    }))
    AUTH_TOKEN = loginRes.token
    console.log('OK:', loginRes.record?.email || 'unknown')
  } else {
    console.error('Set POCKETBASE_SUPERUSER_TOKEN or PB_ADMIN_EMAIL + PB_ADMIN_PASSWORD')
    process.exit(1)
  }

  // Fetch current PB societies
  console.log('\nFetching current societies from PB...')
  const pbSocs = pbGet('/api/collections/societies/records?perPage=100')
  const slugToId: Record<string, string> = {}
  for (const s of pbSocs.items) slugToId[s.slug] = s.id
  console.log(`  Found ${Object.keys(slugToId).length} societies in PB`)

  // Check for existing events to avoid duplicates
  const existing = pbGet('/api/collections/events/records?perPage=200') as { items: Array<{ slug: string; id: string }> }
  const existingSlugs = new Set(existing.items.map(e => e.slug))
  console.log(`  ${existing.items.length} events already in PB`)

  // Import events
  console.log('\nImporting events...')
  let imported = 0
  let skipped = 0
  let bannerSuccess = 0
  let bannerFailed = 0

  for (let idx = 0; idx < events.length; idx++) {
    const row = events[idx]

    const title = row[5] || ''
    if (!title) { skipped++; continue }

    const slug = slugify(title)
    const description = (row[6] || '').replace(/\u200B/g, '')
    const date = row[7] || ''
    const endDate = row[22] || ''
    const venue = (row[8] === 'NULL' || row[8] === '') ? 'TBD' : row[8] || 'TBD'
    const price = row[9] === 'NULL' || row[9] === '' ? '0' : row[9]
    const bannerUrl = row[10] === 'NULL' ? '' : row[10] || ''
    const societyId = row[11] === 'NULL' ? '' : row[11] || ''
    const status = row[12] === 'NULL' ? 'draft' : row[12] || 'draft'
    const maxCapacity = row[13] === 'NULL' || row[13] === '' ? '' : row[13]
    const registrationStart = row[14] === 'NULL' ? '' : row[14] || ''
    const registrationDeadline = row[15] === 'NULL' ? '' : row[15] || ''
    const registrationOpen = row[16] === '1' ? 'true' : 'false'
    const checkInEnabled = row[26] === '1' ? 'true' : 'false'
    const contactEmail = row[28] === 'NULL' ? '' : row[28] || ''
    const contactPhone = row[29] === 'NULL' ? '' : row[29] || ''
    const tags = row[30] === 'NULL' ? '' : row[30] || ''
    const isDeleted = row[32] === '1' ? 'true' : 'false'

    // Society mapping — SB-level events default to Computer Society (cs)
    let pbSocietyId = ''
    if (societyId && APPWRITE_SLUG_MAP[societyId] !== undefined) {
      const societySlug = APPWRITE_SLUG_MAP[societyId]
      if (societySlug) {
        pbSocietyId = slugToId[societySlug] || ''
      } else {
        // society_id = 'SB' → assign to Computer Society as default
        pbSocietyId = slugToId['cs'] || ''
      }
    } else if (societyId) {
      // Unknown society UID → default to CS
      pbSocietyId = slugToId['cs'] || ''
    }

    // Unique slug
    let finalSlug = slug
    if (!finalSlug) finalSlug = `event-${row[0] || idx}`
    if (existingSlugs.has(finalSlug)) {
      let counter = 2
      while (existingSlugs.has(`${finalSlug}-${counter}`)) counter++
      finalSlug = `${finalSlug}-${counter}`
    }
    existingSlugs.add(finalSlug)

    // Build fields
    const fields: Record<string, string | { path: string; mime: string }> = {
      title,
      slug: finalSlug,
      description,
      date,
      price,
      status,
      registrationOpen,
      checkInEnabled,
      isDeleted,
    }

    if (endDate) fields.endDate = endDate
    fields.venue = venue
    if (pbSocietyId) fields.society = pbSocietyId
    if (maxCapacity) fields.maxCapacity = maxCapacity
    if (registrationStart) fields.registrationStart = registrationStart
    if (registrationDeadline) fields.registrationDeadline = registrationDeadline
    if (contactEmail) fields.contactEmail = contactEmail
    if (contactPhone) fields.contactPhone = contactPhone
    if (tags) fields.tags = tags

    // Download banner
    let bannerFile: { path: string; mime: string } | null = null
    if (bannerUrl && (bannerUrl.startsWith('http://') || bannerUrl.startsWith('https://'))) {
      const rawExt = path.extname(bannerUrl).split('?')[0].toLowerCase()
      const cleanExt = rawExt.startsWith('.') ? rawExt.slice(1) : rawExt || 'jpg'
      const tmpPath = tmpFile(cleanExt)
      bannerFile = downloadImage(bannerUrl, tmpPath)
      if (bannerFile) {
        fields.banner = bannerFile
        bannerSuccess++
      } else {
        bannerFailed++
        try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath) } catch {}
      }
    }

    try {
      if (bannerFile) {
        pbFormPost('/api/collections/events/records', fields)
      } else {
        pbPostWithCheck('/api/collections/events/records', JSON.parse(JSON.stringify(fields)))
      }
      imported++
      if (imported % 5 === 0 || imported === 1) {
        console.log(`  [${imported}/${events.length}] ${title.slice(0, 50)}...`)
      }
    } catch (err: any) {
      console.error(`  FAILED: ${title} — ${err.message}`)
      skipped++
    } finally {
      // Clean up temp banner file
      if (bannerFile && fs.existsSync(bannerFile.path)) {
        try { fs.unlinkSync(bannerFile.path) } catch {}
      }
    }
  }

  console.log(`\nDone! Imported: ${imported}, Skipped: ${skipped}, Banners: ${bannerSuccess} OK, ${bannerFailed} failed`)
}

main().catch(err => { console.error(err); process.exit(1) })
