import { NextRequest, NextResponse } from 'next/server';
import { validateCSRF } from '@/lib/api/csrf';
import { getSignedInUserFromRequest } from '@/lib/passkeys/passkeyStore';
import { getDatabases, getUsers, DATABASE_ID, EVENTS_COLLECTION_ID, Query } from '@/lib/api/appwrite-admin';
import { EMAIL_LOGS_COLLECTION_ID } from '@/lib/constants/collections';
import { createLogger } from '@/lib/api/logger';
import { getUserSocietyIds, hasAdminAccess } from '@/lib/api/shared-utils';
import { handleError } from '@/lib/errorHandler';

export const runtime = 'nodejs';

const log = createLogger({ action: 'email-logs-api' });

/**
 * GET /api/admin/emails/logs
 * List email logs with filters
 * 
 * Query params:
 * - event_id: Filter by event
 * - status: Filter by status (sent/failed/pending)
 * - batch_id: Filter by batch
 * - date_from: ISO date string
 * - date_to: ISO date string
 * - page: Page number (default 1)
 * - limit: Items per page (default 50, max 100)
 * - search: Search by recipient email or name
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getSignedInUserFromRequest(req);
    if (!user) {
      return NextResponse.json(
        { error: 'UNAUTHORIZED', message: 'Authentication required.' },
        { status: 401 }
      );
    }

    const db = getDatabases();
    const societyIds = await getUserSocietyIds(user.$id, db);
    const isAdmin = await hasAdminAccess(user.$id, getUsers());
    if (societyIds.length === 0 && !isAdmin) {
      return NextResponse.json(
        { error: 'FORBIDDEN', message: 'Admin access required.' },
        { status: 403 }
      );
    }

    // Scope by user's societies
    let scopedEventIds: string[] | undefined;
    if (!isAdmin) {
      const eventsRes = await db.listDocuments(DATABASE_ID, EVENTS_COLLECTION_ID, [
        Query.equal('society_id', societyIds),
        Query.limit(500),
      ]);
      scopedEventIds = eventsRes.documents.map(e => e.$id);
      if (scopedEventIds.length === 0) {
        return NextResponse.json({
          success: true,
          logs: [],
          total: 0,
          page: 1,
          limit: 50,
          pages: 0,
        });
      }
    }

    const searchParams = req.nextUrl.searchParams;
    const eventId = searchParams.get('event_id');
    const status = searchParams.get('status');
    const batchId = searchParams.get('batch_id');
    const dateFrom = searchParams.get('date_from');
    const dateTo = searchParams.get('date_to');
    const search = searchParams.get('search');
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)));

    const queries: string[] = [];

    if (eventId) {
      queries.push(Query.equal('event_id', eventId));
    } else if (scopedEventIds) {
      queries.push(Query.equal('event_id', scopedEventIds));
    }
    if (status) {
      queries.push(Query.equal('status', status));
    }
    if (batchId) {
      queries.push(Query.equal('batch_id', batchId));
    }
    if (dateFrom) {
      queries.push(Query.greaterThanEqual('created_at', dateFrom));
    }
    if (dateTo) {
      queries.push(Query.lessThanEqual('created_at', dateTo));
    }
    if (search) {
      queries.push(Query.or([
        Query.contains('recipient_email', search),
        Query.contains('recipient_name', search),
      ]));
    }

    // Pagination
    queries.push(Query.orderDesc('created_at'));
    queries.push(Query.limit(limit));
    queries.push(Query.offset((page - 1) * limit));

    try {
      const result = await db.listDocuments(DATABASE_ID, EMAIL_LOGS_COLLECTION_ID, queries);

      // Get total count for pagination
      const countQueries = queries.filter(q => 
        !q.includes('limit') && !q.includes('offset') && !q.includes('orderDesc')
      );
      const countResult = await db.listDocuments(DATABASE_ID, EMAIL_LOGS_COLLECTION_ID, [
        ...countQueries,
        Query.limit(1),
      ]);

      return NextResponse.json({
        success: true,
        logs: result.documents,
        total: countResult.total,
        page,
        limit,
        pages: Math.ceil(countResult.total / limit),
      });
    } catch (error) {
      // If collection doesn't exist, return empty results
      const appwriteError = error as { code?: number; message?: string };
      if (appwriteError.code === 404 || appwriteError.message?.includes('Collection')) {
        log.warn('Email logs collection not found - returning empty results');
        return NextResponse.json({
          success: true,
          logs: [],
          total: 0,
          page: 1,
          limit,
          pages: 0,
          notice: 'Email logs collection not yet created. Run setup script to create it.',
        });
      }
      throw error;
    }
  } catch (error) {
    return handleError(error);
  }
}

/**
 * POST /api/admin/emails/logs
 * Retry failed emails
 * 
 * Body:
 * - log_ids: string[] - IDs of email logs to retry
 * - retry_all_failed: boolean - Retry all failed emails (optional)
 * - event_id: string - Retry all failed for a specific event (optional)
 */
