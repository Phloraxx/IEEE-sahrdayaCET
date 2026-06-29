import { createFileRoute } from "@tanstack/react-router";
import { createPB, getPBUrl, buildFileUrl, escapeFilterValue } from "@/lib/pb";
import { requireAuth } from "@/lib/auth";
import { handleError } from "@/lib/api-error";
import { RegistrationError } from "@/lib/registration-service";
import { RegistrationBodySchema } from "@/schemas/registrations";
import { z } from "zod";
import { verifySameOrigin } from "@/lib/verify-same-origin";
import { getField, getExpand } from '@/lib/safe-get';

export const Route = createFileRoute("/api/registrations")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const pb = createPB(request.headers.get("cookie") || undefined);
          const { user } = await requireAuth(pb);
          const url = new URL(request.url);
          const eventId = url.searchParams.get("eventId");
          const ticketId = url.searchParams.get("ticketId");

          const parts: string[] = [`user = ${escapeFilterValue(user.id)}`];
          if (eventId) parts.push(`event = ${escapeFilterValue(eventId)}`);
          if (ticketId)
            parts.push(
              `(ticketId = ${escapeFilterValue(ticketId)} || paymentTicketId = ${escapeFilterValue(ticketId)})`,
            );
          const filter = parts.join(" && ");

          const perPage = ticketId ? 1 : 50;
          const result = await pb
            .collection("registrations")
            .getList(1, perPage, {
              filter,
              sort: "-created",
              expand: "event",
              fields:
                "id,event,ticketId,paymentTicketId,paymentStatus,registrationStatus,formResponses,checkedIn,checkedInAt,created,registrationDate,expand",
            });

          const items = result.items.map((reg) => {
            const expand = getExpand(reg);
            const evt = expand?.event;
            return {
              id: getField(reg, 'id', ''),
              ticket: getField(reg, 'ticketId', '')
                ? {
                    id: getField(reg, 'ticketId', ''),
                    qr_data: getField(reg, 'ticketId', ''),
                    is_scanned: !!getField(reg, 'checkedIn', false),
                    scanned_at: getField(reg, 'checkedInAt', '') || null,
                    createdAt:
                      getField(reg, 'created', '') || getField(reg, 'registrationDate', ''),
                  }
                : null,
              event: evt
                ? {
                    id: getField(evt, 'id', ''),
                    title: getField(evt, 'title', ''),
                    description: getField(evt, 'description', ''),
                    date: getField(evt, 'date', ''),
                    venue: getField(evt, 'venue', ''),
                    price: Number(getField(evt, 'price', 0)) || 0,
                    bannerUrl: getField(evt, 'banner', '')
                      ? buildFileUrl(
                          "events",
                          getField(evt, 'id', ''),
                          getField(evt, 'banner', ''),
                        )
                      : "",
                    status: getField(evt, 'status', '') || "published",
                  }
                : null,
              registration: {
                id: getField(reg, 'id', ''),
                eventId: getField(reg, 'event', ''),
                paymentStatus: getField(reg, 'paymentStatus', '') || "pending",
                registrationStatus:
                  getField(reg, 'registrationStatus', '') || "pending",
                formResponses: getField(reg, 'formResponses', {}),
                createdAt:
                  getField(reg, 'created', '') || getField(reg, 'registrationDate', ''),
                updatedAt:
                  getField(reg, 'created', '') || getField(reg, 'registrationDate', ''),
              },
            };
          });

          return Response.json({
            items,
            total: result.totalItems,
            limit: result.perPage,
            page: result.page,
            totalPages: result.totalPages,
          });
        } catch (error) {
          return handleError(error, "registrations-get");
        }
      },
      POST: async ({ request }) => {
        try {
          const contentType = request.headers.get('content-type') || '';
          if (!contentType.includes('application/json') && !contentType.includes('multipart/form-data')) {
            return Response.json({ error: 'Unsupported media type' }, { status: 415 });
          }
          const userPb = createPB(request.headers.get("cookie") || undefined);
          verifySameOrigin(request);
          const { user } = await requireAuth(userPb);
          const parsed = RegistrationBodySchema.parse(await request.json());
          const { eventId, formResponses, couponCode } = parsed;

          // NEW-1: Enforce registration business rules before create
          const eventRecord = await userPb.collection("events").getOne(eventId, {
            fields: "price,status,maxCapacity,registrationOpen,registrationDeadline,formTemplate,registeredCount",
          });
          const eventStatus = getField<string>(eventRecord, 'status', '');
          if (eventStatus === 'cancelled' || eventStatus === 'draft') {
            return Response.json({ error: 'Event is not accepting registrations' }, { status: 400 });
          }
          if (!getField<boolean>(eventRecord, 'registrationOpen', false)) {
            return Response.json({ error: 'Registration is closed for this event' }, { status: 400 });
          }
          const deadline = getField<string>(eventRecord, 'registrationDeadline', '');
          if (deadline && new Date(deadline) < new Date()) {
            return Response.json({ error: 'Registration deadline has passed' }, { status: 400 });
          }
          const maxCapacity = Number(getField(eventRecord, 'maxCapacity', 0)) || 0;
          if (maxCapacity > 0) {
            const registeredCount = Number(getField(eventRecord, 'registeredCount', 0)) || 0;
            if (registeredCount >= maxCapacity) {
              return Response.json({ error: 'Event is at full capacity' }, { status: 400 });
            }
          }
          // Basic form validation: check required fields if formTemplate defined
          const formTemplate = getField<Array<{id: string; required?: boolean}>>(eventRecord, 'formTemplate', []);
          if (Array.isArray(formTemplate) && formTemplate.length > 0) {
            const requiredFields = formTemplate.filter((f: {required?: boolean}) => f.required).map((f: {id: string}) => f.id);
            for (const fieldId of requiredFields) {
              const val = formResponses?.[fieldId];
              if (val === undefined || val === null || val === '') {
                return Response.json({ error: `Required field "${fieldId}" is missing` }, { status: 400 });
              }
            }
          }

          // Create with the user's own client. API rules enforce auth + user match.
          const registration = await userPb.collection("registrations").create({
            user: user.id,
            event: eventId,
            userName: getField(formResponses, 'name', ''),
            userEmail: getField(formResponses, 'email', ''),
            userPhone: getField(formResponses, 'phone', ''),
            formResponses,
            couponCode: couponCode || '',
          });

          const price = Number(getField(eventRecord, 'price', 0)) || 0;
          const isFree = price === 0;

          // Compute amount with coupon discount before admin PATCH
          let amount = price;
          let discountAmount = 0;
          const adminToken = process.env.POCKETBASE_ADMIN_TOKEN;

          if (couponCode && adminToken) {
            try {
              const pbUrl = getPBUrl();
              const now = new Date().toISOString().split('T')[0];
              // Use `isActive` and `discountPercent` — PB schema field names (not `enabled` / `discountAmount`)
              const filter = `code=${escapeFilterValue(couponCode)} && event=${escapeFilterValue(eventId)} && isActive=true && (maxUses=0 || usedCount<maxUses) && (expiresAt='' || expiresAt>='${now}')`;
              const couponRes = await fetch(
                `${pbUrl}/api/collections/coupons/records?filter=${encodeURIComponent(filter)}&perPage=1`,
                { headers: { 'Authorization': `Bearer ${adminToken}` } },
              );
              if (couponRes.ok) {
                const couponData = await couponRes.json();
                const coupon = couponData?.items?.[0];
                if (coupon) {
                  const discountPercent = Number(coupon.discountPercent) || 0;
                  discountAmount = Math.round(price * discountPercent / 100);
                  amount = Math.max(0, price - discountAmount);
                }
              }
            } catch {
              // Coupon validation is best-effort here; fail open to avoid blocking registration
            }
          }

          // Set server-authoritative fields via admin-token PATCH.
          // Hook can't use reg.set() in PB 0.39.1 (goja bug) — this is the workaround.
          if (adminToken) {
            // Generate 16-char token IDs (matching hook's generateTicketId format)
            const random16 = () => Array.from({ length: 16 }, () => Math.random().toString(36)[2] || '0').join('').toUpperCase();
            const paymentTicketId = crypto.randomUUID ? crypto.randomUUID() : `PMT-${random16()}`;
            const ticketId = isFree ? `TKT-${random16()}` : '';
            const patchBody: Record<string, unknown> = {
              amount,
              discountAmount,
              paymentStatus: isFree ? 'not_required' : 'pending',
              registrationStatus: isFree ? 'confirmed' : 'pending',
              registrationDate: new Date().toISOString(),
              paymentTicketId: isFree ? '' : paymentTicketId,
              ticketId: isFree ? ticketId : '',
            };
            const pbUrl = getPBUrl();
            await fetch(`${pbUrl}/api/collections/registrations/records/${registration.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
              body: JSON.stringify(patchBody),
            });
          }
          // Read back the updated registration
          const created = await userPb.collection("registrations").getOne(registration.id, {
            fields: "id,ticketId,paymentTicketId,paymentStatus,registrationStatus,amount",
          });

          const readPaymentTicketId = getField<string>(created, 'paymentTicketId', '');
          const readTicketId = getField<string>(created, 'ticketId', '');

          return Response.json({
            registrationId: registration.id,
            ticketId: isFree ? readTicketId : (readPaymentTicketId || registration.id),
            paymentRequired: !isFree,
            amount: Number(getField(created, 'amount', 0)) || 0,
          });
        } catch (error) {
          if (error instanceof z.ZodError) {
            const messages = error.issues
              .map((e) => `${e.path.join(".")}: ${e.message}`)
              .join("; ");
            return Response.json(
              { error: `Validation failed: ${messages}` },
              { status: 400 },
            );
          }
          if (error instanceof RegistrationError) {
            return Response.json(
              { error: error.message },
              { status: error.statusCode },
            );
          }
          return handleError(error, "registrations-post");
        }
      },
    },
  },
});
