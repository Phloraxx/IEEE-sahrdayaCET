import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildFileUrl } from '@/lib/pb'

describe('buildFileUrl', () => {
  const OLD_ENV = process.env

  beforeEach(() => {
    vi.resetAllMocks()
    process.env = { ...OLD_ENV }
  })

  afterEach(() => {
    process.env = OLD_ENV
  })

  it('builds a relative file URL for valid inputs', () => {
    process.env.POCKETBASE_URL = 'http://localhost:8090'
    const url = buildFileUrl('events', 'rec-123', 'banner.jpg')
    // buildFileUrl returns a path served by the app's /files route from the
    // uploads volume. PocketBase's /api/files path is gone.
    expect(url).toBe('/files/events/rec-123/banner.jpg')
  })

  it('returns the relative file URL even when POCKETBASE_URL is unset', () => {
    delete process.env.POCKETBASE_URL
    vi.stubEnv('VITE_POCKETBASE_URL', '')
    const url = buildFileUrl('events', 'rec-123', 'banner.jpg')
    expect(url).toBe('/files/events/rec-123/banner.jpg')
  })

  it('returns empty string when recordId is empty', () => {
    process.env.POCKETBASE_URL = 'http://localhost:8090'
    expect(buildFileUrl('events', '', 'banner.jpg')).toBe('')
    expect(buildFileUrl('events', 'rec-123', '')).toBe('')
  })
})
