import { NextRequest, NextResponse } from 'next/server';
import { getNormalizedTicketById, getEvent, getUsers } from '@/lib/api/appwrite-admin';
import { createLogger } from '@/lib/api/logger';
import { getSignedInUserFromRequest } from '@/lib/passkeys/passkeyStore';
import { handleError } from '@/lib/errorHandler';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{ ticketId: string }>;
}

/**
 * GET /api/ticket/[ticketId]
 * Returns ticket details. Optional auth — returns full data to owner, limited data to public.
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  const { ticketId } = await params;
  const log = createLogger({ action: 'get-ticket', ticketId });

  try {
    // Try auth (don't fail if unauthenticated — this is a public endpoint)
    const user = await getSignedInUserFromRequest(req).catch(() => null);
    log.info('Fetching ticket', { ticketId, userId: user?.$id });

    // Resolve ticket using shared helper (eliminates duplicate resolution logic)
    const result = await getNormalizedTicketById(ticketId);
    if (!result) {
      log.warn('Ticket not found');
      return NextResponse.json(
        { error: 'TICKET_NOT_FOUND', message: 'Ticket not found.' },
        { status: 404 }
      );
    }

    const { ticket, registration } = result;

    // Get event details
    const event = await getEvent(registration.event_id);
    if (!event) {
      log.warn('Event not found for ticket', { eventId: registration.event_id });
      return NextResponse.json(
        { error: 'EVENT_NOT_FOUND', message: 'Event not found.' },
        { status: 404 }
      );
    }

    // Authenticated + owner: return full data
    if (user && registration.user_id === user.$id) {
      let userName = 'Unknown';
      try {
        const users = getUsers();
        const ticketUser = await users.get(registration.user_id);
        userName = ticketUser.name;
      } catch {
        log.warn('Could not fetch user details', { userId: registration.user_id });
      }

      let qrData: { ticket_id: string; registration_id: string; event_id: string; timestamp: string } | null = null;
      try {
        qrData = JSON.parse(ticket.qr_data);
      } catch {
        log.warn('Failed to parse ticket QR data');
      }

      log.info('Ticket fetched successfully (authenticated)');
      return NextResponse.json({
        success: true,
        ticket: {
          ticket_id: ticket.id,
          event_name: event.title,
          student_name: userName,
          event_date: event.date,
          event_venue: event.venue,
          qr_code: qrData?.ticket_id || ticket.id,
          checked_in: ticket.is_scanned || false,
          checked_in_at: ticket.scanned_at,
          created_at: ticket.issued_at,
        },
      });
    }

    // Public: return limited data
    log.info('Ticket fetched successfully (public)');
    return NextResponse.json({
      ticket: {
        id: ticket.id,
        qr_data: ticket.qr_data,
        is_scanned: ticket.is_scanned || false,
        scanned_at: ticket.scanned_at,
        created_at: ticket.issued_at,
      },
      event: {
        id: event.$id,
        title: event.title,
        description: event.description,
        date: event.date,
        venue: event.venue,
        banner_url: event.banner_url,
        society_id: event.society_id,
      },
      registration: {
        id: registration.$id,
        payment_status: registration.payment_status || 'not_required',
        registration_status: registration.registration_status || 'confirmed',
      },
    });
  } catch (error) {
    return handleError(error);
  }
}
