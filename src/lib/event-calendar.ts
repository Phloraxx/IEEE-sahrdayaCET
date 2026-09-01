import type { SerializableEvent } from "@/server/public/events.server";

function escapeIcs(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function foldIcsLine(line: string): string[] {
  const encoder = new TextEncoder();
  const folded: string[] = [];
  let current = "";
  for (const char of line) {
    const candidate = current + char;
    if (current && encoder.encode(candidate).length > 75) {
      folded.push(current);
      current = ` ${char}`;
    } else {
      current = candidate;
    }
  }
  if (current) folded.push(current);
  return folded;
}

function utcStamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function calendarDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}${parts.month}${parts.day}`;
}
function nextCalendarDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  date.setUTCDate(date.getUTCDate() + 1);
  return calendarDate(date.toISOString());
}

export function eventCalendarIcs(event: SerializableEvent, publicUrl: string): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//IEEE Sahrdaya Student Branch//Events//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:event-${event.id}@ieeesahrdaya.com`,
    `DTSTAMP:${utcStamp(event.updatedAt || event.createdAt || event.date)}`,
    `SUMMARY:${escapeIcs(event.title)}`,
    `URL:${escapeIcs(publicUrl)}`,
  ];
  const location = event.attendanceMode === "online"
    ? "Online"
    : [event.venue, event.locationAddress].filter(Boolean).join(", ");
  if (location) lines.push(`LOCATION:${escapeIcs(location)}`);
  if (event.timeTbc) {
    const start = calendarDate(event.date);
    if (start) lines.push(`DTSTART;VALUE=DATE:${start}`);
    const endSource = event.endDate || event.date;
    const end = nextCalendarDate(endSource);
    if (end) lines.push(`DTEND;VALUE=DATE:${end}`);
  } else {
    const start = utcStamp(event.date);
    const end = utcStamp(event.endDate);
    if (start) lines.push(`DTSTART:${start}`);
    if (end) lines.push(`DTEND:${end}`);
  }
  if (event.status === "cancelled") lines.push("STATUS:CANCELLED");
  else lines.push("STATUS:CONFIRMED");
  lines.push("END:VEVENT", "END:VCALENDAR", "");
  return lines.flatMap(foldIcsLine).join("\r\n");
}

export const __eventCalendarTest = { escapeIcs, foldIcsLine, utcStamp, calendarDate, nextCalendarDate };
