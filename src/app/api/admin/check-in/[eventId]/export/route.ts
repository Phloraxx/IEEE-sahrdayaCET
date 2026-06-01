import { NextRequest, NextResponse } from 'next/server';
import { getSignedInUserFromRequest } from '@/lib/passkeys/passkeyStore';
import { 
  getDatabases, 
  Query, 
  DATABASE_ID,
  EVENTS_COLLECTION_ID,
  EVENT_REGISTRATIONS_COLLECTION_ID,
  getLocationRecency,
  type RegistrationDocument,
} from '@/lib/api/appwrite-admin';
import { createLogger } from '@/lib/api/logger';
import { handleError } from '@/lib/errorHandler';
import { isUserChairOfEvent } from '@/lib/api/auth-check';

export const runtime = 'nodejs';

const moduleLog = createLogger({ action: 'checkin-export' });

interface RouteParams {
  params: Promise<{ eventId: string }>;
}

// Escape CSV field
function escapeCSV(field: string | undefined | null): string {
  if (field === undefined || field === null) return '';
  const str = String(field);
  // If field contains comma, quote, or newline, wrap in quotes and escape internal quotes
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// Format date for display
function formatDateTime(isoString: string | undefined): string {
  if (!isoString) return '';
  try {
    const date = new Date(isoString);
    return date.toLocaleString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    moduleLog.warn('Failed to format date in export', { isoString });
    return isoString;
  }
}

/**
 * GET /api/admin/check-in/[eventId]/export
 * Export check-in data as CSV
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  const { eventId } = await params;
  const log = createLogger({ action: 'export_checkins', eventId });

  try {
    const user = await getSignedInUserFromRequest(req);
    if (!user) {
      log.warn('Unauthorized export attempt');
      return NextResponse.json(
        { error: 'UNAUTHORIZED', message: 'Authentication required.' },
        { status: 401 }
      );
    }

    // Check authorization
    const isAuthorized = await isUserChairOfEvent(user.$id, eventId);
    if (!isAuthorized) {
      log.warn('Unauthorized export attempt', { userId: user.$id, eventId });
      return NextResponse.json(
        { error: 'FORBIDDEN', message: 'You do not have permission to export check-in data for this event.' },
        { status: 403 }
      );
    }

    const db = getDatabases();

    // Get event details
    const event = await db.getDocument(DATABASE_ID, EVENTS_COLLECTION_ID, eventId);
    const eventTitle = event.title as string;

    // Get query params for filtering
    const { searchParams } = new URL(req.url);
    const checkedInOnly = searchParams.get('checkedInOnly') === 'true';
    
    // Build query
    const queries = [
      Query.equal('event_id', eventId),
      Query.equal('registration_status', 'confirmed'),
    ];
    
    if (checkedInOnly) {
      queries.push(Query.equal('checked_in', true));
    }
    
    queries.push(Query.limit(1000)); // Max export limit

    // Fetch all registrations
    const registrationsResult = await db.listDocuments(
      DATABASE_ID,
      EVENT_REGISTRATIONS_COLLECTION_ID,
      queries
    );

    // Build CSV
    const headers = [
      'Name',
      'Email',
      'Ticket ID',
      'Registration ID',
      'Checked In',
      'First Check-In Time',
      'Last Check-In Time',
      'Last Location',
      'Check-In Count',
      'Location History',
      'Payment Status',
      'Registered At',
    ];

    const rows: string[][] = [];

    for (const rawReg of registrationsResult.documents) {
      const reg = rawReg as unknown as RegistrationDocument;

      // Get name and email from form_responses
      let studentName = reg.user_name || 'Unknown';
      let email = reg.user_email || '';

      try {
        const formResponses = reg.form_responses ? JSON.parse(reg.form_responses) : {};
        studentName = formResponses.name || studentName;
        email = formResponses.email || email;
      } catch {
        log.warn('Failed to parse form responses in export');
      }

      // Get check-in details
      const isCheckedIn = Boolean(reg.checked_in);
      const checkedInAt = reg.check_in_time || reg.checked_in_at || undefined;
      const lastLocation = reg.last_check_in_location || (isCheckedIn ? 'entrance' : '');
      
      // Get location history
      const locationHistory = isCheckedIn ? getLocationRecency(reg) : [];
      const checkInCount = locationHistory.length || (isCheckedIn ? 1 : 0);
      
      // Format location history as readable string
      let locationHistoryStr = '';
      if (locationHistory.length > 0) {
        locationHistoryStr = locationHistory
          .map(loc => `${loc.location} (${formatDateTime(loc.checkedInAt)})`)
          .join('; ');
      }
      
      // Get first check-in time (from history or main field)
      let firstCheckInTime = '';
      if (locationHistory.length > 0) {
        // Sort by time ascending to get first
        const sorted = [...locationHistory].sort((a, b) => 
          (a.checkedInAt || '').localeCompare(b.checkedInAt || '')
        );
        firstCheckInTime = formatDateTime(sorted[0]?.checkedInAt);
      } else if (checkedInAt) {
        firstCheckInTime = formatDateTime(checkedInAt);
      }
      
      // Get last check-in time
      let lastCheckInTime = '';
      if (locationHistory.length > 0) {
        // Sort by time descending to get last
        const sorted = [...locationHistory].sort((a, b) => 
          (b.checkedInAt || '').localeCompare(a.checkedInAt || '')
        );
        lastCheckInTime = formatDateTime(sorted[0]?.checkedInAt);
      } else if (checkedInAt) {
        lastCheckInTime = formatDateTime(checkedInAt);
      }

      rows.push([
        escapeCSV(studentName),
        escapeCSV(email),
        escapeCSV(reg.ticket_id || reg.$id),
        escapeCSV(reg.$id),
        isCheckedIn ? 'Yes' : 'No',
        escapeCSV(firstCheckInTime),
        escapeCSV(lastCheckInTime),
        escapeCSV(lastLocation),
        String(checkInCount),
        escapeCSV(locationHistoryStr),
        escapeCSV(reg.payment_status || 'unknown'),
        escapeCSV(formatDateTime(reg.$createdAt)),
      ]);
    }

    // Build CSV content
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(',')),
    ].join('\n');

    // Generate filename
    const sanitizedTitle = eventTitle.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30);
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `checkins_${sanitizedTitle}_${dateStr}.csv`;

    log.info('Check-in data exported', { 
      eventId, 
      totalRecords: rows.length,
      checkedInOnly,
    });

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    log.error('Export failed', error instanceof Error ? error : new Error(String(error)));
    return handleError(error);
  }
}
