import { NextRequest, NextResponse } from 'next/server';
import { validateCSRF } from '@/lib/api/csrf';
import { getSignedInUserFromRequest } from '@/lib/passkeys/passkeyStore';
import {
  getEvent,
  getUserRegistrationForEvent,
  getEventCapacity,
  createRegistration,
  createTicket,
  updateRegistration,
  EventDocument,
} from '@/lib/api/appwrite-admin';
import { registrationDataSchema, formTemplateSchema, validateFormData } from '@/lib/validation/schemas';
import { 
  handleError, 
  ValidationError, 
  RateLimitError,
  CapacityError,
  DuplicateRegistrationError 
} from '@/lib/errorHandler';
import { checkRegistrationRateLimit, getClientIP } from '@/lib/api/rate-limiter';
import { createLogger } from '@/lib/api/logger';
import { sendRegistrationConfirmation } from '@/lib/emailIntegration';
import { PAYMENT_API_URL, PAYMENT_WS_URL, PAYMENT_STATUS_URL, UPI_ID, MERCHANT_NAME } from '@/lib/constants/endpoints';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{ eventId: string }>;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { eventId } = await params;
  const log = createLogger({ action: 'register', eventId });

  try {
    if (!validateCSRF(req)) {
      return NextResponse.json({ success: false, error: 'CSRF validation failed' }, { status: 403 });
    }
    // 1. Check authentication
    const user = await getSignedInUserFromRequest(req);
    const userId = user?.$id;

    if (!userId) {
      log.warn('Registration attempt without authentication');
      return NextResponse.json(
        { error: 'UNAUTHORIZED', message: 'You must be signed in to register for events.' },
        { status: 401 }
      );
    }

    log.info('Registration request', { userId });

    // 2. Parse body for form data
    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      log.warn('Empty or invalid request body');
    }

    // 3. Check rate limits
    const ip = getClientIP(req.headers);
    const rateLimit = checkRegistrationRateLimit(userId, ip);
    
    if (!rateLimit.allowed) {
      log.warn('Rate limit exceeded', { userId, ip, limitType: rateLimit.limitType });
      const retryAfter = Math.ceil((rateLimit.resetAt - Date.now()) / 1000);
      throw new RateLimitError(
        rateLimit.limitType === 'user' 
          ? 'You have made too many registration attempts. Please try again later.'
          : 'Too many requests from this IP address. Please try again later.',
        retryAfter,
        new Date(rateLimit.resetAt)
      );
    }

    // 4. Validate request body - basic schema
    let formData: Record<string, unknown> = {};
    try {
      const parsed = registrationDataSchema.safeParse(body);
      if (!parsed.success) {
        throw parsed.error;
      }
      formData = parsed.data;
    } catch (error) {
      if (error && typeof error === 'object' && 'name' in error && error.name === 'ZodError') {
        throw error; // Re-throw Zod error to be handled by error handler
      }
      // Empty body is OK for events without custom forms
    }

    // 5. Get event and validate
    const event = await getEvent(eventId);
    if (!event) {
      log.warn('Event not found', { userId });
      return NextResponse.json(
        { error: 'EVENT_NOT_FOUND', message: 'The requested event does not exist.' },
        { status: 404 }
      );
    }

    // 6. Check event status
    if (event.status !== 'published') {
      log.warn('Registration attempt for non-published event', { userId, status: event.status });
      return NextResponse.json(
        { error: 'EVENT_NOT_AVAILABLE', message: 'This event is not currently accepting registrations.' },
        { status: 400 }
      );
    }

    // 6b. Respect explicit registration toggle
    if (event.registration_open === false) {
      log.warn('Registration attempt while registration is closed', { userId, eventId });
      return NextResponse.json(
        { error: 'REGISTRATION_CLOSED', message: 'Registrations are currently closed for this event.' },
        { status: 400 }
      );
    }

    // 7. Check registration deadline (from metadata or event)
    const registrationDeadline = event.registration_deadline;
    if (registrationDeadline) {
      const deadline = new Date(registrationDeadline);
      if (deadline < new Date()) {
        log.warn('Registration deadline passed', { userId, deadline: registrationDeadline });
        return NextResponse.json(
          { error: 'REGISTRATION_CLOSED', message: 'The registration deadline for this event has passed.' },
          { status: 400 }
        );
      }
    }

    // 8. Validate form data against event template
    if (event.form_template) {
      try {
        const template = formTemplateSchema.parse(JSON.parse(event.form_template));
        const validation = validateFormData(formData, template);
        
        if (!validation.valid) {
          log.warn('Form validation failed', { userId, errors: validation.errors });
          throw new ValidationError('Please check your form inputs.', validation.errors);
        }
      } catch (error) {
        if (error instanceof ValidationError) {
          throw error;
        }
        log.error('Failed to parse form template', error instanceof Error ? error : new Error(String(error)));
      }
    }

    // 9. Check for duplicate registration
    const existingRegistration = await getUserRegistrationForEvent(userId, eventId);
    if (existingRegistration) {
      log.warn('Duplicate registration attempt', { userId, existingId: existingRegistration.$id });
      throw new DuplicateRegistrationError(
        'You are already registered for this event.',
        existingRegistration.$id
      );
    }

    // 10. Check capacity
    const capacity = await getEventCapacity(event);
    if (capacity.is_full) {
      log.warn('Event at capacity', { userId, capacity });
      throw new CapacityError('This event has reached maximum capacity.');
    }

    // 11. Handle registration based on event type (paid vs free)
    const eventPrice = event.price;
    const isPaidEvent = eventPrice > 0;

    if (isPaidEvent) {
      return await handlePaidRegistration(event, userId, formData, log);
    } else {
      return await handleFreeRegistration(event, userId, formData, log);
    }
  } catch (error) {
    return handleError(error);
  }
}

