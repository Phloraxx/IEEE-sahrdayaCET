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
import { getUserSocietyIds, hasAdminAccess } from '@/lib/api/shared-utils';

export const runtime = 'nodejs';

interface SearchResult {
  registrationId: string;
  ticketId: string;
  studentName: string;
  email: string;
  isCheckedIn: boolean;
  checkedInAt?: string;
  lastLocation?: string;
  locationHistory?: LocationRecencyInfo[];
  eventId: string;
  eventTitle: string;
  eventDate?: string;
  checkInCount?: number;
}

// Cache for events (TTL: 5 minutes)
const eventsCache = new Map<string, { data: Map<string, { title: string; date: string }>; eventIds: string[]; expires: number }>();
const EVENTS_CACHE_TTL = 5 * 60 * 1000;

/**
 * Get user's accessible events (with caching)
 */
async function getUserEvents(userId: string, societyIds: string[], isAdmin: boolean): Promise<{ eventMap: Map<string, { title: string; date: string }>; eventIds: string[] }> {
  const cacheKey = `${userId}_${isAdmin}`;
  const cached = eventsCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return { eventMap: cached.data, eventIds: cached.eventIds };
  }
  
  const db = getDatabases();
  const eventsQuery = isAdmin
    ? [Query.limit(100)]
    : [Query.equal('society_id', societyIds), Query.limit(100)];
  
  const eventsRes = await db.listDocuments(DATABASE_ID, EVENTS_COLLECTION_ID, eventsQuery);
  const eventIds = eventsRes.documents.map(e => e.$id);
  const eventMap = new Map(eventsRes.documents.map(e => [e.$id, { title: e.title as string, date: e.date as string }]));
  
  // Cache result
  eventsCache.set(cacheKey, { data: eventMap, eventIds, expires: Date.now() + EVENTS_CACHE_TTL });
  
  return { eventMap, eventIds };
}

/**
 * GET /api/admin/check-in/search-all
 * Search for registrations by name, email, or ticket ID across all accessible events
 * OPTIMIZED: Caching, reduced fetch limit, early termination
 */
export async function GET(req: NextRequest) {
  const log = createLogger({ action: 'search_all_registrations' });

  try {
    const user = await getSignedInUserFromRequest(req);
    if (!user) {
      log.warn('Unauthorized search attempt');
      return NextResponse.json(
        { error: 'UNAUTHORIZED', message: 'Authentication required.' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const query = searchParams.get('q')?.trim();

    if (!query || query.length < 2) {
      return NextResponse.json({
        results: [],
        message: 'Please enter at least 2 characters to search.',
      });
    }

    const db = getDatabases();
    const userId = user.$id;
    
    // Get user's accessible society IDs
    const societyIds = await getUserSocietyIds(userId, getDatabases());
    const isAdmin = await hasAdminAccess(userId, getUsers());
    if (societyIds.length === 0 && !isAdmin) {
      return NextResponse.json({
        results: [],
        total: 0,
        message: 'No societies accessible.',
      });
    }

    // Get events user has access to (cached)
    const { eventMap, eventIds } = await getUserEvents(userId, societyIds, isAdmin);
    
    if (eventIds.length === 0) {
      return NextResponse.json({
        results: [],
        total: 0,
        message: 'No events found.',
      });
    }

    // OPTIMIZATION: Reduce limit and use more targeted search
    // If query looks like a ticket ID (contains numbers/dashes), prioritize exact match
    const isLikelyTicketId = /^[a-z0-9-]{8,}$/i.test(query);
    const fetchLimit = isLikelyTicketId ? 100 : 200;
    
    // Search across all accessible events
    const registrationsResult = await db.listDocuments(
      DATABASE_ID,
      EVENT_REGISTRATIONS_COLLECTION_ID,
      [
        Query.equal('event_id', eventIds),
        Query.equal('registration_status', 'confirmed'),
        Query.limit(fetchLimit),
      ]
    );

    // Filter by search query with early termination
    const queryLower = query.toLowerCase();
    const matchingRegistrations: typeof registrationsResult.documents = [];
    const maxResults = 30;
    
    for (const reg of registrationsResult.documents) {
      if (matchingRegistrations.length >= maxResults * 2) break; // Stop early if we have enough
      
      let matches = false;
      
      // Check ticket_id first (most specific)
      if (reg.ticket_id && (reg.ticket_id as string).toLowerCase().includes(queryLower)) {
        matches = true;
      }
      
      // Check registration ID
      if (!matches && reg.$id.toLowerCase().includes(queryLower)) {
        matches = true;
      }
      
      // Check user_name field
      if (!matches) {
        const userName = (reg.user_name as string || '').toLowerCase();
        if (userName.includes(queryLower)) matches = true;
      }

      // Check user_email field
      if (!matches) {
        const userEmail = (reg.user_email as string || '').toLowerCase();
        if (userEmail.includes(queryLower)) matches = true;
      }

      // Check form_responses for name/email
      if (!matches) {
        try {
          const formResponses = reg.form_responses ? JSON.parse(reg.form_responses as string) : {};
          if (formResponses.name?.toLowerCase().includes(queryLower) ||
              formResponses.email?.toLowerCase().includes(queryLower)) {
            matches = true;
          }
        } catch {
          log.warn('Failed to parse form responses during search');
        }
      }

      if (matches) {
        matchingRegistrations.push(reg);
      }
    }

    // Build results with enhanced details
    const results: SearchResult[] = matchingRegistrations.slice(0, maxResults).map((rawReg) => {
      const reg = rawReg as unknown as RegistrationDocument;
      
      // Get ticket ID
      let ticketId = reg.$id;
      if (reg.ticket_id) {
        ticketId = reg.ticket_id;
      }

      // Get name and email from form_responses
      let studentName = reg.user_name || 'Unknown';
      let email = reg.user_email || '';

      try {
        const formResponses = reg.form_responses ? JSON.parse(reg.form_responses) : {};
        studentName = formResponses.name || studentName;
        email = formResponses.email || email;
      } catch {
        log.warn('Failed to parse form responses for student identity');
      }

      // Get location history for checked-in registrations
      const locationHistory = reg.checked_in ? getLocationRecency(reg) : undefined;
      
      // Get event info
      const eventInfo = eventMap.get(reg.event_id);

      return {
        registrationId: reg.$id,
        ticketId,
        studentName,
        email,
        isCheckedIn: Boolean(reg.checked_in),
        checkedInAt: reg.check_in_time || reg.checked_in_at || undefined,
        lastLocation: reg.last_check_in_location || 'entrance',
        locationHistory,
        eventId: reg.event_id,
        eventTitle: eventInfo?.title || 'Unknown Event',
        eventDate: eventInfo?.date,
        checkInCount: locationHistory?.length || 0,
      };
    });

    log.info('Global search completed', { 
      userId,
      query, 
      resultCount: results.length 
    });

    return NextResponse.json({
      results,
      total: matchingRegistrations.length,
      showing: results.length,
    });
  } catch (error) {
    log.error('Search failed', error instanceof Error ? error : new Error(String(error)));
    return handleError(error);
  }
}
