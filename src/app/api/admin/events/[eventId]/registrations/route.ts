import { NextRequest, NextResponse } from 'next/server';
import { validateCSRF } from '@/lib/api/csrf';
import { getSignedInUserFromRequest } from '@/lib/passkeys/passkeyStore';
import {
  getDatabases,
  getUsers,
  ID,
  Query,
  DATABASE_ID,
  EVENTS_COLLECTION_ID,
  REGISTRATIONS_COLLECTION_ID,
} from '@/lib/api/appwrite-admin';
import { createLogger } from '@/lib/api/logger';
import { isUserChairOfEvent } from '@/lib/api/auth-check';
import { handleError } from '@/lib/errorHandler';

export const runtime = 'nodejs';

const moduleLog = createLogger({ action: 'event-registrations' });

// Simple in-memory cache for user lookups (TTL: 5 minutes)
const userCache = new Map<string, { data: { name: string; email: string }; expires: number }>();
const USER_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCachedUser(userId: string): { name: string; email: string } | null {
  const cached = userCache.get(userId);
  if (cached && cached.expires > Date.now()) {
    return cached.data;
  }
  if (cached) {
    userCache.delete(userId);
  }
  return null;
}

function setCachedUser(userId: string, data: { name: string; email: string }) {
  // Limit cache size to prevent memory issues
  if (userCache.size > 1000) {
    // Remove oldest entries
    const entries = Array.from(userCache.entries());
    entries.sort((a, b) => a[1].expires - b[1].expires);
    for (let i = 0; i < 200; i++) {
      userCache.delete(entries[i][0]);
    }
  }
  userCache.set(userId, { data, expires: Date.now() + USER_CACHE_TTL });
}

interface RouteParams {
  params: Promise<{ eventId: string }>;
}

function normalizeIndianPhone(raw: string): { local: string; e164: string } | null {
  const digits = raw.replace(/\D/g, '');
  let local = '';

  if (/^[6-9]\d{9}$/.test(digits)) {
    local = digits;
  } else if (/^91[6-9]\d{9}$/.test(digits)) {
    local = digits.slice(2);
  } else if (/^0[6-9]\d{9}$/.test(digits)) {
    local = digits.slice(1);
  }

  if (!local) return null;
  return { local, e164: `+91${local}` };
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === 'number') {
    return String(value);
  }
  return null;
}

function parseRegistrationFormPayload(reg: Record<string, unknown>): Record<string, unknown> {
  const fromFormResponses = reg.form_responses;
  if (typeof fromFormResponses === 'string' && fromFormResponses.trim()) {
    try {
      const parsed = JSON.parse(fromFormResponses);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      moduleLog.warn('Failed to parse form_responses JSON, falling through to legacy shape');
    }
  } else if (fromFormResponses && typeof fromFormResponses === 'object' && !Array.isArray(fromFormResponses)) {
    return fromFormResponses as Record<string, unknown>;
  }

  const fromFormData = reg.form_data;
  if (typeof fromFormData === 'string' && fromFormData.trim()) {
    try {
      const parsed = JSON.parse(fromFormData);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      moduleLog.warn('Failed to parse form_data JSON, returning empty object');
      return {};
    }
  } else if (fromFormData && typeof fromFormData === 'object' && !Array.isArray(fromFormData)) {
    return fromFormData as Record<string, unknown>;
  }

  return {};
}

function getRegistrationPhone(reg: Record<string, unknown>, formPayload: Record<string, unknown>): string {
  return (
    asNonEmptyString(reg.user_phone) ||
    asNonEmptyString(reg.user_phone_) ||
    asNonEmptyString(formPayload.user_phone) ||
    asNonEmptyString(formPayload.user_phone_) ||
    asNonEmptyString(formPayload.phone) ||
    ''
  );
}

