/**
 * Manual payment completion endpoint for admin use
 * POST /api/admin/registrations/[registrationId]/complete-payment
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateCSRF } from '@/lib/api/csrf';
import { getSignedInUserFromRequest } from '@/lib/passkeys/passkeyStore';
import { 
  getRegistration, 
  getEvent,
  isUserAdmin, 
  getDatabases,
  getUsers,
  DATABASE_ID,
  REGISTRATIONS_COLLECTION_ID
} from '@/lib/api/appwrite-admin';
import { createLogger } from '@/lib/api/logger';
import { sendRegistrationConfirmation, sendPaymentReceipt } from '@/lib/emailIntegration';
import { isUserChairOfEvent } from '@/lib/api/auth-check';
import { ID } from 'node-appwrite';
import { PAYMENT_API_URL } from '@/lib/constants/endpoints';
import { handleError } from '@/lib/errorHandler';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{ registrationId: string }>;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { registrationId } = await params;
  const log = createLogger({ action: 'complete-payment', registrationId });

  try {
    if (!validateCSRF(req)) {
      return NextResponse.json({ success: false, error: 'CSRF validation failed' }, { status: 403 });
    }
    // 1. Check authentication
    const user = await getSignedInUserFromRequest(req);
    if (!user) {
      return NextResponse.json(
        { error: 'UNAUTHORIZED', message: 'Authentication required.' },
        { status: 401 }
      );
    }

    // 2. Get registration
    const registration = await getRegistration(registrationId);
    if (!registration) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Registration not found.' },
        { status: 404 }
      );
    }

    // 3. Check authorization: user must be admin OR chair of the event
    const isAdmin = await isUserAdmin(user.$id);
    const isChair = await isUserChairOfEvent(user.$id, registration.event_id);
    if (!isAdmin && !isChair) {
      log.warn('User not authorized for this event', { userId: user.$id, eventId: registration.event_id });
      return NextResponse.json(
        { error: 'FORBIDDEN', message: 'You are not authorized to manage registrations for this event.' },
        { status: 403 }
      );
    }

    log.info('Manually completing payment', {
      registrationId,
      currentStatus: registration.payment_status,
      ticketId: registration.ticket_id,
      paymentReference: registration.payment_reference,
    });

    const db = getDatabases();
    const alreadyProcessedPayment =
      registration.payment_status === 'paid' ||
      registration.payment_status === 'completed';

    // 4. Fetch payment details from Payment API
    let paymentDetails: {
      amount?: number;
      rrn?: string;
      senderName?: string;
      paidAt?: string;
    } = {};

    const paymentReference = registration.payment_reference as string | undefined;
    if (paymentReference) {
      try {
        const statusResponse = await fetch(`${PAYMENT_API_URL}/status/${paymentReference}`);
        
        if (statusResponse.ok) {
          const paymentData = await statusResponse.json();
          
          if (paymentData.status === 'paid') {
            paymentDetails = {
              amount: paymentData.amount,
              rrn: paymentData.rrn,
              senderName: paymentData.senderName,
              paidAt: paymentData.paidAt,
            };
            log.info('Payment details fetched from Payment API', paymentDetails);
          } else {
            log.warn('Payment not yet completed on Payment API', { 
              status: paymentData.status,
              paymentReference 
            });
          }
        }
      } catch (error) {
        log.error('Failed to fetch payment details from Payment API', 
          error instanceof Error ? error : new Error(String(error))
        );
        // Continue anyway - we can still create the ticket
      }
    }

    // 5. Create ticket_id if missing
    let ticketId = registration.ticket_id;
    if (!ticketId) {
      ticketId = ID.unique();
      log.info('Creating new ticket_id', { ticketId });
    }

    // 6. Update registration with payment details
    const updateData: Record<string, unknown> = {
      payment_status: 'paid',
      registration_status: 'confirmed',
      ticket_id: ticketId,
      payment_date: paymentDetails.paidAt || new Date().toISOString(),
    };

    // Add payment details if available
    if (paymentDetails.amount) {
      updateData.amount_paid = paymentDetails.amount;
    }
    if (paymentDetails.rrn) {
      updateData.utr_number = paymentDetails.rrn;
    }

    await db.updateDocument(
      DATABASE_ID,
      REGISTRATIONS_COLLECTION_ID,
      registrationId,
      updateData
    );

    log.info('Payment completed successfully', { 
      ticketId,
      amountPaid: paymentDetails.amount,
      utrNumber: paymentDetails.rrn,
    });

    // 7. Get event and user for emails
    const event = await getEvent(registration.event_id);
    const users = getUsers();
    const registrationUser = await users.get(registration.user_id);

    if (!event || !registrationUser.email) {
      log.warn('Cannot send emails - missing event or user email', {
        hasEvent: !!event,
        hasEmail: !!registrationUser.email,
      });
      
      return NextResponse.json({
        success: true,
        ticket_id: ticketId,
        payment_details: paymentDetails,
        message: 'Payment marked as completed and ticket created. Note: Email sending skipped.',
      });
    }

    if (alreadyProcessedPayment) {
      log.info('Payment already processed, skipping duplicate completion emails', {
        registrationId: registration.$id,
        paymentStatus: registration.payment_status,
      });
      return NextResponse.json({
        success: true,
        ticket_id: ticketId,
        payment_details: paymentDetails,
        message: 'Payment already processed.',
      });
    }

    // 8a. Send payment receipt email FIRST (with PDF attachment)
    try {
      sendPaymentReceipt(
        {
          $id: registration.$id,
          user_id: registration.user_id,
          event_id: registration.event_id,
          ticket_id: ticketId,
        },
        event,
        {
          amount: paymentDetails.amount || event.price || 0,
          paidAt: paymentDetails.paidAt,
          rrn: paymentDetails.rrn,
          utr: paymentDetails.rrn,
          senderName: paymentDetails.senderName,
          paymentReference: paymentReference,
        }
      ).catch(emailError => {
        // Don't fail completion if email fails
        log.error('Failed to send payment receipt email',
          emailError instanceof Error ? emailError : new Error(String(emailError)),
          { registrationId: registration.$id }
        );
      });
      log.info('Payment receipt email queued', { email: registrationUser.email });
    } catch (emailError) {
      // Don't fail completion if email fails
      log.error('Failed to queue payment receipt email',
        emailError instanceof Error ? emailError : new Error(String(emailError))
      );
    }

    // 8b. Send registration confirmation email SECOND (with ticket/QR code)
    try {
      sendRegistrationConfirmation(
        {
          $id: registration.$id,
          user_id: registration.user_id,
          event_id: registration.event_id,
          ticket_id: ticketId,
        },
        event
      ).catch(emailError => {
        // Don't fail completion if email fails
        log.error('Failed to send confirmation email',
          emailError instanceof Error ? emailError : new Error(String(emailError)),
          { registrationId: registration.$id }
        );
      });
      log.info('Confirmation email queued', { email: registrationUser.email });
    } catch (emailError) {
      // Don't fail completion if email fails
      log.error('Failed to queue confirmation email',
        emailError instanceof Error ? emailError : new Error(String(emailError))
      );
    }

    return NextResponse.json({
      success: true,
      ticket_id: ticketId,
      payment_details: paymentDetails,
      message: 'Payment marked as completed and ticket created.',
    });

  } catch (error) {
    return handleError(error);
  }
}
