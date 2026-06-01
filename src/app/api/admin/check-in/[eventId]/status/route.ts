import { NextRequest, NextResponse } from 'next/server';
import { getSignedInUserFromRequest } from '@/lib/passkeys/passkeyStore';
import {
  getDatabases,
  getUsers,
  Query,
  DATABASE_ID,
  EVENTS_COLLECTION_ID,
  EVENT_REGISTRATIONS_COLLECTION_ID,
  getLocationRecency,
  type RegistrationDocument,
  type LocationRecencyInfo,
} from '@/lib/api/appwrite-admin';
import { createLogger } from '@/lib/api/logger';
import { handleError } from '@/lib/errorHandler';
import { isUserChairOfEvent } from '@/lib/api/auth-check';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{ eventId: string }>;
}

/**
 * GET /api/admin/check-in/[eventId]/status
 * Get check-in status and event info for the check-in page
 * Sessionless mode: activeSession is always null
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  const { eventId } = await params;
  const log = createLogger({ action: 'get_checkin_status', eventId });

  try {
    const user = await getSignedInUserFromRequest(req);
    if (!user) {
      log.warn('Unauthorized status check');
      return NextResponse.json(
        { error: 'UNAUTHORIZED', message: 'Authentication required.' },
        { status: 401 }
      );
    }

    const db = getDatabases();
    const users = getUsers();

    // Check authorization
    const isAuthorized = await isUserChairOfEvent(user.$id, eventId);
    if (!isAuthorized) {
      log.warn('Unauthorized check-in access', { userId: user.$id, eventId });
      return NextResponse.json(
        { error: 'FORBIDDEN', message: 'You do not have permission to access check-in for this event.' },
        { status: 403 }
      );
    }

    // Get event details
    const event = await db.getDocument(DATABASE_ID, EVENTS_COLLECTION_ID, eventId);

    // Count total registrations
    const registrationsResult = await db.listDocuments(DATABASE_ID, EVENT_REGISTRATIONS_COLLECTION_ID, [
      Query.equal('event_id', eventId),
      Query.equal('registration_status', 'confirmed'),
      Query.limit(1),
    ]);
    const totalRegistered = registrationsResult.total;

    // Count checked-in registrations
    const checkedInResult = await db.listDocuments(DATABASE_ID, EVENT_REGISTRATIONS_COLLECTION_ID, [
      Query.equal('event_id', eventId),
      Query.equal('checked_in', true),
      Query.limit(1),
    ]);
    const totalCheckedIn = checkedInResult.total;

    // Sessionless mode: activeSession is always null
    // Check-ins work without requiring a session
    const activeSession = null;

    // Get recent check-ins from event_registrations
    let recentCheckIns: Array<{
      id: string;
      studentName: string;
      ticketId: string;
      checkedInAt: string;
      location?: string;
      locationHistory?: LocationRecencyInfo[];
    }> = [];
    
    try {
      // Query registrations that are checked in, sorted by $updatedAt (as proxy for check-in time)
      const checkedInRegistrations = await db.listDocuments(DATABASE_ID, EVENT_REGISTRATIONS_COLLECTION_ID, [
        Query.equal('event_id', eventId),
        Query.equal('checked_in', true),
        Query.orderDesc('$updatedAt'),
        Query.limit(50),
      ]);

      recentCheckIns = checkedInRegistrations.documents.map((rawReg) => {
        const reg = rawReg as unknown as RegistrationDocument;
        
        // Parse name from form_responses
        let studentName = reg.user_name || 'Unknown';
        try {
          const formResponses = reg.form_responses ? JSON.parse(reg.form_responses) : {};
          studentName = formResponses.name || studentName;
        } catch {
          log.warn('Failed to parse form responses for student name');
        }
        
        // Get location history for the check-in timeline
        const locationHistory = getLocationRecency(reg);
        
        return {
          id: reg.$id,
          studentName,
          ticketId: reg.ticket_id || reg.$id,
          checkedInAt: reg.check_in_time || reg.checked_in_at || reg.$updatedAt,
          location: reg.last_check_in_location || 'entrance',
          locationHistory,
        };
      });
    } catch (error) {
      log.warn('Could not fetch recent check-ins', { error: String(error) });
    }

    log.info('Check-in status retrieved (sessionless mode)', { eventId });

    return NextResponse.json({
      event: {
        id: event.$id,
        title: event.title,
        date: event.date,
        venue: event.venue,
        maxCapacity: event.max_capacity || 0,
        totalRegistered,
        totalCheckedIn,
        societyId: event.society_id,
      },
      activeSession,
      recentCheckIns,
      notice: 'Sessionless mode: Check-ins work without session tracking.',
    });
  } catch (error) {
    log.error('Failed to get check-in status', error instanceof Error ? error : new Error(String(error)));
    return handleError(error);
  }
}