/**
 * GET /api/admin/events/[eventId]/registrations
 * List all registrations for an event with pagination and filters
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  const { eventId } = await params;
  const log = createLogger({ action: 'list_event_registrations', eventId });

  try {
    // Authentication
    const user = await getSignedInUserFromRequest(req);
    if (!user) {
      return NextResponse.json(
        { error: 'UNAUTHORIZED', message: 'Authentication required.' },
        { status: 401 }
      );
    }

    // Authorization
    const isChair = await isUserChairOfEvent(user.$id, eventId);
    if (!isChair) {
      log.warn('Unauthorized registrations access', { userId: user.$id, eventId });
      return NextResponse.json(
        { error: 'FORBIDDEN', message: 'Not authorized to view this event\'s registrations.' },
        { status: 403 }
      );
    }

    // Parse query params
    const { searchParams } = new URL(req.url);
    const allIdsOnly = searchParams.get('all_ids') === 'true';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);
    const search = searchParams.get('search') || '';
    const paymentStatus = searchParams.get('payment_status') || 'all';
    const checkinStatus = searchParams.get('checkin_status') || 'all';
    const dateFrom = searchParams.get('date_from') || '';
    const dateTo = searchParams.get('date_to') || '';
    const sortBy = searchParams.get('sort_by') || 'registration_date';
    const sortOrder = searchParams.get('sort_order') || 'desc';

    const db = getDatabases();
    const users = getUsers();
    
    // Build query
    const queries: string[] = [
      Query.equal('event_id', eventId),
    ];
    
    // Add filters
    if (paymentStatus && paymentStatus !== 'all') {
      queries.push(Query.equal('payment_status', paymentStatus));
    }
    
    if (checkinStatus && checkinStatus !== 'all') {
      if (checkinStatus === 'checked_in') {
        queries.push(Query.equal('checked_in', true));
      } else if (checkinStatus === 'not_checked_in') {
        queries.push(Query.equal('checked_in', false));
      }
    }

    // Add date range filters
    if (dateFrom) {
      queries.push(Query.greaterThanEqual('$createdAt', dateFrom));
    }
    if (dateTo) {
      queries.push(Query.lessThanEqual('$createdAt', dateTo));
    }

    // If only IDs are requested, return them quickly using select to minimize data transfer
    if (allIdsOnly) {
      const allIds: string[] = [];
      let cursor: string | undefined = undefined;
      
      // Fetch all IDs in batches of 100, selecting only $id
      while (true) {
        const batchQueries = [...queries, Query.limit(100), Query.select(['$id'])];
        if (cursor) {
          batchQueries.push(Query.cursorAfter(cursor));
        }
        
        const batch = await db.listDocuments(DATABASE_ID, REGISTRATIONS_COLLECTION_ID, batchQueries);
        allIds.push(...batch.documents.map(doc => doc.$id));
        
        if (batch.documents.length < 100) break;
        cursor = batch.documents[batch.documents.length - 1].$id;
      }
      
      return NextResponse.json({ all_ids: allIds });
    }
    
    // Add sorting
    if (sortOrder === 'desc') {
      queries.push(Query.orderDesc(sortBy === 'registration_date' ? '$createdAt' : sortBy));
    } else {
      queries.push(Query.orderAsc(sortBy === 'registration_date' ? '$createdAt' : sortBy));
    }
    
    const isSearching = !!search.trim();
    const searchLower = search.toLowerCase().trim();
    
    // OPTIMIZATION: For non-search queries, use efficient pagination with total from response
    // For search queries, we need to fetch more records to filter, but limit to reasonable amount
    const SEARCH_FETCH_LIMIT = 200; // Reduced from 500 for faster response
    
    if (isSearching) {
      // Fetch more results when searching to allow post-filtering
      queries.push(Query.limit(SEARCH_FETCH_LIMIT));
    } else {
      // Normal pagination - Appwrite returns total in response
      queries.push(Query.limit(limit));
      queries.push(Query.offset((page - 1) * limit));
    }
    
    // Fetch registrations and event in parallel
    const [registrationsRes, event] = await Promise.all([
      db.listDocuments(DATABASE_ID, REGISTRATIONS_COLLECTION_ID, queries),
      db.getDocument(DATABASE_ID, EVENTS_COLLECTION_ID, eventId),
    ]);
    
    // OPTIMIZATION: Batch user lookups - collect unique user IDs first
    const userIds = Array.from(new Set(registrationsRes.documents.map(reg => reg.user_id as string)));
    
    // Fetch users in batches with caching
    const userMap = new Map<string, { name: string; email: string }>();
    const uncachedUserIds: string[] = [];
    
    // Check cache first
    for (const userId of userIds) {
      const cached = getCachedUser(userId);
      if (cached) {
        userMap.set(userId, cached);
      } else {
        uncachedUserIds.push(userId);
      }
    }
    
    // Batch fetch uncached users (in chunks of 50 to avoid overwhelming Appwrite)
    const BATCH_SIZE = 50;
    for (let i = 0; i < uncachedUserIds.length; i += BATCH_SIZE) {
      const batch = uncachedUserIds.slice(i, i + BATCH_SIZE);
      const userPromises = batch.map(async (userId) => {
        try {
          const user = await users.get(userId);
          const userData = { name: user.name || 'Unknown', email: user.email || '' };
          setCachedUser(userId, userData);
          return { userId, ...userData };
        } catch {
          moduleLog.warn('User not found for ID', { userId });
          return { userId, name: '', email: '' };
        }
      });
      const batchResults = await Promise.all(userPromises);
      for (const result of batchResults) {
        userMap.set(result.userId, { name: result.name, email: result.email });
      }
    }
    
    // Enrich registrations (now synchronous since we pre-fetched users)
    const enrichedRegistrations = registrationsRes.documents.map((reg) => {
      const regRecord = reg as Record<string, unknown>;
      const formPayload = parseRegistrationFormPayload(regRecord);
      const userId = reg.user_id as string;
      
      // Get user info from our map or fall back to form data
      const userInfo = userMap.get(userId);
      const userName = userInfo?.name || asNonEmptyString(formPayload.name) || asNonEmptyString(regRecord.user_name) || 'Unknown';
      const userEmail = userInfo?.email || asNonEmptyString(formPayload.email) || asNonEmptyString(regRecord.user_email) || '';
      
      const userPhone = getRegistrationPhone(regRecord, formPayload);
      const ticketId = (reg.ticket_id as string) || '';
      
      // Apply search filter if searching
      if (isSearching) {
        const matchesName = userName.toLowerCase().includes(searchLower);
        const matchesEmail = userEmail.toLowerCase().includes(searchLower);
        const matchesPhone = userPhone.includes(searchLower);
        const matchesTicket = ticketId.toLowerCase().includes(searchLower);
        if (!matchesName && !matchesEmail && !matchesPhone && !matchesTicket) {
          return null;
        }
      }
      
      return {
        id: reg.$id,
        $id: reg.$id,
        $createdAt: reg.$createdAt,
        user_id: userId,
        user_name: userName,
        user_email: userEmail,
        user_phone: userPhone,
        department: asNonEmptyString(formPayload.department) || asNonEmptyString(formPayload.dept) || '',
        semester: asNonEmptyString(formPayload.semester) || asNonEmptyString(formPayload.sem) || '',
        form_data: formPayload,
        payment_status: reg.payment_status || 'pending',
        registration_status: reg.registration_status || 'pending',
        checked_in: reg.checked_in || false,
        checked_in_at: reg.checked_in_at,
        ticket_id: ticketId,
      };
    });
    
    // Filter out nulls (search non-matches)
    const allFilteredRegistrations = enrichedRegistrations.filter(r => r !== null);
    
    // Calculate totals and apply pagination for search results
    let finalRegistrations;
    let total: number;
    let totalPages: number;
    
    if (isSearching) {
      // For search: total is the filtered count, paginate the filtered results
      total = allFilteredRegistrations.length;
      totalPages = Math.ceil(total / limit);
      const startIndex = (page - 1) * limit;
      finalRegistrations = allFilteredRegistrations.slice(startIndex, startIndex + limit);
    } else {
      // For non-search: use Appwrite's returned total (no extra query needed!)
      total = registrationsRes.total;
      totalPages = Math.ceil(total / limit);
      finalRegistrations = allFilteredRegistrations;
    }

    return NextResponse.json({
      registrations: finalRegistrations,
      total,
      pages: totalPages,
      page,
      limit,
      event: {
        $id: event.$id,
        title: event.title,
        date: event.date,
        price: event.price,
      },
    });
  } catch (error) {
    return handleError(error);
  }
}

/**
 * POST /api/admin/events/[eventId]/registrations
 * Manual registration by admin
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  const { eventId } = await params;
  const log = createLogger({ action: 'manual_registration', eventId });

  try {
    if (!validateCSRF(req)) {
      return NextResponse.json({ success: false, error: 'CSRF validation failed' }, { status: 403 });
    }
    // Authentication
    const user = await getSignedInUserFromRequest(req);
    if (!user) {
      return NextResponse.json(
        { error: 'UNAUTHORIZED', message: 'Authentication required.' },
        { status: 401 }
      );
    }

    // Authorization
    const isChair = await isUserChairOfEvent(user.$id, eventId);
    if (!isChair) {
      log.warn('Unauthorized manual registration attempt', { userId: user.$id, eventId });
      return NextResponse.json(
        { error: 'FORBIDDEN', message: 'Not authorized to create registrations for this event.' },
        { status: 403 }
      );
    }

    // Parse request body
    const body = await req.json();
    const { name, email, phone, department, semester, section, roll_number } = body;
    const normalizedPhone = phone && String(phone).trim()
      ? normalizeIndianPhone(String(phone))
      : null;

    // Validate required fields
    if (!name || !email) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', message: 'Name and email are required.' },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', message: 'Invalid email format.' },
        { status: 400 }
      );
    }

    // Validate phone if provided
    if (phone && String(phone).trim() && !normalizedPhone) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', message: 'Phone must be a valid Indian mobile number.' },
        { status: 400 }
      );
    }

    const db = getDatabases();
    const users = getUsers();

    // Get event
    const event = await db.getDocument(DATABASE_ID, EVENTS_COLLECTION_ID, eventId);
    if (!event) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Event not found.' },
        { status: 404 }
      );
    }

    // Find or create user
    let targetUserId: string;
    try {
      const usersList = await users.list([Query.equal('email', email), Query.limit(1)]);
      if (usersList.users.length > 0) {
        targetUserId = usersList.users[0].$id;
        log.info('Found existing user', { targetUserId, email });
      } else {
        const newUser = await users.create(
          ID.unique(),
          email,
          normalizedPhone?.e164,
          undefined,
          name
        );
        targetUserId = newUser.$id;
        log.info('Created new user', { targetUserId, email });
      }
    } catch (error) {
      log.error('Failed to find/create user', error instanceof Error ? error : new Error(String(error)));
      return NextResponse.json(
        { error: 'USER_ERROR', message: 'Failed to process user information.' },
        { status: 500 }
      );
    }

    // Check for duplicate registration (active statuses only)
    const existingRegs = await db.listDocuments(
      DATABASE_ID,
      REGISTRATIONS_COLLECTION_ID,
      [
        Query.equal('user_id', targetUserId),
        Query.equal('event_id', eventId),
        Query.notEqual('registration_status', 'cancelled'),
        Query.notEqual('registration_status', 'expired'),
        Query.limit(1),
      ]
    );

    if (existingRegs.documents.length > 0) {
      log.warn('Duplicate registration detected', { targetUserId, eventId });
      return NextResponse.json(
        { error: 'DUPLICATE_REGISTRATION', message: 'User is already registered for this event.' },
        { status: 409 }
      );
    }

    // Prepare form data
    const formData: Record<string, unknown> = {
      name,
      email,
    };
    if (normalizedPhone) formData.phone = normalizedPhone.local;
    if (department && department.trim()) formData.department = department.trim();
    if (semester && semester.trim()) formData.semester = semester.trim();
    if (section && section.trim()) formData.section = section.trim();
    if (roll_number && roll_number.trim()) formData.roll_number = roll_number.trim();

    // Manual registrations bypass payment flow and should always be marked as free
    const paymentStatus = 'free';

    // Create registration as confirmed
    const registration = await db.createDocument(
      DATABASE_ID,
      REGISTRATIONS_COLLECTION_ID,
      ID.unique(),
      {
        user_id: targetUserId,
        event_id: eventId,
        user_name: name,
        user_email: email,
        user_phone: normalizedPhone?.local || '',
        form_responses: JSON.stringify(formData),
        payment_status: paymentStatus,
        registration_status: 'confirmed',
        registration_date: new Date().toISOString(),
        checked_in: false,
      }
    );

    log.info('Manual registration created', { 
      registrationId: registration.$id, 
      targetUserId,
      paymentStatus 
    });

    // Create ticket ID
    const ticketId = ID.unique();

    // Update registration with ticket ID
    await db.updateDocument(
      DATABASE_ID,
      REGISTRATIONS_COLLECTION_ID,
      registration.$id,
      {
        ticket_id: ticketId,
      }
    );

    log.info('Ticket created for manual registration', { ticketId, registrationId: registration.$id });

    return NextResponse.json({
      success: true,
      registration: {
        id: registration.$id,
        user_id: targetUserId,
        user_name: name,
        user_email: email,
        user_phone: normalizedPhone?.local || '',
        department: department || '',
        semester: semester || '',
        section: section || '',
        roll_number: roll_number || '',
        payment_status: paymentStatus,
        registration_status: 'confirmed',
        ticket_id: ticketId,
        registration_date: registration.$createdAt,
      },
      message: 'Registration created successfully.',
    });
  } catch (error) {
    return handleError(error);
  }
}

