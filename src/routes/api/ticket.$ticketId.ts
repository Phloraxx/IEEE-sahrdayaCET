import { createFileRoute } from "@tanstack/react-router";
import { createPB, buildFileUrl, escapeFilterValue } from "@/lib/pb";
import { handleError } from "@/lib/api-error";
import { getField, getExpand } from '@/lib/safe-get';

export const Route = createFileRoute("/api/ticket/$ticketId")({
  server: {
    handlers: {
          GET: async ({ request, params }) => {
        try {
          const { ticketId } = params;
          // Try authenticated client first
          const cookie = request.headers.get('cookie') || '';
          const pb = createPB(cookie);
          const isAuthenticated = pb.authStore.isValid;

          // Look up registration by ticketId or paymentTicketId
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

          // Only include PII for the ticket owner or admin/chair
          if (isAuthenticated) {
            const userId = pb.authStore.record?.id;
            const role = pb.authStore.record?.role;
            const isAdmin = role === 'admin';
            const isChair = role === 'chair';
            const isOwner = getField(reg, 'user', '') === userId;

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
