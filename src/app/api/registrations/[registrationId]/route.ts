import { NextRequest, NextResponse } from 'next/server';
import { getSignedInUserFromRequest } from '@/lib/passkeys/passkeyStore';
import { getRegistration, getEvent, getTicketByRegistration, isUserAdmin } from '@/lib/api/appwrite-admin';
import { createLogger } from '@/lib/api/logger';
import { editRegistrationSchema } from '@/lib/api/validation';
import { updateRegistration } from '@/lib/api/appwrite-admin';
import { handleError } from '@/lib/errorHandler';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{ registrationId: string }>;
}

/**
 * GET /api/registrations/[registrationId]
 * Get a single registration with full details
 * Requires authentication (user must own registration OR be admin)
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  const { registrationId } = await params;
  const log = createLogger({ action: 'get-registration', registrationId });

  try {
    // 1. Check authentication
    const user = await getSignedInUserFromRequest(req);
    if (!user) {
      log.warn('Registration request without authentication');
      return NextResponse.json(
        { error: 'UNAUTHORIZED', message: 'You must be signed in to view registration details.' },
        { status: 401 }
      );
    }

    const userId = user.$id;
    log.info('Fetching registration', { userId });

    // 2. Get registration
    const registration = await getRegistration(registrationId);
    if (!registration) {
      log.warn('Registration not found');
      return NextResponse.json(
        { error: 'REGISTRATION_NOT_FOUND', message: 'The requested registration does not exist.' },
        { status: 404 }
      );
    }

    // 3. Check authorization (user owns registration OR is admin)
    const isOwner = registration.user_id === userId;
    const isAdmin = await isUserAdmin(userId);
    
    if (!isOwner && !isAdmin) {
      log.warn('Unauthorized registration access attempt', { ownerId: registration.user_id });
      return NextResponse.json(
        { error: 'FORBIDDEN', message: 'You do not have permission to view this registration.' },
        { status: 403 }
      );
    }

    // 4. Get event details
    const event = await getEvent(registration.event_id);

    // 5. Get ticket (embedded ticket is supported even when ticket_id is missing)
    const ticket = await getTicketByRegistration(registration.$id);

    // 6. Parse form data
    let formData: Record<string, unknown> = {};
    try {
      formData = JSON.parse(registration.form_data || '{}');
    } catch {
      log.warn('Failed to parse form data for registration', { registrationId: registration.$id });
    }

    log.info('Registration fetched successfully', { userId, isOwner, isAdmin });

    return NextResponse.json({
      success: true,
      registration: {
        id: registration.$id,
        user_id: registration.user_id,
        event_id: registration.event_id,
        payment_status: registration.payment_status,
        registration_status: registration.registration_status,
        form_data: formData,
        created_at: registration.$createdAt,
        updated_at: registration.$updatedAt,
      },
      event: event ? {
        id: event.$id,
        title: event.title,
        description: event.description,
        date: event.date,
        venue: event.venue,
        price: event.price,
        banner_url: event.banner_url,
        society_id: event.society_id,
        status: event.status,
        max_capacity: event.max_capacity,
      } : null,
      ticket: ticket ? {
        id: ticket.$id,
        qr_data: ticket.qr_data,
        is_scanned: ticket.is_scanned,
        scanned_at: ticket.scanned_at,
        created_at: ticket.$createdAt,
      } : null,
      permissions: {
        can_edit: isOwner && registration.payment_status === 'pending',
        can_cancel: isOwner && registration.registration_status !== 'cancelled',
        is_admin: isAdmin,
      },
    });
  } catch (error) {
    return handleError(error);
  }
}

/**
 * PATCH /api/registrations/[registrationId]
 * Edit registration before payment is completed
 * Requires authentication (user must own registration)
 * Only allows edits if payment_status = 'pending'
 */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const { registrationId } = await params;
  const log = createLogger({ action: 'edit-registration', registrationId });

  try {
    // 1. Check authentication
    const user = await getSignedInUserFromRequest(req);
    if (!user) {
      log.warn('Edit registration attempt without authentication');
      return NextResponse.json(
        { error: 'UNAUTHORIZED', message: 'You must be signed in to edit registration.' },
        { status: 401 }
      );
    }

    const userId = user.$id;
    log.info('Edit registration request', { userId });

    // 2. Get registration
    const registration = await getRegistration(registrationId);
    if (!registration) {
      log.warn('Registration not found');
      return NextResponse.json(
        { error: 'REGISTRATION_NOT_FOUND', message: 'The requested registration does not exist.' },
        { status: 404 }
      );
    }

    // 3. Check ownership
    if (registration.user_id !== userId) {
      log.warn('Unauthorized edit attempt', { ownerId: registration.user_id });
      return NextResponse.json(
        { error: 'FORBIDDEN', message: 'You can only edit your own registrations.' },
        { status: 403 }
      );
    }

    // 4. Check if editable (payment must be pending)
    if (registration.payment_status !== 'pending') {
      log.warn('Edit attempt on non-pending registration', { status: registration.payment_status });
      return NextResponse.json(
        { error: 'EDIT_NOT_ALLOWED', message: 'Registrations can only be edited before payment is completed.' },
        { status: 400 }
      );
    }

    // 5. Validate request body
    const body = await req.json();
    const parsed = editRegistrationSchema.safeParse(body);
    
    if (!parsed.success) {
      log.warn('Invalid edit data', { errors: parsed.error.issues });
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', message: 'Invalid data provided.', details: parsed.error.issues },
        { status: 400 }
      );
    }

    // 6. Update registration
    const updateData: { form_data?: Record<string, unknown> } = {};
    
    if (parsed.data.form_data) {
      // Merge with existing form data
      let existingFormData: Record<string, unknown> = {};
      try {
        existingFormData = JSON.parse(registration.form_data || '{}');
      } catch {
        log.warn('Failed to parse existing form data for merge', { registrationId: registration.$id });
      }
      updateData.form_data = { ...existingFormData, ...parsed.data.form_data };
    }

    const updatedRegistration = await updateRegistration(registrationId, updateData);

    log.info('Registration updated', { userId });

    return NextResponse.json({
      success: true,
      message: 'Registration updated successfully.',
      registration: {
        id: updatedRegistration.$id,
        payment_status: updatedRegistration.payment_status,
        registration_status: updatedRegistration.registration_status,
        updated_at: updatedRegistration.$updatedAt,
      },
    });
  } catch (error) {
    return handleError(error);
  }
}

