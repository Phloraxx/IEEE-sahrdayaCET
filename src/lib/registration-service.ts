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

