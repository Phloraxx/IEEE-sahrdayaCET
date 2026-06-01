import { NextRequest, NextResponse } from 'next/server';
import { getSignedInUserFromRequest } from '@/lib/passkeys/passkeyStore';
import { 
  getDatabases, 
  Query, 
  DATABASE_ID,
  EVENT_REGISTRATIONS_COLLECTION_ID,
  parseEmbeddedTicket,
  getLocationRecency,
  type RegistrationDocument,
  type LocationRecencyInfo,
} from '@/lib/api/appwrite-admin';
import { createLogger } from '@/lib/api/logger';
import { handleError } from '@/lib/errorHandler';
import { isUserChairOfEvent } from '@/lib/api/auth-check';

export const runtime = 'nodejs';

const moduleLog = createLogger({ action: 'checkin-search' });

interface RouteParams {
  params: Promise<{ eventId: string }>;
}

interface SearchResult {
  registrationId: string;
  ticketId: string;
  studentName: string;
  email: string;
  isCheckedIn: boolean;
  checkedInAt?: string;
  lastLocation?: string;
  locationHistory?: LocationRecencyInfo[];
}

const NAME_KEYS = ['name', 'full_name', 'fullName', 'student_name', 'studentName', 'attendee_name', 'attendeeName'] as const;
const EMAIL_KEYS = ['email', 'user_email', 'userEmail', 'student_email', 'studentEmail'] as const;

function parseJsonObject(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    moduleLog.warn('Failed to parse JSON object in search');
    return {};
  }
}

function pickFirstString(obj: Record<string, unknown>, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
}

function getRegistrationIdentity(reg: RegistrationDocument): { studentName: string; email: string } {
  const formResponses = parseJsonObject(reg.form_responses);
  const legacyFormData = parseJsonObject(reg.form_data);

  const studentName =
    pickFirstString(formResponses, NAME_KEYS) ||
    pickFirstString(legacyFormData, NAME_KEYS) ||
    reg.user_name ||
    'Unknown';

  const email =
    pickFirstString(formResponses, EMAIL_KEYS) ||
    pickFirstString(legacyFormData, EMAIL_KEYS) ||
    reg.user_email ||
    '';

  return { studentName, email };
}

/**
 * GET /api/admin/check-in/[eventId]/search
 * Search for registrations by name, email, or ticket ID
 * OPTIMIZED: Caching, reduced limit, early termination
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  const { eventId } = await params;
  const log = createLogger({ action: 'search_registrations', eventId });

  try {
    const user = await getSignedInUserFromRequest(req);
    if (!user) {
      log.warn('Unauthorized search attempt');
      return NextResponse.json(
        { error: 'UNAUTHORIZED', message: 'Authentication required.' },
        { status: 401 }
      );
    }

    // Check authorization (cached)
    const isAuthorized = await isUserChairOfEvent(user.$id, eventId);
    if (!isAuthorized) {
      log.warn('Unauthorized search attempt', { userId: user.$id, eventId });
      return NextResponse.json(
        { error: 'FORBIDDEN', message: 'You do not have permission to search registrations for this event.' },
        { status: 403 }
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

    // OPTIMIZATION: Reduce limit for faster response
    const registrationsResult = await db.listDocuments(
      DATABASE_ID,
      EVENT_REGISTRATIONS_COLLECTION_ID,
      [
        Query.equal('event_id', eventId),
        Query.equal('registration_status', 'confirmed'),
        Query.limit(200), // Reduced from 500
      ]
    );

    // Filter by search query with early termination
    const queryLower = query.toLowerCase();
    const matchingRegistrations: typeof registrationsResult.documents = [];
    const maxResults = 20;
    
    for (const reg of registrationsResult.documents) {
      if (matchingRegistrations.length >= maxResults * 2) break; // Stop early
      
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
        const normalizedReg = reg as unknown as RegistrationDocument;
        const identity = getRegistrationIdentity(normalizedReg);
        if (
          identity.studentName.toLowerCase().includes(queryLower) ||
          identity.email.toLowerCase().includes(queryLower)
        ) {
          matches = true;
        }
      }

      if (matches) {
        matchingRegistrations.push(reg);
      }
    }

    // Get ticket IDs from current registration model
    const results: SearchResult[] = matchingRegistrations.slice(0, maxResults).map((rawReg) => {
      const reg = rawReg as unknown as RegistrationDocument;
      
      // Prefer embedded ticket ID, then registration ticket_id
      let ticketId = reg.$id; // Default to registration ID
      
      // Check for embedded ticket first (new schema)
      const embeddedTicket = parseEmbeddedTicket(reg);
      if (embeddedTicket) {
        ticketId = embeddedTicket.ticket_id;
      } else if (reg.ticket_id) {
        ticketId = reg.ticket_id;
      }

      const { studentName, email } = getRegistrationIdentity(reg);

      // Get location history for checked-in registrations
      const locationHistory = reg.checked_in ? getLocationRecency(reg) : undefined;

      return {
        registrationId: reg.$id,
        ticketId,
        studentName,
        email,
        isCheckedIn: Boolean(reg.checked_in),
        checkedInAt: reg.check_in_time || reg.checked_in_at || undefined,
        lastLocation: reg.last_check_in_location || 'entrance',
        locationHistory,
      };
    });

    log.info('Search completed', { 
      eventId, 
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
