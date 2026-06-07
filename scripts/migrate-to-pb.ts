import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const PB_URL = process.env.PB_URL || 'http://127.0.0.1:8090'
const PB_ADMIN_EMAIL = process.env.PB_ADMIN_EMAIL!
const PB_ADMIN_PASSWORD = process.env.PB_ADMIN_PASSWORD!
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID!
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!

let AUTH_TOKEN = ''

function tmpFile(ext: string): string {
  const dir = execSync('echo %TEMP%', { encoding: 'utf-8', shell: true }).trim()
  return path.join(dir, `pb_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`)
}

function run(method: string, endpoint: string, opts?: { body?: string; files?: Record<string, string> }): string {
  const headers = [`Content-Type: application/json`]
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
  // Check for PB error response
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

function pbPatch(endpoint: string, body: object): any {
  return JSON.parse(run('PATCH', endpoint, { body: JSON.stringify(body) }))
}

function pbFormPost(endpoint: string, fields: Record<string, string | { path: string; mime: string }>): any {
  const files: Record<string, string> = {}
  let hasJson = false
  const jsonFields: Record<string, string> = {}
  for (const [k, v] of Object.entries(fields)) {
    if (typeof v === 'string') {
      jsonFields[k] = v
    } else {
      hasJson = true
      files[k] = `@${v.path};type=${v.mime}`
    }
  }

  if (hasJson) {
    // Mix text fields into JSON body, send file fields separately via -F
    const fp = tmpFile('json')
    fs.writeFileSync(fp, JSON.stringify(jsonFields))
    const headers = [`Content-Type: application/json`]
    if (AUTH_TOKEN) headers.push(`Authorization: Bearer ${AUTH_TOKEN}`)
    const hf = headers.map(h => `-H "${h}"`).join(' ')
    const ff = Object.entries(files).map(([k, v]) => `-F "${k}=${v}"`).join(' ')
    // Need to pass both -d and -F, but curl doesn't support that.
    // Instead, send all as -F fields (both text and file)
  }

  // Send everything as multipart form fields
  const allForm: Record<string, string> = {}
  for (const [k, v] of Object.entries(fields)) {
    if (typeof v === 'string') {
      allForm[k] = v
    } else {
      allForm[k] = `@${v.path};type=${v.mime}`
    }
  }
  const ff = Object.entries(allForm).map(([k, v]) => `-F "${k}=${v}"`).join(' ')
  const headers = [`Authorization: Bearer ${AUTH_TOKEN}`]
  const hf = headers.map(h => `-H "${h}"`).join(' ')
  const cmd = `curl -s -X POST ${hf} "${PB_URL}${endpoint}" ${ff}`
  return JSON.parse(execSync(cmd, { encoding: 'utf-8', timeout: 60000, shell: true }))
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
    execom: extractTable('_3_database_1_collection_9'),
  }
}

