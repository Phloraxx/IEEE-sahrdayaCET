export const MAX_EVENT_REQUIREMENTS = 12;
export const MAX_EVENT_REQUIREMENT_LENGTH = 200;
export const MAX_ATTENDEE_NOTE_LENGTH = 4000;

export function normalizeEventRequirements(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, MAX_EVENT_REQUIREMENTS)
    .map((item) => item.slice(0, MAX_EVENT_REQUIREMENT_LENGTH));
}

export function validateEventRequirements(value: readonly string[]): string | null {
  const normalized = value.map((item) => item.trim()).filter(Boolean);
  if (normalized.length > MAX_EVENT_REQUIREMENTS) return `Add at most ${MAX_EVENT_REQUIREMENTS} event requirements.`;
  if (normalized.some((item) => item.length > MAX_EVENT_REQUIREMENT_LENGTH)) {
    return `Keep each event requirement to ${MAX_EVENT_REQUIREMENT_LENGTH} characters or fewer.`;
  }
  return null;
}

export function memberPrice(basePrice: number, discountPercent: number): number {
  const basePaise = Math.max(0, Math.round((Number(basePrice) || 0) * 100));
  const percent = Math.max(0, Math.min(100, Math.round(Number(discountPercent) || 0)));
  return Math.max(0, basePaise - Math.round(basePaise * percent / 100)) / 100;
}
