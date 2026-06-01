import { NextRequest, NextResponse } from 'next/server';
import { getSignedInUserFromRequest } from '@/lib/passkeys/passkeyStore';
import { getUserRegistrations, getEvent, parseEmbeddedTicket } from '@/lib/api/appwrite-admin';
import { createLogger } from '@/lib/api/logger';
import { handleError } from '@/lib/errorHandler';

export const runtime = 'nodejs';

/**
 * GET /api/registrations/my-tickets
 * Get all registrations for the current user with ticket details
 * Requires authentication
 * 
 * Simplified schema: Reads ticket from registration embedded ticket only
 */
export async function GET(req: NextRequest) {
  const log = createLogger({ action: 'get-my-tickets' });

  try {
    // 1. Check authentication
    const user = await getSignedInUserFromRequest(req);
    if (!user) {
      log.warn('My tickets request without authentication');
      return NextResponse.json(
        { error: 'UNAUTHORIZED', message: 'You must be signed in to view your tickets.' },
        { status: 401 }
      );
    }

    const userId = user.$id;
    log.info('Fetching user tickets', { userId });

    // 2. Get all user registrations
    const registrations = await getUserRegistrations(userId);

    // 3. Enrich with event and embedded ticket details
    const enrichedRegistrations = await Promise.all(
      registrations.map(async (registration) => {
        // Get event details
        const event = await getEvent(registration.event_id);
        
        // Get embedded ticket (simplified schema - no legacy fallback)
        const embeddedTicket = parseEmbeddedTicket(registration);

        // Parse form data
        let formData: Record<string, unknown> = {};
        try {
          formData = JSON.parse(registration.form_responses || registration.form_data || '{}');
        } catch {
          log.warn('Failed to parse form data for registration', { registrationId: registration.$id });
        }

        return {
          registration: {
            id: registration.$id,
            event_id: registration.event_id,
            payment_status: registration.payment_status,
            registration_status: registration.registration_status,
            form_data: formData,
            created_at: registration.$createdAt,
            updated_at: registration.$updatedAt,
          },
          event: event ? {
            id: event.$id,
            title: event.title,
            description: event.description,
            date: event.date,
            venue: event.venue,
            price: event.price,
            banner_url: event.banner_url,
            society_id: event.society_id,
            status: event.status,
          } : null,
          ticket: embeddedTicket ? {
            id: embeddedTicket.ticket_id,
            qr_data: embeddedTicket.qr_data || embeddedTicket.qr_code,
            is_scanned: embeddedTicket.is_scanned || false,
            scanned_at: embeddedTicket.scanned_at,
            created_at: embeddedTicket.issued_at,
          } : null,
        };
      })
    );

    // 4. Categorize registrations
    const upcoming = enrichedRegistrations.filter(
      r => r.event && new Date(r.event.date) >= new Date() && r.registration.registration_status === 'confirmed'
    );
    
    const pending = enrichedRegistrations.filter(
      r => r.registration.payment_status === 'pending'
    );
    
    const past = enrichedRegistrations.filter(
      r => r.event && new Date(r.event.date) < new Date() && r.registration.registration_status === 'confirmed'
    );

    log.info('User tickets fetched', { 
      userId, 
      total: registrations.length,
      upcoming: upcoming.length,
      pending: pending.length,
      past: past.length,
    });

    return NextResponse.json({
      success: true,
      user_id: userId,
      total: registrations.length,
      registrations: {
        upcoming,
        pending,
        past,
        all: enrichedRegistrations,
      },
    });
  } catch (error) {
    return handleError(error);
  }
}
