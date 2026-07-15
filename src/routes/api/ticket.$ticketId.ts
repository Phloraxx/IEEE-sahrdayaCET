import { createFileRoute } from "@tanstack/react-router";
import { createPB, getPBUrl } from "@/lib/pb.server";
import { handleError } from "@/lib/api-error";
import { requireAuth } from "@/lib/auth";
import { requireEventScope } from "@/lib/chair-scope";
import { getField } from '@/lib/safe-get';

interface TicketLookupPayload {
  found?: boolean;
  registrationId?: string;
  user?: string;
  ticket?: {
    id: string;
    paymentStatus: string;
    registrationStatus: string;
    createdAt: string;
  };
  event?: {
    id: string;
    title: string;
    date: string;
    venue: string;
    time?: string;
    bannerUrl?: string;
  } | null;
}

export const Route = createFileRoute("/api/ticket/$ticketId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const { ticketId } = params;
          const pbUrl = getPBUrl().replace(/\/+$/, "");
          const lookupRes = await fetch(
            `${pbUrl}/api/tickets/lookup?ticketId=${encodeURIComponent(ticketId)}`,
          );
          const data = (await lookupRes.json()) as TicketLookupPayload;

          if (!lookupRes.ok || !data.found || !data.ticket) {
            return Response.json({ found: false });
          }

          const pb = createPB(request.headers.get('cookie') || undefined);
          const auth = await requireAuth(pb).catch(() => null);

          if (!auth) {
            return Response.json({
              found: true,
              ticket: data.ticket,
              event: data.event ?? null,
            });
          }

          const response: Record<string, unknown> = {
            found: true,
            ticket: data.ticket,
            event: data.event ?? null,
          };

          if (auth) {
            const userId = auth.user.id;
            const role = auth.user.role;
            const isAdmin = role === 'admin';
            const isOwner = data.user === userId;
            const eventId = data.event?.id || '';
            let isChair = false;
            if (role === 'chair' && eventId) {
              try {
                await requireEventScope(pb, auth.user, eventId);
                isChair = true;
              } catch {
                isChair = false;
              }
            }

            if (isOwner || isAdmin || isChair) {
              const regId = data.registrationId || '';
              if (regId) {
                const reg = await pb.collection('registrations').getOne(regId, {
                  fields: 'id,userName,userEmail,userPhone,registrationStatus,paymentStatus,registrationDate',
                }).catch(() => null);
                if (reg) {
                  response.registration = {
                    id: getField(reg, 'id', ''),
                    name: getField(reg, 'userName', ''),
                    email: getField(reg, 'userEmail', ''),
                    phone: getField(reg, 'userPhone', ''),
                    registrationStatus: getField(reg, 'registrationStatus', ''),
                    paymentStatus: getField(reg, 'paymentStatus', ''),
                    registrationDate: getField(reg, 'registrationDate', '') || data.ticket.createdAt,
                  };
                }
              }
            }
          }

          return Response.json(response);
        } catch (error) {
          return handleError(error, "ticket-get");
        }
      },
    },
  },
});