// Payment API error class
class PaymentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PaymentError';
  }
}

// Create payment ticket with payment API
async function createPaymentTicket(amount: number, metadata: Record<string, unknown>) {
  const response = await fetch(`${PAYMENT_API_URL}/ticket`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      amount,
      metadata 
    })
  });
  
  if (!response.ok) {
    throw new PaymentError('Failed to create payment ticket');
  }
  
  return await response.json();
}

async function handlePaidRegistration(
  event: EventDocument,
  userId: string,
  formData: Record<string, unknown>,
  log: ReturnType<typeof createLogger>
) {
  const eventPrice = event.price;

  // Create registration first to get registration ID
  const registration = await createRegistration({
    user_id: userId,
    event_id: event.$id,
    form_data: formData,
    payment_status: 'pending',
    registration_status: 'pending',
  });

  let paymentTicket: {
    ticketId: string;
    amount: number;
    status: string;
    createdAt: string;
  };

  try {
    // Call payment API with metadata
    paymentTicket = await createPaymentTicket(eventPrice, {
      registrationId: registration.$id,
      eventId: event.$id,
      userId: userId
    });

    log.info('Payment ticket created', {
      ticketId: paymentTicket.ticketId,
      amount: String(paymentTicket.amount),
    });

    // Update registration with payment reference (ticket ID from payment API)
    await updateRegistration(registration.$id, {
      payment_reference: paymentTicket.ticketId,
    });
  } catch (error) {
    log.error('Failed to create payment ticket', error instanceof Error ? error : new Error(String(error)));
    return NextResponse.json(
      { error: 'PAYMENT_ERROR', message: 'Could not initialize payment. Please try again.' },
      { status: 500 }
    );
  }

  // Build UPI string for QR code
  const upiId = UPI_ID;
  const merchantName = MERCHANT_NAME;
  const upiString = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(merchantName)}&am=${paymentTicket.amount}&tn=${paymentTicket.ticketId}&cu=INR`;

  log.info('Paid registration created', { 
    userId, 
    registrationId: registration.$id,
    paymentTicketId: paymentTicket.ticketId,
  });

  return NextResponse.json({
    success: true,
    registration_id: registration.$id,
    ticket_id: null,
    payment_required: true,
    payment: {
      ticket_id: paymentTicket.ticketId,
      amount: paymentTicket.amount,
      status: paymentTicket.status,
      created_at: paymentTicket.createdAt,
      upi_string: upiString,
      upi_id: upiId,
      merchant_name: merchantName,
      websocket_url: `${PAYMENT_WS_URL}?ticketId=${paymentTicket.ticketId}`,
      status_url: `${PAYMENT_STATUS_URL}${paymentTicket.ticketId}`,
    },
    amount: paymentTicket.amount,
    currency: 'INR',
    message: 'Registration initiated. Complete payment to confirm your spot.',
  });
}

async function handleFreeRegistration(
  event: EventDocument,
  userId: string,
  formData: Record<string, unknown>,
  log: ReturnType<typeof createLogger>
) {
  // Create confirmed registration
  const registration = await createRegistration({
    user_id: userId,
    event_id: event.$id,
    form_data: formData,
    payment_status: 'free',
    registration_status: 'confirmed',
  });

  // Generate QR code for ticket (dynamic import to avoid bundle issues)
  let qrCodeBase64 = '';
  try {
    const { generateQRCode } = await import('@/lib/ticketGenerator');
    qrCodeBase64 = await generateQRCode(registration.$id);
  } catch (error) {
    log.warn('Failed to generate QR code', { error: error instanceof Error ? error.message : 'Unknown' });
  }

  // Create ticket with QR code
  const ticket = await createTicket({
    registration_id: registration.$id,
    user_id: userId,
    event_id: event.$id,
    qr_code_base64: qrCodeBase64,
  });

  // Update registration with ticket ID
  await updateRegistration(registration.$id, { ticket_id: ticket.$id });

  log.info('Free registration completed', { 
    userId, 
    registrationId: registration.$id,
    ticketId: ticket.$id,
  });

  // Send confirmation email asynchronously
  sendRegistrationConfirmation(
    {
      $id: registration.$id,
      user_id: userId,
      event_id: event.$id,
      ticket_id: ticket.$id,
    },
    event
  ).catch(emailError => {
    // Don't fail registration if email fails, but surface high-signal context for QR issues
    const message = emailError instanceof Error ? emailError.message : String(emailError);
    log.error('Failed to send confirmation email', 
      emailError instanceof Error ? emailError : new Error(String(emailError)),
      { registrationId: registration.$id, ticketId: ticket.$id, reason: message }
    );
  });

  return NextResponse.json({
    success: true,
    registration_id: registration.$id,
    ticket_id: ticket.$id,
    payment_required: false,
    payment_url: null,
    message: 'Registration successful! Your ticket has been generated.',
  });
}
