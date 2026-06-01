import { NextRequest, NextResponse } from 'next/server';
import { Query } from 'node-appwrite';
import Papa from 'papaparse';
import { getSignedInUserFromRequest } from '@/lib/passkeys/passkeyStore';
import { getDatabases, DATABASE_ID, EVENTS_COLLECTION_ID, REGISTRATIONS_COLLECTION_ID } from '@/lib/api/appwrite-admin';
import { isUserChairOfEvent } from '@/lib/api/auth-check';
import { createLogger } from '@/lib/api/logger';
import { formatDate, getPhoneValue } from '@/lib/api/shared-utils';
import { handleError } from '@/lib/errorHandler';

export const runtime = 'nodejs';

const moduleLog = createLogger({ action: 'event-export' });
const eventLog = createLogger({ action: 'event-export-handler' });

interface RouteParams {
    params: Promise<{ eventId: string }>;
}

// Parse form responses safely
function parseFormResponses(formResponses: string | null | undefined): Record<string, unknown> {
    if (!formResponses) return {};
    try {
        return JSON.parse(formResponses);
    } catch {
        moduleLog.warn('Failed to parse form responses JSON during export');
        return {};
    }
}

/**
 * GET /api/admin/events/[eventId]/export
 * Export registrations as CSV or PDF
 * 
 * Query params:
 * - type: 'csv' | 'pdf' (default: 'csv')
 * - filter: 'all' | 'checked_in' | 'contacts' | 'pending' (default: 'all')
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
    const { eventId } = await params;
    const searchParams = req.nextUrl.searchParams;
    const type = searchParams.get('type') || 'csv';
    const filter = searchParams.get('filter') || 'all';

    try {
        // Authentication - verify user is signed in
        const user = await getSignedInUserFromRequest(req);
        if (!user) {
            return NextResponse.json(
                { error: 'UNAUTHORIZED', message: 'Authentication required.' },
                { status: 401 }
            );
        }

        const databases = getDatabases();

        // Get event details
    let event;
    try {
      event = await databases.getDocument(DATABASE_ID, EVENTS_COLLECTION_ID, eventId);
    } catch {
      moduleLog.warn('Event not found for export', { eventId });
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Event not found' },
        { status: 404 }
      );
    }

        // Authorization - check if user is chair of this event
        const isEventChair = await isUserChairOfEvent(user.$id, eventId);
        if (!isEventChair) {
            return NextResponse.json(
                { error: 'FORBIDDEN', message: 'You do not have permission to export this event.' },
                { status: 403 }
            );
        }

        // Build query based on filter
        const queries: string[] = [Query.equal('event_id', eventId)];
        
        if (filter === 'checked_in') {
            queries.push(Query.equal('checked_in', true));
        } else if (filter === 'pending') {
            queries.push(Query.equal('payment_status', 'pending'));
        }

        // Fetch all registrations with pagination
        const registrations: Record<string, unknown>[] = [];
        let offset = 0;
        const limit = 100;
        
        while (true) {
            const batch = await databases.listDocuments(
                DATABASE_ID,
                REGISTRATIONS_COLLECTION_ID,
                [
                    ...queries,
                    Query.limit(limit),
                    Query.offset(offset),
                    Query.orderDesc('registration_date'),
                ]
            );
            
            registrations.push(...batch.documents);
            
            if (batch.documents.length < limit) break;
            offset += limit;
        }

        if (registrations.length === 0) {
            return NextResponse.json(
                { error: 'NO_DATA', message: 'No registrations found matching the filter' },
                { status: 404 }
            );
        }

        // Generate CSV based on filter type
        let csvData: Record<string, unknown>[];
        let filename: string;
        const timestamp = new Date().toISOString().split('T')[0];

        if (filter === 'contacts') {
            // Contact list: Names, emails, phones only
            csvData = registrations.map((r, index) => ({
                'S.No': index + 1,
                'Name': r.user_name || '-',
                'Email': r.user_email || '-',
                'Phone': getPhoneValue({ ...r }),
            }));
            filename = `export_${eventId}_${timestamp}.csv`;
        } else if (filter === 'checked_in') {
            // Attendance report: Checked-in students with check-in time
            csvData = registrations.map((r, index) => {
                const formData = parseFormResponses(r.form_responses as string);
                return {
                    'S.No': index + 1,
                    'Ticket ID': r.ticket_id || '-',
                    'Name': r.user_name || '-',
                    'Email': r.user_email || '-',
                    'Phone': getPhoneValue({ ...r, ...formData }),
                    'Department': formData.department || formData.dept || '-',
                    'Semester': formData.semester || formData.sem || '-',
                    'Check-in Time': formatDate(r.check_in_time as string),
                    'Checked In By': r.checked_in_by || '-',
                };
            });
            filename = `export_${eventId}_${timestamp}.csv`;
        } else {
            // All registrations: Full data with all fields
            csvData = registrations.map((r, index) => {
                const formData = parseFormResponses(r.form_responses as string);
                
                // Base fields
                const row: Record<string, unknown> = {
                    'S.No': index + 1,
                    'Ticket ID': r.ticket_id || '-',
                    'Name': r.user_name || '-',
                    'Email': r.user_email || '-',
                    'Phone': getPhoneValue({ ...r, ...formData }),
                    'Registration Date': formatDate(r.registration_date as string),
                    'Registration Status': r.registration_status || '-',
                    'Payment Status': r.payment_status || '-',
                    'Amount Paid': r.amount_paid || 0,
                    'Payment Reference': r.payment_reference || '-',
                    'UTR Number': r.utr_number || '-',
                    'Checked In': r.checked_in ? 'Yes' : 'No',
                    'Check-in Time': r.checked_in ? formatDate(r.check_in_time as string) : '-',
                };

                // Add common form fields
                row['Department'] = formData.department || formData.dept || '-';
                row['Semester'] = formData.semester || formData.sem || '-';
                row['Section'] = formData.section || '-';
                row['Roll Number'] = formData.roll_number || formData.rollNumber || '-';
                row['College'] = formData.college || '-';
                row['Year'] = formData.year || '-';

                // Add any additional custom fields from form_responses
                const standardFields = [
                    'department', 'dept', 'semester', 'sem', 'section', 
                    'roll_number', 'rollNumber', 'college', 'year'
                ];
                
                Object.entries(formData).forEach(([key, value]) => {
                    if (!standardFields.includes(key) && value) {
                        // Convert camelCase/snake_case to Title Case
                        const label = key
                            .replace(/_/g, ' ')
                            .replace(/([A-Z])/g, ' $1')
                            .replace(/^./, str => str.toUpperCase())
                            .trim();
                        row[`Custom: ${label}`] = String(value);
                    }
                });

                return row;
            });
            filename = `export_${eventId}_${timestamp}.csv`;
        }

        // Generate CSV using papaparse
        const csv = Papa.unparse(csvData, {
            quotes: true,
            header: true,
        });

        // Add BOM for Excel compatibility with UTF-8
        const bom = '\uFEFF';
        const csvWithBom = bom + csv;

        // Return CSV file
        return new NextResponse(csvWithBom, {
            status: 200,
            headers: {
                'Content-Type': 'text/csv; charset=utf-8',
                'Content-Disposition': `attachment; filename="${filename}"`,
                'Cache-Control': 'no-cache',
            },
        });
    } catch (error) {
        return handleError(error);
    }
}
