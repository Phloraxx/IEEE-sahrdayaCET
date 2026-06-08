import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function loadEnv(filePath: string) {
  const content = fs.readFileSync(filePath, 'utf-8')
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    let val = trimmed.slice(eqIdx + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    process.env[key] = val
  }
}

loadEnv(path.resolve(__dirname, '..', '.env.local'))

const PB_URL = process.env.POCKETBASE_URL || 'http://127.0.0.1:8090'
const AUTH_TOKEN = process.env.POCKETBASE_SUPERUSER_TOKEN || ''

function tmpFile(ext: string): string {
  const dir = execSync('echo %TEMP%', { encoding: 'utf-8', shell: true }).trim()
  return path.join(dir, `pb_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`)
}

function run(method: string, endpoint: string, body?: string): string {
  const headers = [`Content-Type: application/json`]
  if (AUTH_TOKEN) headers.push(`Authorization: Bearer ${AUTH_TOKEN}`)
  const hf = headers.map(h => `-H "${h}"`).join(' ')

  let dataFlag = ''
  if (body) {
    const fp = tmpFile('json')
    fs.writeFileSync(fp, body)
    dataFlag = `-d @"${fp}"`
  }

  const cmd = `curl -s -X ${method} ${hf} ${dataFlag} "${PB_URL}${endpoint}" 2>&1`
  return execSync(cmd, { encoding: 'utf-8', timeout: 60000, shell: true })
}

function pbGet(endpoint: string): any {
  return JSON.parse(run('GET', endpoint))
}

function pbPatch(endpoint: string, body: object): any {
  return JSON.parse(run('PATCH', endpoint, JSON.stringify(body)))
}

const MOJIBAKE_PATTERNS: [RegExp, string][] = [
  [/â€™/g, "'"],
  [/â€œ/g, '"'],
  [/â€(?!�|˜|“|”|•|¢)/g, '"'],
  [/â€¦/g, '…'],
  [/â€”/g, '—'],
  [/â€“/g, '–'],
  [/â€¢/g, '•'],
  [/ï»¿/g, ''],
  [/Â/g, ' '],
  [/â˜…/g, '★'],
  [/â˜†/g, '☆'],
]

const INVISIBLE_RE = /[\u200B-\u200D\uFEFF\u00AD\u2060\u200E\u200F]/g
const LITERAL_N_RE = /\\n/g
const REPLACEMENT_RE = /\uFFFD/g

function sanitizeText(text: string): string {
  if (!text) return text
  let result = text

  for (const [re, replacement] of MOJIBAKE_PATTERNS) {
    result = result.replace(re, replacement)
  }

  result = result.replace(INVISIBLE_RE, '')
  result = result.replace(LITERAL_N_RE, '\n')
  result = result.replace(REPLACEMENT_RE, '')

  return result
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + '...' : s
}

async function main() {
  if (!AUTH_TOKEN) {
    console.error('POCKETBASE_SUPERUSER_TOKEN must be set in .env.local')
    process.exit(1)
  }

  console.log('Fetching all events...')
  let allItems: Record<string, unknown>[] = []
  let page = 1
  const perPage = 100
  while (true) {
    const res = pbGet(`/api/collections/events/records?perPage=${perPage}&page=${page}`)
    allItems = allItems.concat(res.items || [])
    if (!res.totalItems || allItems.length >= res.totalItems) break
    page++
  }
  console.log(`Found ${allItems.length} events`)

  let updated = 0
  let skipped = 0
  let errors = 0

  for (const ev of allItems) {
    const id = ev.id as string
    const title = (ev.title as string) || ''
    const description = (ev.description as string) || ''
    const eventTitle = truncate(title, 60)

    const fixedTitle = sanitizeText(title)
    const fixedDesc = sanitizeText(description)
    const updates: Record<string, string> = {}

    if (fixedTitle !== title) updates.title = fixedTitle
    if (fixedDesc !== description) updates.description = fixedDesc

    if (Object.keys(updates).length === 0) {
      skipped++
      continue
    }

    try {
      pbPatch(`/api/collections/events/records/${id}`, updates)
      updated++
      const fields = Object.keys(updates).join(', ')
      console.log(`  [${updated}] ${eventTitle} — fixed: ${fields}`)
    } catch (e) {
      errors++
      console.error(`  FAILED ${eventTitle}:`, e instanceof Error ? e.message : e)
    }
  }

  console.log(`\nDone! Updated: ${updated}, Already clean: ${skipped}, Errors: ${errors}`)
}

main().catch(err => { console.error(err); process.exit(1) })
