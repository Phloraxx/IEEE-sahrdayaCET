import PocketBase from 'pocketbase'

export function createPB(cookieString?: string) {
  const url = process.env.POCKETBASE_URL
  if (!url) throw new Error('Missing POCKETBASE_URL environment variable')
  const pb = new PocketBase(url)

  if (cookieString) {
    pb.authStore.loadFromCookie(cookieString, 'pb_auth')
  } else if (process.env.POCKETBASE_SUPERUSER_TOKEN) {
    pb.authStore.save(process.env.POCKETBASE_SUPERUSER_TOKEN!, null)
  }

  return pb
}
