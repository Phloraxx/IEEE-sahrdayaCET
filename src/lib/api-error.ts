import { logError } from './logger'
import { ClientResponseError } from 'pocketbase'

export function handleError(error: unknown, context: string) {
  logError(context, error)

  if (error instanceof ClientResponseError) {
    const status = error.status
    if (status === 404) {
      return Response.json({ error: 'Resource not found' }, { status: 404 })
    }
    if (status === 400) {
      return Response.json({
        error: error.data?.message || 'Invalid request',
        details: error.data?.data || undefined,
      }, { status: 400 })
    }
    return Response.json(
      { error: error.data?.message || 'Request failed' },
      { status },
    )
  }

  return Response.json({ error: 'Internal server error' }, { status: 500 })
}
