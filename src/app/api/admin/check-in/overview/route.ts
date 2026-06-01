import { NextRequest, NextResponse } from 'next/server';
import { getSignedInUserFromRequest } from '@/lib/passkeys/passkeyStore';
import {
  getDatabases,
  getUsers,
  Query,
  DATABASE_ID,
  EVENTS_COLLECTION_ID,
  EVENT_REGISTRATIONS_COLLECTION_ID,
  SOCIETIES_COLLECTION_ID,
  getLocationRecency,
  type RegistrationDocument,
  type LocationRecencyInfo,
} from '@/lib/api/appwrite-admin';
import { createLogger } from '@/lib/api/logger';
import { handleError } from '@/lib/errorHandler';
import { getUserSocietyIds, hasAdminAccess } from '@/lib/api/shared-utils';

export const runtime = 'nodejs';

interface CheckInEntry {
  id: string;
  registrationId: string;
  studentName: string;
  email: string;
  ticketId: string;
  checkedInAt: string;
  location?: string;
  locationHistory?: LocationRecencyInfo[];
}

interface EventWithCheckIns {
  eventId: string;
  eventTitle: string;
  eventDate: string;
  societyId: string;
  societyName?: string;
  totalRegistered: number;
  totalCheckedIn: number;
  recentCheckIns: CheckInEntry[];
  lastCheckInAt?: string;
}

interface OverviewStats {
  totalCheckInsToday: number;
  totalCheckInsAllTime: number;
  eventsWithCheckIns: number;
  mostRecentCheckIn?: {
    eventTitle: string;
    studentName: string;
    checkedInAt: string;
  };
}

/**
 * GET /api/admin/check-in/overview
 * Returns check-in overview data: events with check-ins, recent check-ins, and stats
 * OPTIMIZED: Parallel queries, reduced N+1
 */
