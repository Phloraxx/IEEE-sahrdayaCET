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

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{ eventId: string }>;
}

type CsvRow = Record<string, unknown>;

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function getField(row: CsvRow, aliases: string[]): string {
  const normalized = new Map<string, string>();
  for (const [key, value] of Object.entries(row)) {
    if (value === null || value === undefined) continue;
    normalized.set(normalizeKey(key), String(value).trim());
  }

  for (const alias of aliases) {
    const value = normalized.get(normalizeKey(alias));
    if (value) return value;
  }

  return '';
}

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  const lastTen = digits.slice(-10);
  return /^[6-9]\d{9}$/.test(lastTen) ? lastTen : '';
}

function normalizeEmail(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^mailto:?/i, '')
    .replace(/\s+/g, '');
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { eventId } = await params;
  const log = createLogger({ action: 'import_csv_registrations', eventId });

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
        { error: 'FORBIDDEN', message: 'Not authorized to import registrations for this event.' },
        { status: 403 }
      );
    }

    const body = (await req.json()) as { rows?: CsvRow[] };
    const rows = Array.isArray(body.rows) ? body.rows : [];
    if (rows.length === 0) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', message: 'CSV rows are required.' },
        { status: 400 }
      );
    }
    if (rows.length > 1000) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', message: 'Maximum 1000 CSV rows per import.' },
        { status: 400 }
      );
    }

    const db = getDatabases();
    const users = getUsers();

    const event = await db.getDocument(DATABASE_ID, EVENTS_COLLECTION_ID, eventId);
    if (!event) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Event not found.' },
        { status: 404 }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    let importedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    const failures: Array<{ row: number; reason: string }> = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const name = getField(row, ['name']);
        const phoneRaw = getField(row, ['phone', 'phone no', 'phone number', 'mobile', 'contact']);
        const phone = normalizePhone(phoneRaw);
        const department = getField(row, ['department']);
        const semester = getField(row, ['semester']);
        const section = getField(row, ['section']);
        const rollNumber = getField(row, ['roll_number', 'roll number', 'roll no', 'sl no', 'ticket_id']);

        const rawEmail = getField(row, ['email', 'email (personal)', 'email (sahrdaya)']);
        const normalizedEmail = normalizeEmail(rawEmail);
        const fallbackEmail = phone
          ? `import+${eventId}-${phone}-${i + 1}@ieeesahrdaya.com`
          : '';
        const email = normalizedEmail && emailRegex.test(normalizedEmail)
          ? normalizedEmail
          : fallbackEmail;

        if (!name || (!email && !phone)) {
          skippedCount++;
          failures.push({
            row: i + 2,
            reason: `Missing required values (name and email/phone) on row ${i + 2}`,
          });
          continue;
        }

        let targetUserId: string;
        const usersList = await users.list([Query.equal('email', email), Query.limit(1)]);
        if (usersList.users.length > 0) {
          targetUserId = usersList.users[0].$id;
        } else {
          const phoneE164 = phone ? `+91${phone}` : undefined;
          if (phoneE164) {
            try {
              const usersByPhone = await users.list([Query.equal('phone', phoneE164), Query.limit(1)]);
              if (usersByPhone.users.length > 0) {
                targetUserId = usersByPhone.users[0].$id;
              } else {
                const newUser = await users.create(
                  ID.unique(),
                  email,
                  phoneE164,
                  undefined,
                  name
                );
                targetUserId = newUser.$id;
              }
            } catch {
              log.warn('Failed to find user by phone, creating new user with phone', { email, phone: phoneE164 });
              const newUser = await users.create(
                ID.unique(),
                email,
                phoneE164,
                undefined,
                name
              );
              targetUserId = newUser.$id;
            }
          } else {
          const newUser = await users.create(
            ID.unique(),
            email,
            undefined,
            undefined,
            name
          );
          targetUserId = newUser.$id;
          }
        }

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
          skippedCount++;
          const existingReg = existingRegs.documents[0];
          const conflict = usersList.users.length > 0 
            ? `email ${email}` 
            : `phone ${phone}`;
          failures.push({
            row: i + 2,
            reason: `Already registered - ${conflict} matches existing registration (Ticket: ${existingReg.ticket_id}, Registered as: ${existingReg.user_name})`,
          });
          continue;
        }

        const formData: Record<string, unknown> = { name, email };
        if (phone) formData.phone = phone;
        if (department) formData.department = department;
        if (semester) formData.semester = semester;
        if (section) formData.section = section;
        if (rollNumber) formData.roll_number = rollNumber;

        const ticketId = ID.unique();
        const registrationId = ID.unique();
        const issuedAt = new Date().toISOString();

        await db.createDocument(
          DATABASE_ID,
          REGISTRATIONS_COLLECTION_ID,
          registrationId,
          {
            user_id: targetUserId,
            event_id: eventId,
            user_name: name,
            user_email: email,
            user_phone: phone || '',
            form_responses: JSON.stringify(formData),
            payment_status: 'free',
            registration_status: 'confirmed',
            registration_date: issuedAt,
            checked_in: false,
            ticket_id: ticketId,
          },
        );

        importedCount++;
      } catch (error) {
        failedCount++;
        const name = getField(row, ['name']);
        const rawEmail = getField(row, ['email', 'email (personal)', 'email (sahrdaya)']);
        const phoneRaw = getField(row, ['phone', 'phone no', 'phone number', 'mobile', 'contact']);
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        const rowData = `Name: ${name || 'N/A'}, Email: ${rawEmail || 'N/A'}, Phone: ${phoneRaw || 'N/A'}`;
        
        log.error(
          'CSV row import failed',
          error instanceof Error ? error : new Error(String(error)),
          { row: String(i + 2), name, email: rawEmail, phone: phoneRaw }
        );
        failures.push({
          row: i + 2,
          reason: `${errorMsg} - ${rowData}`,
        });
      }
    }

    log.info('CSV registration import complete', {
      totalRows: String(rows.length),
      imported: String(importedCount),
      skipped: String(skippedCount),
      failed: String(failedCount),
    });

    return NextResponse.json({
      success: true,
      total_rows: rows.length,
      imported_count: importedCount,
      skipped_count: skippedCount,
      failed_count: failedCount,
      failures: failures,
      message: `Imported ${importedCount} registration(s).`,
    });
  } catch (error) {
    log.error('Failed CSV registration import', error instanceof Error ? error : new Error(String(error)));
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'Failed to import CSV registrations.' },
      { status: 500 }
    );
  }
}

