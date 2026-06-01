import { NextRequest, NextResponse } from 'next/server';
import { validateCSRF } from '@/lib/api/csrf';
import { getSignedInUserFromRequest } from '@/lib/passkeys/passkeyStore';
import {
  getDatabases,
  DATABASE_ID,
  REGISTRATIONS_COLLECTION_ID,
  RegistrationDocument,
  getEvent,
  ID,
} from '@/lib/api/appwrite-admin';
import { EMAIL_LOGS_COLLECTION_ID } from '@/lib/constants/collections';
import { createLogger } from '@/lib/api/logger';
import { resendTicketEmail } from '@/lib/emailIntegration';
import { isUserChairOfEvent } from '@/lib/api/auth-check';

export const runtime = 'nodejs';

const moduleLog = createLogger({ action: 'bulk-email' });

interface RouteParams {
  params: Promise<{ eventId: string }>;
}

interface BulkEmailRequest {
  registration_ids?: string[];
}

interface FailedEmail {
  registration_id: string;
  email: string;
  name: string;
  error: string;
}

/**
 * Log email attempt to database for tracking
 */
async function logEmailAttempt(
  db: ReturnType<typeof getDatabases>,
  data: {
    recipient_email: string;
    recipient_name: string;
    registration_id: string;
    event_id: string;
    event_title: string;
    subject: string;
    status: 'sent' | 'failed' | 'pending';
    error_message?: string;
    batch_id: string;
  }
): Promise<string | null> {
  try {
    const doc = await db.createDocument(
      DATABASE_ID,
      EMAIL_LOGS_COLLECTION_ID,
      ID.unique(),
      {
        ...data,
        attempts: 1,
        created_at: new Date().toISOString(),
      }
    );
    return doc.$id;
  } catch (error) {
    moduleLog.warn('Failed to log email attempt (collection may not exist)');
    return null;
  }
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { eventId } = await params;
  const log = createLogger({ action: 'bulk-send-registration-email', eventId });

  try {
    if (!validateCSRF(req)) {
      return NextResponse.json({ success: false, error: 'CSRF validation failed' }, { status: 403 });
    }
    const user = await getSignedInUserFromRequest(req);
    if (!user) {
      return NextResponse.json(
        { error: 'UNAUTHORIZED', message: 'Authentication required.' },
        { status: 401 }
      );
    }

    const isChair = await isUserChairOfEvent(user.$id, eventId);
    if (!isChair) {
      return NextResponse.json(
        { error: 'FORBIDDEN', message: 'Not authorized to send emails for this event.' },
        { status: 403 }
      );
    }

    const body = (await req.json()) as BulkEmailRequest;
    const registrationIds = Array.isArray(body.registration_ids) ? body.registration_ids : [];

    if (registrationIds.length === 0) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', message: 'registration_ids is required.' },
        { status: 400 }
      );
    }

    if (registrationIds.length > 500) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', message: 'Maximum 500 registrations per request.' },
        { status: 400 }
      );
    }

    const event = await getEvent(eventId);
    if (!event) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Event not found.' },
        { status: 404 }
      );
    }

    // Generate batch ID for tracking this bulk operation
    const batchId = `bulk_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const db = getDatabases();

    const registrations = await Promise.all(
      registrationIds.map(async (registrationId) => {
        try {
          const reg = (await db.getDocument(
            DATABASE_ID,
            REGISTRATIONS_COLLECTION_ID,
            registrationId
          )) as unknown as RegistrationDocument;

          if (reg.event_id !== eventId) return null;
          return reg;
        } catch {
          moduleLog.warn('Failed to fetch registration for bulk email', { registrationId });
          return null;
        }
      })
    );

    const validRegistrations = registrations.filter((r): r is RegistrationDocument => Boolean(r));

    let sentCount = 0;
    let queuedCount = 0;
    const failedEmails: FailedEmail[] = [];
    const immediateFailures: FailedEmail[] = [];

    for (const registration of validRegistrations) {
      const recipientEmail = registration.user_email || '';
      const recipientName = registration.user_name || 'Registrant';

      try {
        const result = await resendTicketEmail(
          {
            $id: registration.$id,
            user_id: registration.user_id,
            event_id: registration.event_id,
            ticket_id: registration.ticket_id,
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

        if (result.success) {
          sentCount++;
          queuedCount++;
          
          // Log successful queue to database
          await logEmailAttempt(db, {
            recipient_email: recipientEmail,
            recipient_name: recipientName,
            registration_id: registration.$id,
            event_id: eventId,
            event_title: event.title,
            subject: `Your Registration for ${event.title}`,
            status: 'pending', // Will be updated to 'sent' by queue processor
            batch_id: batchId,
          });
        } else {
          const failure: FailedEmail = {
            registration_id: registration.$id,
            email: recipientEmail,
            name: recipientName,
            error: result.error || 'Unknown error',
          };
          failedEmails.push(failure);
          immediateFailures.push(failure);
          
          // Log failed attempt to database
          await logEmailAttempt(db, {
            recipient_email: recipientEmail,
            recipient_name: recipientName,
            registration_id: registration.$id,
            event_id: eventId,
            event_title: event.title,
            subject: `Your Registration for ${event.title}`,
            status: 'failed',
            error_message: result.error || 'Unknown error',
            batch_id: batchId,
          });
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        const failure: FailedEmail = {
          registration_id: registration.$id,
          email: recipientEmail,
          name: recipientName,
          error: errorMsg,
        };
        failedEmails.push(failure);
        immediateFailures.push(failure);
        
        // Log exception to database
        await logEmailAttempt(db, {
          recipient_email: recipientEmail,
          recipient_name: recipientName,
          registration_id: registration.$id,
          event_id: eventId,
          event_title: event.title,
          subject: `Your Registration for ${event.title}`,
          status: 'failed',
          error_message: errorMsg,
          batch_id: batchId,
        });
      }
    }

    const skippedCount = registrationIds.length - validRegistrations.length;

    log.info('Bulk registration email processed', {
      batchId,
      requested: String(registrationIds.length),
      valid: String(validRegistrations.length),
      queued: String(queuedCount),
      failed: String(failedEmails.length),
      skipped: String(skippedCount),
    });

    return NextResponse.json({
      success: true,
      batch_id: batchId,
      requested_count: registrationIds.length,
      processed_count: validRegistrations.length,
      queued_count: queuedCount,
      sent_count: sentCount,
      failed_count: failedEmails.length,
      skipped_count: skippedCount,
      immediate_failures: immediateFailures,
      failed_registration_ids: failedEmails.map((f) => f.registration_id),
      message: `Queued ${queuedCount} email(s) for sending. ${failedEmails.length} failed immediately. Track progress at /admin/emails with batch ID: ${batchId}`,
    });
  } catch (error) {
    log.error(
      'Failed to process bulk registration emails',
      error instanceof Error ? error : new Error(String(error))
    );
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'Failed to send bulk emails.' },
      { status: 500 }
    );
  }
}
