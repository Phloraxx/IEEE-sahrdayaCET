import { NextRequest } from 'next/server'

/**
 * Parses a NextRequest body into a plain record, handling both
 * `multipart/form-data` (with File objects preserved) and JSON.
 *
 * JSON-stringified values in form-data fields are automatically parsed
 * (e.g. arrays/objects sent as strings by the client). Returns an empty
 * object for empty/non-JSON bodies instead of throwing.
 */
export async function parseFormData(req: NextRequest): Promise<Record<string, unknown>> {
  const contentType = req.headers.get('content-type') || ''

  if (contentType.includes('multipart/form-data')) {
    const formData = await req.formData()
    const body: Record<string, unknown> = {}
    for (const [key, value] of formData.entries()) {
      if (value instanceof File) {
        body[key] = value
      } else {
        try {
          body[key] = JSON.parse(value as string)
        } catch {
          body[key] = value
        }
      }
    }
    return body
  }

  try {
    return (await req.json()) as Record<string, unknown>
  } catch {
    return {}
  }
}