export async function GET(req: NextRequest) {
  const log = createLogger({ action: 'get_checkin_overview' });

  try {
    const user = await getSignedInUserFromRequest(req);
    if (!user) {
      log.warn('Unauthorized overview request');
      return NextResponse.json(
        { error: 'UNAUTHORIZED', message: 'Authentication required.' },
        { status: 401 }
      );
    }

    const db = getDatabases();
    const userId = user.$id;
    
    // Get user's accessible society IDs
    const societyIds = await getUserSocietyIds(userId, getDatabases());
    const isAdmin = await hasAdminAccess(userId, getUsers());
    if (societyIds.length === 0 && !isAdmin) {
      return NextResponse.json({
        events: [],
        stats: {
          totalCheckInsToday: 0,
          totalCheckInsAllTime: 0,
          eventsWithCheckIns: 0,
        },
        message: 'No societies accessible.',
      });
    }

    // Fetch events and societies in parallel
    const eventsQuery = isAdmin
      ? [Query.orderDesc('date'), Query.limit(100)]
      : [Query.equal('society_id', societyIds), Query.orderDesc('date'), Query.limit(100)];
    
    const [eventsRes, societiesRes] = await Promise.all([
      db.listDocuments(DATABASE_ID, EVENTS_COLLECTION_ID, eventsQuery),
      db.listDocuments(DATABASE_ID, SOCIETIES_COLLECTION_ID, [Query.limit(100)]),
    ]);
    
    const societyMap = new Map(societiesRes.documents.map(s => [s.$id, (s as unknown as { name: string }).name]));
    const eventIds = eventsRes.documents.map(e => e.$id);
    
    if (eventIds.length === 0) {
      return NextResponse.json({
        events: [],
        stats: { totalCheckInsToday: 0, totalCheckInsAllTime: 0, eventsWithCheckIns: 0 },
      });
    }

    // OPTIMIZATION: Fetch ALL checked-in registrations across all events in ONE query
    // This eliminates N+1 - we fetch once and process in memory
    const allCheckedInRes = await db.listDocuments(DATABASE_ID, EVENT_REGISTRATIONS_COLLECTION_ID, [
      Query.equal('event_id', eventIds),
      Query.equal('checked_in', true),
      Query.orderDesc('$updatedAt'),
      Query.limit(500), // Get enough for stats and recent check-ins
    ]);

    // Group by event_id
    const checkInsByEvent = new Map<string, RegistrationDocument[]>();
    for (const reg of allCheckedInRes.documents) {
      const eventId = reg.event_id as string;
      if (!checkInsByEvent.has(eventId)) {
        checkInsByEvent.set(eventId, []);
      }
      checkInsByEvent.get(eventId)!.push(reg as unknown as RegistrationDocument);
    }

    // OPTIMIZATION: Batch fetch registration counts per event
    // Use Promise.all for parallel fetching (limit to prevent overwhelming DB)
    const eventCountPromises = eventsRes.documents.map(async (event) => {
      const eventId = event.$id;
      const registeredRes = await db.listDocuments(DATABASE_ID, EVENT_REGISTRATIONS_COLLECTION_ID, [
        Query.equal('event_id', eventId),
        Query.equal('registration_status', 'confirmed'),
        Query.limit(1),
      ]);
      return { eventId, totalRegistered: registeredRes.total };
    });
    
    const eventCounts = await Promise.all(eventCountPromises);
    const registeredCountMap = new Map(eventCounts.map(ec => [ec.eventId, ec.totalRegistered]));

    // Build events with check-in data
    const eventsWithCheckIns: EventWithCheckIns[] = [];
    let totalCheckInsAllTime = 0;
    let totalCheckInsToday = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayISO = today.toISOString();
    
    let mostRecentCheckIn: OverviewStats['mostRecentCheckIn'] | undefined;
    let mostRecentTime = '';

    for (const event of eventsRes.documents) {
      const eventId = event.$id;
      const eventTitle = event.title as string;
      const eventDate = event.date as string;
      const societyId = event.society_id as string;
      
      const checkedInRegs = checkInsByEvent.get(eventId) || [];
      const totalCheckedIn = checkedInRegs.length;
      
      if (totalCheckedIn === 0) {
        continue; // Skip events with no check-ins
      }
      
      totalCheckInsAllTime += totalCheckedIn;
      
      // Process recent check-ins
      const recentCheckIns: CheckInEntry[] = [];
      let lastCheckInAt: string | undefined;
      
      for (const reg of checkedInRegs.slice(0, 10)) { // Only process top 10 per event
        // Parse name/email from form_responses
        let studentName = reg.user_name || 'Unknown';
        let email = reg.user_email || '';
        try {
          const formResponses = reg.form_responses ? JSON.parse(reg.form_responses) : {};
          studentName = formResponses.name || studentName;
          email = formResponses.email || email;
        } catch {
          log.warn('Failed to parse form responses in overview');
        }
        
        const checkedInAt = reg.check_in_time || reg.checked_in_at || reg.$updatedAt;
        
        // Count today's check-ins
        if (checkedInAt >= todayISO) {
          totalCheckInsToday++;
        }
        
        // Track most recent
        if (!lastCheckInAt || checkedInAt > lastCheckInAt) {
          lastCheckInAt = checkedInAt;
        }
        
        if (checkedInAt > mostRecentTime) {
          mostRecentTime = checkedInAt;
          mostRecentCheckIn = {
            eventTitle,
            studentName,
            checkedInAt,
          };
        }
        
        // Get location history
        const locationHistory = getLocationRecency(reg);
        
        recentCheckIns.push({
          id: reg.$id,
          registrationId: reg.$id,
          studentName,
          email,
          ticketId: reg.ticket_id || reg.$id,
          checkedInAt,
          location: reg.last_check_in_location || 'entrance',
          locationHistory,
        });
      }
      
      eventsWithCheckIns.push({
        eventId,
        eventTitle,
        eventDate,
        societyId,
        societyName: societyMap.get(societyId),
        totalRegistered: registeredCountMap.get(eventId) || 0,
        totalCheckedIn,
        recentCheckIns,
        lastCheckInAt,
      });
    }
    
    // Sort events by most recent check-in
    eventsWithCheckIns.sort((a, b) => {
      if (!a.lastCheckInAt) return 1;
      if (!b.lastCheckInAt) return -1;
      return b.lastCheckInAt.localeCompare(a.lastCheckInAt);
    });
    
    const stats: OverviewStats = {
      totalCheckInsToday,
      totalCheckInsAllTime,
      eventsWithCheckIns: eventsWithCheckIns.length,
      mostRecentCheckIn,
    };

    log.info('Check-in overview retrieved', { 
      userId, 
      eventsCount: eventsWithCheckIns.length,
      totalCheckIns: totalCheckInsAllTime,
    });

    return NextResponse.json({
      events: eventsWithCheckIns,
      stats,
    });
  } catch (error) {
    log.error('Failed to get check-in overview', error instanceof Error ? error : new Error(String(error)));
    return handleError(error);
  }
}
