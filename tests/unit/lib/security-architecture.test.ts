import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function readRepoFile(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}

describe('security architecture invariants', () => {
  it('does not expose a runtime PocketBase superuser client', () => {
    const source = readRepoFile('src/lib/pb.server.ts')
    expect(source).not.toContain('createAdminPB')
    expect(source).not.toContain('POCKETBASE_SUPERUSER_TOKEN')
  })

  it('pins the PocketBase container to the documented version', () => {
    const compose = readRepoFile('docker-compose.pb.yml')
    expect(compose).toContain('image: adrianmusante/pocketbase:0.39.1')
    expect(compose).not.toContain('adrianmusante/pocketbase:latest')
  })

  it('enforces check-in validity at the PocketBase model-hook layer', () => {
    const hook = readRepoFile('pb_hooks/registration-checkin.pb.js')
    expect(hook).toContain('onRecordUpdate(function')
    expect(hook).toContain('reg.original()')
    expect(hook).toContain('registrationStatus')
    expect(hook).toContain('confirmed')
    expect(hook).toContain('checkInEnabled')
    expect(hook).toContain('reg.set("checkedInAt", new Date().toISOString())')
  })

  it('documents trusted-chair and PocketBase enforcement boundaries', () => {
    const docs = readRepoFile('docs/security-architecture.md')
    expect(docs).toContain('chair` accounts are trusted internal staff')
    expect(docs).toContain('PocketBase API rules')
    expect(docs).toContain('PocketBase hooks')
    expect(docs).toContain('TanStack Start')
  })
})
