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

function isFaculty(doc: Record<string, unknown>): boolean {
  const fields = [doc.batch, doc.department, doc.section].filter(Boolean)
  return fields.some(f => String(f).toLowerCase().includes('faculty'))
}

async function main() {
  if (!AUTH_TOKEN) {
    console.error('POCKETBASE_SUPERUSER_TOKEN must be set in .env.local')
    process.exit(1)
  }

  console.log('Fetching all execom records...')
  const all = JSON.parse(run('GET', '/api/collections/execom/records?perPage=100'))
  const items: Record<string, unknown>[] = all.items || []
  console.log(`Found ${items.length} records`)

  const grouped: Record<string, Record<string, unknown>[]> = {}
  for (const doc of items) {
    const sectionId = (doc.sectionId as string) || '_unknown'
    if (!grouped[sectionId]) grouped[sectionId] = []
    grouped[sectionId].push(doc)
  }

  let updated = 0
  for (const [sectionId, members] of Object.entries(grouped)) {
    members.sort((a, b) => {
      const aFac = isFaculty(a) ? 0 : 1
      const bFac = isFaculty(b) ? 0 : 1
      if (aFac !== bFac) return aFac - bFac
      return ((a.order as number) || 0) - ((b.order as number) || 0)
    })

    console.log(`\n${sectionId} (${members.length} members):`)
    for (let i = 0; i < members.length; i++) {
      const doc = members[i]
      const newOrder = i + 1
      const name = (doc.name as string) || '?'
      const faculty = isFaculty(doc) ? ' [FACULTY]' : ''
      console.log(`  ${newOrder}. ${name}${faculty}`)

      if (doc.order !== newOrder) {
        try {
          pbPatch(`/api/collections/execom/records/${doc.id}`, { order: newOrder })
          updated++
        } catch (e) {
          console.error(`  FAILED to update ${doc.id} (${name}):`, e instanceof Error ? e.message : e)
        }
      }
    }
  }

  console.log(`\nDone! Updated ${updated} records`)
}

main().catch(err => { console.error(err); process.exit(1) })
