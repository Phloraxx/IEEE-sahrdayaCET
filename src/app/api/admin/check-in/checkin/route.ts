import { NextRequest, NextResponse } from 'next/server';
import { validateCSRF } from '@/lib/api/csrf';
import { getSignedInUserFromRequest } from '@/lib/passkeys/passkeyStore';
import { 
  getDatabases, 
  DATABASE_ID, 
  EVENT_REGISTRATIONS_COLLECTION_ID,
  incrementEventCheckInCount,
  buildCheckInUpdatePayload,
  getLocationRecency,
  parseCheckInHistory,
  formatTimeAgo,
  type RegistrationDocument,
} from '@/lib/api/appwrite-admin';
import { createLogger } from '@/lib/api/logger';
import { z } from 'zod';
import { isUserChairOfEvent } from '@/lib/api/auth-check';
import { isUserAdmin } from '@/lib/api/appwrite-admin';
import { handleError } from '@/lib/errorHandler';

export const runtime = 'nodejs';
const checkinSchema = z.object({
  registration_id: z.string().min(1, 'Registration ID is required').max(500),
  session_id: z.string().max(500).optional(),
  ticket_id: z.string().max(500).optional(),
  event_id: z.string().max(500).optional(),
  location: z.string().max(500).optional(),
});

/**
 * POST /api/admin/check-in/checkin
 * Mark a registration as checked in
 * Sessionless mode: session_id is ignored, no session tracking
 */
export async function POST(req: NextRequest) {
  const log = createLogger({ action: 'checkin' });

  try {
    if (!validateCSRF(req)) {
      return NextResponse.json({ success: false, error: 'CSRF validation failed' }, { status: 403 });
    }
    const user = await getSignedInUserFromRequest(req);
    if (!user) {
      log.warn('Unauthorized check-in attempt');
      return NextResponse.json(
        { error: 'UNAUTHORIZED', message: 'Authentication required.' },
        { status: 401 }
      );
    }

    const userId = user.$id;

    // Validate request body
    const body = await req.json();
    const parsed = checkinSchema.safeParse(body);
    
    if (!parsed.success) {
      log.warn('Invalid check-in data', { errors: parsed.error.issues, userId });
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', message: 'Invalid check-in data.', errors: parsed.error.issues },
        { status: 400 }
      );
    }

    const { registration_id, location } = parsed.data;
    // ticket_id and session_id are intentionally ignored - sessionless mode, all state in registration
    const db = getDatabases();

    // Get registration to extract event_id
    const registration = await db.getDocument(DATABASE_ID, EVENT_REGISTRATIONS_COLLECTION_ID, registration_id) as unknown as RegistrationDocument;

    // Check authorization
    const isAuthorized = await isUserAdmin(userId) || await isUserChairOfEvent(userId, registration.event_id);
    if (!isAuthorized) {
      log.warn('Unauthorized check-in attempt', { userId, eventId: registration.event_id });
      return NextResponse.json(
        { error: 'FORBIDDEN', message: 'You do not have permission to perform check-in for this event.' },
        { status: 403 }
      );
    }

    const effectiveLocation = (location?.trim() || 'entrance');
    
    // Check for duplicate check-in at this location (for warning, not blocking)
    let isDuplicate = false;
    let duplicateMessage = '';
    const existingHistory = parseCheckInHistory(registration);
    const existingLocationEntryFromHistory = existingHistory
      .filter((entry) => entry.location.toLowerCase() === effectiveLocation.toLowerCase())
      .sort((a, b) => b.checked_in_at.localeCompare(a.checked_in_at))[0];
    const existingLocationEntry = existingLocationEntryFromHistory
      ? existingLocationEntryFromHistory
      : (
          registration.checked_in === true &&
          (registration.last_check_in_location || 'entrance').toLowerCase() === effectiveLocation.toLowerCase()
        )
        ? {
            location: registration.last_check_in_location || 'entrance',
            checked_in_at:
              registration.check_in_time ||
              registration.checked_in_at ||
              registration.$updatedAt ||
              new Date().toISOString(),
          }
        : undefined;

    if (existingLocationEntry) {
      isDuplicate = true;
      const checkedInAtRaw =
        existingLocationEntry.checked_in_at ||
        registration.check_in_time ||
        registration.checked_in_at ||
        registration.$updatedAt ||
        new Date().toISOString();
      const checkedInAt = new Date(checkedInAtRaw);
      const timeAgo = formatTimeAgo(checkedInAt);
      duplicateMessage = `Already checked in ${timeAgo}`;
      
      // Get location history for duplicate check-in info
      const locationHistory = getLocationRecency(registration);
      
      log.warn('Duplicate check-in blocked', { 
        registrationId: registration_id, 
        checkedInAt: checkedInAtRaw,
        location: effectiveLocation 
      });
      
      // Return error response (same as scanner's verify-qr) - do NOT proceed with check-in
      return NextResponse.json({
        error: 'ALREADY_CHECKED_IN',
        message: duplicateMessage,
        checked_in_at: checkedInAtRaw,
        time_ago: timeAgo,
        last_location: registration.last_check_in_location || effectiveLocation,
        location_history: locationHistory,
        student_name: registration.user_name,
        is_duplicate: true,
        duplicate_message: duplicateMessage,
      }, { status: 409 });
    }

    // Check payment status
    if (registration.payment_status === 'pending') {
      log.warn('Payment pending', { registrationId: registration_id });
      return NextResponse.json({
        error: 'PAYMENT_PENDING',
        message: 'Payment not completed for this registration.',
      }, { status: 400 });
    }

    // Build update payload with check-in history append
    const updatePayload = buildCheckInUpdatePayload(registration, effectiveLocation, userId);

    // Mark as checked in (all check-in state in registration)
    let updatedRegistration;
    try {
      updatedRegistration = await db.updateDocument(
        DATABASE_ID,
        EVENT_REGISTRATIONS_COLLECTION_ID,
        registration_id,
        updatePayload
      );
    } catch (updateError) {
      // Schema may not have check_in_history attribute yet - retry without it
      const appwriteErr = updateError as { code?: number; type?: string };
      if (appwriteErr.type === 'document_invalid_structure' || appwriteErr.code === 400) {
        // Fallback: update without check_in_history
        const fallbackPayload = { ...updatePayload };
        delete fallbackPayload.check_in_history;
        updatedRegistration = await db.updateDocument(
          DATABASE_ID,
          EVENT_REGISTRATIONS_COLLECTION_ID,
          registration_id,
          fallbackPayload
        );
        log.warn('check_in_history attribute not in schema, used fallback', { registrationId: registration_id });
      } else {
        throw updateError;
      }
    }

    // Get user name for display
    let userName = 'Unknown';
    try {
      const formResponses = registration.form_responses 
        ? JSON.parse(registration.form_responses) 
        : {};
      userName = formResponses.name || registration.user_name || 'Unknown';
    } catch {
      log.warn('Failed to parse form responses for user name, using fallback');
      userName = registration.user_name || 'Unknown';
    }

    // No check_in_logs creation - all state in registration document

    // Increment event-level check-in counter
    await incrementEventCheckInCount(registration.event_id);

    log.info('Check-in successful', { 
      registrationId: registration_id, 
      userId,
      location: effectiveLocation,
    });

    return NextResponse.json({
      success: true,
      registration: updatedRegistration,
      student_name: userName,
      location: effectiveLocation,
      message: `Successfully checked in ${userName}.`,
    });
  } catch (error) {
    log.error('Check-in failed', error instanceof Error ? error : new Error(String(error)));
    return handleError(error);
  }
}
