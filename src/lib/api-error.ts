import { logError } from './logger'
import { ClientResponseError } from 'pocketbase'
import { AuthError } from './auth'
import { ParseError } from './parse-form-data'

/**
 * Thrown by API routes when a business-rule check fails (the PB hooks now
 * enforce most rules at the DB layer, but routes still validate auth and
 * scope before the write). `handleError` maps this to the correct HTTP status.
 */
export class RegistrationError extends Error {
  constructor(
    message: string,
    public statusCode: number = 400,
  ) {
    super(message)
    this.name = 'RegistrationError'
  }
}
/**
 * Central error handler for API route try/catch blocks.
 * Maps known error types (AuthError, RegistrationError, ClientResponseError)
 * to the correct HTTP status and message; falls back to 500 for unknown errors.
 */
export function handleError(error: unknown, context: string): Response {
  logError(context, error)

  if (error instanceof AuthError) {
    return Response.json({ error: error.message }, { status: error.status })
  }

  if (error instanceof RegistrationError) {
    return Response.json({ error: error.message }, { status: error.statusCode })
  }

  if (error instanceof ParseError) {
    return Response.json({ error: error.message }, { status: 400 })
  }

  if (error instanceof ClientResponseError) {
    // PB returns status 0 on auto-cancel / network failure — Response.json
    // throws RangeError if we pass that through. Map anything < 400 or > 599
    // to a generic 502 (upstream failure).
    const raw = Number(error.status) || 0
    const status = raw >= 400 && raw <= 599 ? raw : 502
    if (raw === 404) {
      return Response.json({ error: 'Resource not found' }, { status: 404 })
    }
    if (raw === 400) {
      return Response.json({ error: error.message || 'Invalid request' }, { status: 400 })
    }
    return Response.json({ error: 'Request failed' }, { status })
  }

  return Response.json({ error: 'Internal server error' }, { status: 500 })
}

/**
 * Extracts a numeric HTTP status from any error-like object.
 * Used by routes that need to branch on status before/after handleError.

 */
export function getErrorStatus(error: unknown): number {
  if (error instanceof AuthError) return error.status
  if (error instanceof RegistrationError) return error.statusCode
  if (error instanceof ParseError) return 400
  if (error instanceof ClientResponseError) {
    const raw = Number(error.status) || 0
    return raw >= 400 && raw <= 599 ? raw : 502
  }
  if (error && typeof error === 'object' && 'status' in error && typeof (error as { status: unknown }).status === 'number') {
    return (error as { status: number }).status
  }
  return 500
}
