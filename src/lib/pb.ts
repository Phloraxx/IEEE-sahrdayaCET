import PocketBase from 'pocketbase'

export function createPB(cookieString?: string) {
  const url = process.env.POCKETBASE_URL
  if (!url) throw new Error('Missing POCKETBASE_URL environment variable')
  const pb = new PocketBase(url)

  if (cookieString) {
    pb.authStore.loadFromCookie(cookieString, 'pb_auth')
  }

  return pb
}

export function createAdminPB() {
  const pb = createPB()
  const token = process.env.POCKETBASE_SUPERUSER_TOKEN
  if (token) {
    pb.authStore.save(token, null)
  }
  return pb
}

export async function pbFetch<T = unknown>(url: string, timeoutMs = 8000): Promise<T | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: controller.signal })
    return res.ok ? (await res.json()) as T : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}
