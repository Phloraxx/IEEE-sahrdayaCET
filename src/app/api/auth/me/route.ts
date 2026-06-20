import { createPB } from '@/lib/pb'
import { requireAuth, AuthError } from '@/lib/auth'
import { handleError } from '@/lib/api-error'

export async function GET(req: Request) {
  try {
    const pb = createPB(req.headers.get('cookie') || undefined)
    if (!pb.authStore.isValid) {
      return Response.json({ error: 'Not authenticated' }, { status: 401 })
    }
    const { user } = await requireAuth(pb)
    return Response.json({ user })
  } catch (error) {
    if (error instanceof AuthError) {
      return Response.json({ error: error.message }, { status: error.status })
    }
    return handleError(error, 'auth-me')
  }
}
