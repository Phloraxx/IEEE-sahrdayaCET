import { PB_AUTH_COOKIE } from './constants'

/**
 * Client-side fetch wrapper that sends JSON, includes credentials,
 * and throws an ApiError on non-ok responses.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public data?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export async function apiFetch<T = unknown>(
  url: string,
  options: RequestInit & { params?: Record<string, string> } = {},
): Promise<T> {
  const { params, ...fetchOptions } = options

  let fullUrl = url
  if (params) {
    const qs = new URLSearchParams(params).toString()
    if (qs) fullUrl += `?${qs}`
  }

  const headers = new Headers(fetchOptions.headers)
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const cookie = document.cookie
    .split('; ')
    .find((row) => row.startsWith(`${PB_AUTH_COOKIE}=`))
  if (cookie) {
    headers.set('Cookie', cookie)
  }

  const res = await fetch(fullUrl, {
    ...fetchOptions,
    headers,
    credentials: 'include',
  })

  if (!res.ok) {
    let data: unknown
    try {
      data = await res.json()
    } catch {
      data = null
    }
    const message =
      (data as { error?: string })?.error || `Request failed with status ${res.status}`
    throw new ApiError(message, res.status, data)
  }

  return res.json() as Promise<T>
}
