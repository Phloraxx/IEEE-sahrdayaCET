import { NextRequest, NextResponse } from 'next/server';
import { getEvent } from '@/lib/api/appwrite-admin';
import { createLogger } from '@/lib/api/logger';
import type { FormTemplate } from '@/lib/validation/schemas';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{ eventId: string }>;
}

/**
 * GET /api/events/[eventId]/form-template
 * Get the custom registration form template for an event
 * Public endpoint - no authentication required
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  const { eventId } = await params;
  const log = createLogger({ action: 'get-form-template', eventId });

  try {
    // Get the event
    const event = await getEvent(eventId);
    if (!event) {
      log.warn('Event not found');
      return NextResponse.json(
        { error: 'EVENT_NOT_FOUND', message: 'The requested event does not exist.' },
        { status: 404 }
      );
    }

    // Check if event is published (public form templates only for published events)
    if (event.status !== 'published') {
      log.warn('Form template requested for non-published event', { status: event.status });
      return NextResponse.json(
        { error: 'EVENT_NOT_AVAILABLE', message: 'This event is not currently available.' },
        { status: 400 }
      );
    }

    // Parse form template from event
    let formTemplate: FormTemplate;
    
    if (event.form_template) {
      try {
        formTemplate = JSON.parse(event.form_template);
      } catch {
        log.warn('Invalid form template JSON on event, using default');
        formTemplate = getDefaultFormTemplate();
      }
    } else {
      // No custom form - return default template
      formTemplate = getDefaultFormTemplate();
    }

    log.info('Form template retrieved', { 
      hasCustomTemplate: !!event.form_template,
      questionCount: formTemplate.questions.length,
    });

    return NextResponse.json({
      success: true,
      event_id: eventId,
      event_title: event.title,
      form_template: formTemplate,
    });
  } catch (error) {
    log.error('Failed to get form template', error instanceof Error ? error : new Error(String(error)));
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' },
      { status: 500 }
    );
  }
}

/**
 * Returns a default form template for events without custom forms
 * Basic fields are auto-filled from user profile, so this is minimal
 */
function getDefaultFormTemplate(): FormTemplate {
  return {
    version: '1.0',
    questions: [
      {
        id: 'additional_info',
        type: 'textarea',
        label: 'Any additional information or special requirements?',
        placeholder: 'Enter any additional details here...',
        required: false,
      },
    ],
  };
}
