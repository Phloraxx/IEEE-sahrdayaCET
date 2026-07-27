import { createPublicPB } from "@/lib/pb.server";
import { buildFileUrl } from "@/lib/pb";
import { getField } from "@/lib/safe-get";
import { canRegisterForEvent, isPublicEvent } from "@/lib/event-lifecycle";

export async function fetchEventForRegistration(eventId: string) {
    const pb = createPublicPB();
    const record = await pb.collection("events").getOne(eventId);
    if (!record) throw new Error("Event not found");

    const lifecycle = {
      status: getField(record, "status", ""),
      date: getField(record, "date", ""),
      endDate: getField(record, "endDate", ""),
      registrationOpen: !!getField(record, "registrationOpen", false),
      registrationStart: getField(record, "registrationStart", ""),
      registrationDeadline: getField(record, "registrationDeadline", ""),
      isDeleted: !!getField(record, "isDeleted", false),
    };

    if (!isPublicEvent(lifecycle)) throw new Error("Event not found");

    const price = Number(getField(record, "price", 0)) || 0;
    const bannerRaw = getField(record, "banner", "");
    const event = {
      id: getField(record, "id", ""),
      title: getField(record, "title", ""),
      description: getField(record, "description", ""),
      date: lifecycle.date,
      endDate: lifecycle.endDate,
      venue: getField(record, "venue", ""),
      price,
      isPaid: price > 0,
      bannerUrl: bannerRaw ? buildFileUrl("events", eventId, bannerRaw) : "",
      // Completed/past events stay publicly viewable, but this route renders the
      // existing Registration Closed state instead of an active form.
      registrationOpen: canRegisterForEvent(lifecycle),
      maxCapacity: getField(record, "maxCapacity", 0),
      registeredCount: getField(record, "registeredCount", 0),
      collectIeeeMember: !!getField(record, "collectIeeeMember", false),
      formFields: (() => {
        const fields = getField(record, "formTemplate", undefined);
        return Array.isArray(fields) ? fields : [];
      })(),
    };
    return { event };
}