async function main() {
  if (!PB_ADMIN_EMAIL || !PB_ADMIN_PASSWORD) {
    console.error('PB_ADMIN_EMAIL and PB_ADMIN_PASSWORD required')
    process.exit(1)
  }

  const { societies, execom } = readSQL(path.resolve(__dirname, '..', 'ieee_export.sql'))
  console.log(`Parsed ${societies.length} societies, ${execom.length} execom members`)

  // Login
  console.log('\nLogging in...')
  const loginRes = JSON.parse(run('POST', '/api/collections/_superusers/auth-with-password', {
    body: JSON.stringify({ identity: PB_ADMIN_EMAIL, password: PB_ADMIN_PASSWORD }),
  }))
  AUTH_TOKEN = loginRes.token
  console.log('OK:', loginRes.record?.email || 'unknown')

  // --- Collections ---
  console.log('\nCreating societies collection...')
  const socCol = pbPost('/api/collections', {
    name: 'societies',
    type: 'base',
    listRule: '',
    createRule: '@request.auth.role = "admin"',
    updateRule: '@request.auth.role = "admin"',
    deleteRule: '@request.auth.role = "admin"',
    fields: [
      { name: 'name', type: 'text', required: true },
      { name: 'slug', type: 'text', required: true },
      { name: 'bio', type: 'text' },
      { name: 'logo', type: 'file', maxSelect: 1, maxSize: 5242880, mimeTypes: ['image/png', 'image/jpeg', 'image/webp'] },
      { name: 'banner', type: 'file', maxSelect: 1, maxSize: 5242880, mimeTypes: ['image/png', 'image/jpeg', 'image/webp'] },
      { name: 'displayOrder', type: 'number' },
    ],
    indexes: ['CREATE UNIQUE INDEX idx_societies_slug ON societies (slug)'],
  })
  console.log('Societies collection:', socCol.id)

  console.log('Creating execom collection...')
  pbPost('/api/collections', {
    name: 'execom',
    type: 'base',
    listRule: '',
    createRule: '@request.auth.role = "admin"',
    updateRule: '@request.auth.role = "admin"',
    deleteRule: '@request.auth.role = "admin"',
    fields: [
      { name: 'name', type: 'text', required: true },
      { name: 'position', type: 'text', required: true },
      { name: 'society', type: 'relation', collectionId: socCol.id, maxSelect: 1 },
      { name: 'photo', type: 'file', maxSelect: 1, maxSize: 5242880, mimeTypes: ['image/png', 'image/jpeg', 'image/webp'] },
      { name: 'sectionId', type: 'text' },
      { name: 'order', type: 'number' },
      { name: 'batch', type: 'text' },
      { name: 'department', type: 'text' },
      { name: 'linkedin', type: 'url' },
      { name: 'instagram', type: 'url' },
      { name: 'email', type: 'email' },
      { name: 'phone', type: 'text' },
      { name: 'section', type: 'text' },
    ],
    indexes: ['CREATE INDEX idx_execom_sectionId ON execom (sectionId)'],
  })
  console.log('Execom collection created')

  console.log('Creating events collection...')
  const evtCol = pbPost('/api/collections', {
    name: 'events',
    type: 'base',
    listRule: '',
    createRule: '@request.auth.role = "admin"',
    updateRule: '@request.auth.role = "admin"',
    deleteRule: '@request.auth.role = "admin"',
    fields: [
      { name: 'title', type: 'text', required: true },
      { name: 'slug', type: 'text', required: true },
      { name: 'description', type: 'text' },
      { name: 'date', type: 'date', required: true },
      { name: 'endDate', type: 'date' },
      { name: 'venue', type: 'text', required: true },
      { name: 'price', type: 'number' },
      { name: 'society', type: 'relation', collectionId: socCol.id, maxSelect: 1, required: true },
      { name: 'banner', type: 'file', maxSelect: 1, maxSize: 5242880, mimeTypes: ['image/png', 'image/jpeg', 'image/webp'] },
      { name: 'status', type: 'select', values: ['draft', 'published', 'completed'] },
      { name: 'maxCapacity', type: 'number' },
      { name: 'registrationOpen', type: 'bool' },
      { name: 'registrationStart', type: 'date' },
      { name: 'registrationDeadline', type: 'date' },
      { name: 'checkInEnabled', type: 'bool' },
      { name: 'contactEmail', type: 'email' },
      { name: 'contactPhone', type: 'text' },
      { name: 'tags', type: 'text' },
      { name: 'isDeleted', type: 'bool' },
    ],
    indexes: ['CREATE UNIQUE INDEX idx_events_slug ON events (slug)'],
  })
  console.log('Events collection:', evtCol.id)

  console.log('Creating registrations collection...')
  const usersCol = pbGet('/api/collections/users')
  pbPost('/api/collections', {
    name: 'registrations',
    type: 'base',
    listRule: '@request.auth.id != ""',
    createRule: '@request.auth.id != ""',
    updateRule: '@request.auth.role = "admin"',
    deleteRule: '@request.auth.role = "admin"',
    fields: [
      { name: 'user', type: 'relation', collectionId: usersCol.id, maxSelect: 1, required: true },
      { name: 'event', type: 'relation', collectionId: evtCol.id, maxSelect: 1, required: true },
      { name: 'userName', type: 'text' },
      { name: 'userEmail', type: 'email' },
      { name: 'userPhone', type: 'text' },
      { name: 'formResponses', type: 'json' },
      { name: 'paymentStatus', type: 'select', values: ['pending', 'paid', 'failed', 'not_required'] },
      { name: 'registrationStatus', type: 'select', values: ['pending', 'confirmed', 'cancelled'] },
      { name: 'ticketId', type: 'text' },
      { name: 'paymentTicketId', type: 'text' },
      { name: 'amount', type: 'number' },
      { name: 'paymentData', type: 'json' },
      { name: 'registrationDate', type: 'date' },
      { name: 'checkedIn', type: 'bool' },
      { name: 'checkedInAt', type: 'date' },
    ],
    indexes: ['CREATE UNIQUE INDEX idx_registrations_ticketId ON registrations (ticketId)'],
  })
  console.log('All collections created')

  // --- Import Societies ---
  console.log('\nImporting societies...')
  const slugToId: Record<string, string> = {}
  for (let idx = 0; idx < societies.length; idx++) {
    const row = societies[idx]
    const name = row[5], slug = row[6], bio = row[7], logoPath = row[8], bannerPath = row[9]
    const fields: Record<string, string | { path: string; mime: string }> = { name, slug, bio }
    if (logoPath) {
      const fp = path.resolve(__dirname, '..', 'public', logoPath.replace(/^\//, ''))
      if (fs.existsSync(fp)) fields.logo = { path: fp, mime: 'image/png' }
    }
    if (bannerPath) {
      const fp = path.resolve(__dirname, '..', 'public', bannerPath.replace(/^\//, ''))
      if (fs.existsSync(fp)) fields.banner = { path: fp, mime: 'image/jpeg' }
    }
    const rec = pbFormPost(`/api/collections/societies/records`, fields)
    slugToId[slug] = rec.id
    console.log(`  [${idx + 1}/${societies.length}] ${slug}`)
  }

  // --- Import Execom ---
  console.log('\nImporting execom...')
  const sectionToSlug: Record<string, string> = {
    cs: 'cs', cass: 'cas', cas: 'cas', ias: 'ias', ies: 'ies', sight: 'sight',
    sps: 'sps', npss: 'npss', edsoc: 'edsoc', css: 'css', embs: 'embs',
    pes: 'pes', wie: 'wie', ras: 'ras', ps: 'ps',
  }
  let imported = 0
  for (let idx = 0; idx < execom.length; idx++) {
    const row = execom[idx]
    const name = row[6]; if (!name) continue
    const fields: Record<string, string | { path: string; mime: string }> = {
      name,
      position: row[9] || '',
      sectionId: row[12] || '',
      order: String(parseInt(row[5]) || 0),
      batch: row[8] || '',
      department: row[7] || '',
      linkedin: row[14] || '',
      instagram: row[15] || '',
      section: row[11] || '',
    }
    const emailPhone = row[16] || ''
    const phone = row[17] || ''
    let email = emailPhone
    if (emailPhone.includes(' (')) email = emailPhone.split(' (')[0]
    else if (emailPhone.includes(' ') && emailPhone.includes('@')) {
      email = emailPhone.split(' ').find((p: string) => p.includes('@')) || emailPhone
    }
    fields.email = email || ''
    fields.phone = phone

    const socSlug = sectionToSlug[row[12] || '']
    if (socSlug && slugToId[socSlug]) fields.society = slugToId[socSlug]

    const photoUrl = row[13] || ''
    if (photoUrl) {
      const fp = path.resolve(__dirname, '..', 'public', photoUrl.replace(/^\//, ''))
      if (fs.existsSync(fp)) {
        const ext = path.extname(fp).toLowerCase()
        const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg'
        fields.photo = { path: fp, mime }
      }
    }
    pbFormPost(`/api/collections/execom/records`, fields)
    imported++
    if (imported % 10 === 0 || imported === 1) console.log(`  [${imported}] ${name}`)
  }
  console.log(`Imported ${imported} execom members`)

  // --- Google OAuth ---
  if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) {
    console.log('\nConfiguring Google OAuth...')
    pbPatch('/api/collections/users', {
      oauth2: {
        enabled: true,
        mappedFields: { id: '', name: 'name', username: '', avatarURL: 'avatar' },
        providers: [{ name: 'google', clientId: GOOGLE_CLIENT_ID, clientSecret: GOOGLE_CLIENT_SECRET, pkce: true }],
      },
    })
    console.log('Google OAuth configured')
  }

  // --- Generate token ---
  console.log('\nGenerating superuser token...')
  const adminRes = JSON.parse(run('POST', `/api/collections/_superusers/impersonate/${loginRes.record.id}`, {
    body: JSON.stringify({ duration: 10 * 365 * 24 * 3600 }),
  }))
  console.log('\n=== POCKETBASE_SUPERUSER_TOKEN ===')
  console.log(adminRes.token)
  console.log('=== COPY THIS TO YOUR .env.local ===\n')
  console.log('Migration complete!')
}

main().catch(err => { console.error(err); process.exit(1) })
