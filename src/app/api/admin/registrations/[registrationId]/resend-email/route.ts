import { NextRequest, NextResponse } from 'next/server';
import { validateCSRF } from '@/lib/api/csrf';
import { getSignedInUserFromRequest } from '@/lib/passkeys/passkeyStore';
import { 
  getDatabases, 
  DATABASE_ID, 
  REGISTRATIONS_COLLECTION_ID,
  getEvent,
  parseEmbeddedTicket,
  isUserAdmin
} from '@/lib/api/appwrite-admin';
import { createLogger } from '@/lib/api/logger';
import { RegistrationDocument } from '@/lib/api/appwrite-admin';
import { isUserChairOfEvent } from '@/lib/api/auth-check';
import { resendTicketEmail } from '@/lib/emailIntegration';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{ registrationId: string }>;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { registrationId } = await params;
  const log = createLogger({ action: 'admin-resend-ticket-email', registrationId });

  try {
    if (!validateCSRF(req)) {
      return NextResponse.json({ success: false, error: 'CSRF validation failed' }, { status: 403 });
    }
    // 1. Check authentication
    const user = await getSignedInUserFromRequest(req);
    if (!user) {
      log.warn('Admin resend email attempt without authentication');
      return NextResponse.json(
        { error: 'UNAUTHORIZED', message: 'Authentication required.' },
        { status: 401 }
      );
    }

    const db = getDatabases();

    // 2. Find registration document
    let registration: RegistrationDocument | null = null;
    try {
      const result = await db.getDocument(DATABASE_ID, REGISTRATIONS_COLLECTION_ID, registrationId);
      registration = result as unknown as RegistrationDocument;
    } catch {
      log.warn('Registration not found', { registrationId });
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Registration does not exist.' },
        { status: 404 }
      );
    }

    if (!registration) {
      return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
    }

    // 3. Check authorization: user must be admin OR chair of the event
    const isAdmin = await isUserAdmin(user.$id);
    const isChair = await isUserChairOfEvent(user.$id, registration.event_id);
    if (!isAdmin && !isChair) {
      log.warn('User not authorized for this event', { userId: user.$id, eventId: registration.event_id });
      return NextResponse.json(
        { error: 'FORBIDDEN', message: 'You are not authorized to manage registrations for this event.' },
        { status: 403 }
      );
    }

    const embeddedTicket = parseEmbeddedTicket(registration);
    
    // We can still send an email even if there's no ticket_id generated yet, but best if there is one
    const ticketIdStr = embeddedTicket?.ticket_id || registration.ticket_id || 'PENDING';

    // 4. Get event details
    const event = await getEvent(registration.event_id);
    if (!event) {
      return NextResponse.json(
        { error: 'EVENT_NOT_FOUND', message: 'The event for this registration does not exist.' },
        { status: 404 }
      );
    }

    const result = await resendTicketEmail(
      {
        $id: registration.$id,
        user_id: registration.user_id,
        event_id: registration.event_id,
        ticket_id: ticketIdStr,
      },
      {
        $id: event.$id,
        title: event.title,
        start_date: event.start_date,
        date: event.date,
        venue: event.venue,
        price: event.price,
      }
    );

    if (!result.success) {
      log.error('Failed to send admin ticket email', new Error(result.error || 'Unknown error'));
      return NextResponse.json(
        { error: 'EMAIL_SEND_FAILED', message: 'Failed to send ticket email.' },
        { status: 500 }
      );
    }

    log.info('Admin ticket email sent successfully', { ticketId: ticketIdStr });

    return NextResponse.json({
      success: true,
      message: 'Email sent successfully.',
      ticket_id: ticketIdStr,
    });
  } catch (error) {
    log.error('Failed to process admin resend email', error instanceof Error ? error : new Error(String(error)));
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' },
      { status: 500 }
    );
  }
}