export async function POST(req: NextRequest) {
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

    const db = getDatabases();
    const societyIds = await getUserSocietyIds(user.$id, db);
    const isAdmin = await hasAdminAccess(user.$id, getUsers());
    if (societyIds.length === 0 && !isAdmin) {
      return NextResponse.json(
        { error: 'FORBIDDEN', message: 'Admin access required.' },
        { status: 403 }
      );
    }

    let scopedEventIds: string[] | undefined;
    if (!isAdmin) {
      const eventsRes = await db.listDocuments(DATABASE_ID, EVENTS_COLLECTION_ID, [
        Query.equal('society_id', societyIds),
        Query.limit(500),
      ]);
      scopedEventIds = eventsRes.documents.map(e => e.$id);
    }

    const body = await req.json();
    const { log_ids, retry_all_failed, event_id } = body;

    // Inline helper: retry emails by resetting their DB status to pending
    async function retryLogs(ids: string[]): Promise<{ queued: number; failed: number; batch_id?: string }> {
      let queued = 0;
      let failed = 0;
      for (const logId of ids) {
        try {
          const doc = await db.getDocument(DATABASE_ID, EMAIL_LOGS_COLLECTION_ID, logId) as unknown as { status: string };
          if (doc.status !== 'failed') {
            failed++;
            continue;
          }
          await db.updateDocument(DATABASE_ID, EMAIL_LOGS_COLLECTION_ID, logId, { status: 'pending', error_message: null });
          queued++;
        } catch {
          log.warn('Failed to retry email log', { logId });
          failed++;
        }
      }
      const batchId = queued > 0 ? `retry_${Date.now()}_${Math.random().toString(36).substr(2, 9)}` : undefined;
      return { queued, failed, batch_id: batchId };
    }

    if (retry_all_failed) {
      // Retry all failed emails
      const queries = [Query.equal('status', 'failed')];
      if (event_id) {
        queries.push(Query.equal('event_id', event_id));
      } else if (scopedEventIds) {
        queries.push(Query.equal('event_id', scopedEventIds));
      }
      queries.push(Query.limit(500)); // Limit to 500 per request

      try {
        const failed = await db.listDocuments(DATABASE_ID, EMAIL_LOGS_COLLECTION_ID, queries);
        const failedIds = failed.documents.map((d) => d.$id);
        
        if (failedIds.length === 0) {
          return NextResponse.json({
            success: true,
            retried: 0,
            message: 'No failed emails to retry.',
          });
        }

        const result = await retryLogs(failedIds);
        
        log.info('Retried failed emails', {
          count: String(result.queued),
          total_failed: String(failedIds.length),
        });

        return NextResponse.json({
          success: true,
          retried: result.queued,
          failed: result.failed,
          batch_id: result.batch_id,
          message: `Queued ${result.queued} email(s) for retry.`,
        });
      } catch (error) {
        const appwriteError = error as { code?: number };
        if (appwriteError.code === 404) {
          return NextResponse.json({
            success: false,
            error: 'NOT_FOUND',
            message: 'Email logs collection not found.',
          }, { status: 404 });
        }
        throw error;
      }
    }

    if (!Array.isArray(log_ids) || log_ids.length === 0) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', message: 'log_ids array is required.' },
        { status: 400 }
      );
    }

    if (log_ids.length > 100) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', message: 'Maximum 100 emails per retry request.' },
        { status: 400 }
      );
    }

    const result = await retryLogs(log_ids);

    log.info('Retried selected emails', {
      requested: String(log_ids.length),
      queued: String(result.queued),
    });

    return NextResponse.json({
      success: true,
      retried: result.queued,
      failed: result.failed,
      batch_id: result.batch_id,
      message: `Queued ${result.queued} email(s) for retry.`,
    });
  } catch (error) {
    return handleError(error);
  }
}
