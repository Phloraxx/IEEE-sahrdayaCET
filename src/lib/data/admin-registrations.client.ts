import { getPbClient } from "@/lib/pb-client";
import { escapeFilterValue } from "@/lib/pb";
import { getField } from "@/lib/safe-get";

function mapRegistration(record: Record<string, unknown> & { id: string; expand?: Record<string, unknown> }) {
  const event = record.expand?.event as Record<string, unknown> | undefined;
  return {
    id: record.id,
    userName: getField(record, "userName", ""),
    userEmail: getField(record, "userEmail", ""),
    userPhone: getField(record, "userPhone", ""),
    registrationStatus: getField(record, "registrationStatus", ""),
    paymentStatus: getField(record, "paymentStatus", ""),
    checkedIn: Boolean(getField(record, "checkedIn", false)),
    checkedInAt: getField<string | null>(record, "checkedInAt", null),
    ticketId: getField(record, "ticketId", ""),
    amount: Number(getField(record, "amount", 0)) || 0,
    couponCode: getField(record, "couponCode", ""),
    discountAmount: Number(getField(record, "discountAmount", 0)) || 0,
    paymentData: getField(record, "paymentData", null),
    formResponses: getField(record, "formResponses", null),
    createdAt: getField(record, "created", ""),
    eventTitle: getField(event, "title", ""),
    eventId: getField(event, "id", ""),
  };
}

export async function listAdminRegistrations(input: {
  page: number;
  perPage: number;
  eventId?: string;
  status?: string;
  search?: string;
}) {
  const filters: string[] = [];
  if (input.eventId) filters.push(`event = ${escapeFilterValue(input.eventId)}`);
  if (input.status && input.status !== "all") filters.push(`registrationStatus = ${escapeFilterValue(input.status)}`);
  if (input.search) filters.push(`userName ~ ${escapeFilterValue(input.search)}`);
  const result = await getPbClient().collection("registrations").getList(input.page, input.perPage, {
    filter: filters.join(" && ") || undefined,
    sort: "-registrationDate",
    expand: "event",
  });
  return {
    registrations: result.items.map((record) => mapRegistration(record as never)),
    total: result.totalItems,
    page: result.page,
    perPage: result.perPage,
    hasMore: result.totalPages > result.page,
  };
}

export async function getAdminRegistration(id: string) {
  const record = await getPbClient().collection("registrations").getOne(id, { expand: "event" });
  return { registration: mapRegistration(record as never) };
}

export async function runRegistrationAdminCommand(
  id: string,
  command: "check-in" | "cancel" | "confirm" | "set-payment" | "set-amount",
  value?: string | number,
) {
  const pb = getPbClient();
  switch (command) {
    case "check-in":
      return pb.collection("registrations").update(id, { checkedIn: true });
    case "cancel":
      return pb.collection("registrations").update(id, { registrationStatus: "cancelled" });
    case "confirm":
      return pb.collection("registrations").update(id, { registrationStatus: "confirmed" });
    case "set-payment":
      return pb.collection("registrations").update(id, { paymentStatus: String(value ?? "") });
    case "set-amount":
      return pb.collection("registrations").update(id, { amount: Number(value) });
  }
}

export async function checkInByTicket(ticketId: string) {
  const pb = getPbClient();
  let registration;
  try {
    // paymentTicketId is a private payment-recovery handle, not an event ticket.
    // Only the real ticketId minted after confirmation is valid for check-in.
    registration = await pb.collection("registrations").getFirstListItem(
      `ticketId = ${escapeFilterValue(ticketId)}`,
      { expand: "event", fields: "id,event,registrationStatus,checkedIn,checkedInAt,userName,userEmail,ticketId,expand.event.id,expand.event.title,expand.event.checkInEnabled" },
    );
  } catch {
    throw new Error("Registration not found");
  }

  const event = registration.expand?.event as Record<string, unknown> | undefined;
  if (!event) throw new Error("Event not found");
  if (!Boolean(event.checkInEnabled)) throw new Error("Check-in is not enabled for this event");
  if (String(registration.registrationStatus || "") !== "confirmed") throw new Error("Registration is not confirmed");
  if (Boolean(registration.checkedIn)) throw new Error("Already checked in");

  const updated = await pb.collection("registrations").update(registration.id, { checkedIn: true });
  return {
    success: true,
    message: "Checked in successfully",
    registration: {
      id: updated.id,
      userName: String(updated.userName || registration.userName || ""),
      userEmail: String(updated.userEmail || registration.userEmail || ""),
      eventTitle: String(event.title || ""),
      ticketId,
      checkedIn: Boolean(updated.checkedIn),
      checkedInAt: String(updated.checkedInAt || ""),
    },
  };
}
