import { createFileRoute } from "@tanstack/react-router";
import { createPB } from "@/lib/pb.server"; import { buildFileUrl, escapeFilterValue } from "@/lib/pb"
import { handleError } from "@/lib/api-error";
import { requireAuth } from "@/lib/auth";
import { requireEventScope } from "@/lib/chair-scope";
import { getField, getExpand } from '@/lib/safe-get';

export const Route = createFileRoute("/api/ticket/$ticketId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const { ticketId } = params;
          const pb = createPB(request.headers.get('cookie') || undefined);
          const auth = await requireAuth(pb).catch(() => null);

          const regs = await pb.collection("registrations").getList(1, 1, {
            filter: `ticketId = ${escapeFilterValue(ticketId)} || paymentTicketId = ${escapeFilterValue(ticketId)}`,
            expand: "event",
            fields: "id,user,userName,userEmail,userPhone,registrationStatus,paymentStatus,registrationDate,ticketId,event,created",
          });

          if (regs.items.length === 0) {
            return Response.json({ found: false });
          }

          const reg = regs.items[0];
          const expand = getExpand(reg);
          const eventData = expand?.event;

          let event = null;
          if (eventData) {
            event = {
              id: getField(eventData, 'id', ''),
              title: getField(eventData, 'title', ''),
              date: getField(eventData, 'date', ''),
              venue: getField(eventData, 'venue', ''),
              bannerUrl: getField(eventData, 'banner', '')
                ? buildFileUrl("events", getField(eventData, 'id', ''), getField(eventData, 'banner', ''))
                : undefined,
              time: getField(eventData, 'time', undefined),
            };
          }

          const response: Record<string, unknown> = {
            found: true,
            ticket: {
              id: getField(reg, 'ticketId', ticketId),
              paymentStatus: getField(reg, 'paymentStatus', ''),
              registrationStatus: getField(reg, 'registrationStatus', ''),
              createdAt: getField(reg, 'created', ''),
            },
            event,
          };

          if (auth) {
            const userId = auth.user.id;
            const role = auth.user.role;
            const isAdmin = role === 'admin';
            const isOwner = getField(reg, 'user', '') === userId;
            const eventId = getField(eventData, 'id', '') || getField(reg, 'event', '');
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
              response.registration = {
                id: getField(reg, 'id', ''),
                name: getField(reg, 'userName', ''),
                email: getField(reg, 'userEmail', ''),
                phone: getField(reg, 'userPhone', ''),
                registrationStatus: getField(reg, 'registrationStatus', ''),
                paymentStatus: getField(reg, 'paymentStatus', ''),
                registrationDate: getField(reg, 'registrationDate', ''),
              };
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
