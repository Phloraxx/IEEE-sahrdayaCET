import { NextRequest, NextResponse } from 'next/server';
import { validateCSRF } from '@/lib/api/csrf';
import { getSignedInUserFromRequest } from '@/lib/passkeys/passkeyStore';
import { verifyQRCode } from '@/lib/checkInHelpers';
import { createLogger } from '@/lib/api/logger';
import { handleError } from '@/lib/errorHandler';
import { z } from 'zod';
import { isUserChairOfEvent } from '@/lib/api/auth-check';
import { isUserAdmin } from '@/lib/api/appwrite-admin';

export const runtime = 'nodejs';

const verifyQRSchema = z.object({
  ticket_id: z.string().min(1, 'Ticket ID is required').max(500),
  event_id: z.string().min(1, 'Event ID is required').max(500),
  location: z.string().max(500).optional(),
});

/**
 * POST /api/admin/check-in/verify-qr
 * Verify QR code for check-in
 */
export async function POST(req: NextRequest) {
  const log = createLogger({ action: 'verify_qr' });

  try {
    if (!validateCSRF(req)) {
      return NextResponse.json({ success: false, error: 'CSRF validation failed' }, { status: 403 });
    }
    const user = await getSignedInUserFromRequest(req);
    if (!user) {
      log.warn('Unauthorized QR verification attempt');
      return NextResponse.json(
        { error: 'UNAUTHORIZED', message: 'Authentication required.' },
        { status: 401 }
      );
    }

    // Validate request body
    const body = await req.json();
    const parsed = verifyQRSchema.safeParse(body);
    
    if (!parsed.success) {
      log.warn('Invalid QR verification data', { errors: parsed.error.issues });
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', message: 'Invalid verification data.', errors: parsed.error.issues },
        { status: 400 }
      );
    }

    const { ticket_id, event_id, location } = parsed.data;

    // Check authorization
    const isAuthorized = await isUserAdmin(user.$id) || await isUserChairOfEvent(user.$id, event_id);
    if (!isAuthorized) {
      log.warn('Unauthorized QR verification attempt', { userId: user.$id, eventId: event_id });
      return NextResponse.json(
        { error: 'FORBIDDEN', message: 'You do not have permission to verify QR codes for this event.' },
        { status: 403 }
      );
    }

    // Verify QR code
    const result = await verifyQRCode(ticket_id, event_id, location);

    if (!result.valid) {
      log.warn('Invalid QR code', { ticketId: ticket_id, eventId: event_id, error: result.error });
      return NextResponse.json({
        valid: false,
        error: result.error,
        message: result.error === 'TICKET_NOT_FOUND' 
          ? 'Ticket not found.'
          : result.error === 'WRONG_EVENT'
          ? 'This ticket is not for this event.'
          : result.error === 'ALREADY_CHECKED_IN'
          ? `${result.studentName || 'Attendee'} already checked in ${result.timeAgo}.`
          : result.error === 'PAYMENT_PENDING'
          ? 'Payment not completed for this registration.'
          : 'Invalid ticket.',
        student_name: result.studentName,
        checked_in_at: result.checkedInAt,
        time_ago: result.timeAgo,
        already_checked_in: result.error === 'ALREADY_CHECKED_IN',
        last_location: result.lastLocation, // Multi-location support
        location_history: result.locationHistory, // Multi-location timeline
      }, { status: 400 });
    }

    log.info('QR code verified', { ticketId: ticket_id, eventId: event_id });

    return NextResponse.json({
      valid: true,
      registration: result.registration,
      message: 'Ticket is valid and ready for check-in.',
    });
  } catch (error) {
    log.error('QR verification failed', error instanceof Error ? error : new Error(String(error)));
    return handleError(error);
  }
}

