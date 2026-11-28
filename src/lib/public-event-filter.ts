/**
 * Filters out test/placeholder event records from public listings.
 *
 * Keeps real branch events (including short acronyms like "JAM" or low-cost
 * workshops with real descriptions) while hiding QA stubs such as "tess" or
 * "testss" with placeholder venues or off-hours test timestamps.
 */

export interface PublicEventFilterInput {
  title?: string | null;
  slug?: string | null;
  description?: string | null;
  venue?: string | null;
  date?: string | null;
  timeTbc?: boolean | number | null;
  price?: number | null;
  banner?: string | null;
  bannerUrl?: string | null;
}

const TEST_TITLE_OR_SLUG_RE =
  /^(?:test(?:s|ss|ing)?|tess|dummy|sample|asdf|qwerty|placeholder)(?:[-_\s\d].*)?$/i;

const TEST_SLUG_TOKEN_RE = /(?:^|-)test(?:s|ss|ing)?(?:-\d+)?$/i;

function getIstHour(dateString: string | null | undefined): number | null {
  if (!dateString) return null;
  const parsed = new Date(dateString);
  if (Number.isNaN(parsed.getTime())) return null;
  const hourStr = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    hour12: false,
    timeZone: "Asia/Kolkata",
  }).format(parsed);
  const hour = Number.parseInt(hourStr, 10);
  return Number.isNaN(hour) ? null : hour;
}

export function isTestOrPlaceholderEvent(event: PublicEventFilterInput): boolean {
  const title = (event.title ?? "").trim();
  const slug = (event.slug ?? "").trim();
  const description = (event.description ?? "").trim();
  const venue = (event.venue ?? "").trim();
  const hasBanner = Boolean((event.banner ?? "").trim() || (event.bannerUrl ?? "").trim());
  const price = Number(event.price) || 0;
  const timeTbc = event.timeTbc === true || event.timeTbc === 1;

  if (TEST_TITLE_OR_SLUG_RE.test(title) || TEST_TITLE_OR_SLUG_RE.test(slug)) {
    return true;
  }

  if (TEST_SLUG_TOKEN_RE.test(slug) && !description && !hasBanner) {
    return true;
  }

  if (!description && !hasBanner) {
    // 1-2 letter placeholder venues like "ss" or "sa" without descriptions
    if (venue.length > 0 && venue.length <= 2) {
      return true;
    }

    // Off-hours (00:00–05:59 IST) with token ₹1–₹2 pricing and no copy/artwork
    const istHour = getIstHour(event.date);
    if (!timeTbc && istHour !== null && istHour < 6 && price > 0 && price <= 2) {
      return true;
    }
  }

  return false;
}

export function isPublicDisplayEvent(event: PublicEventFilterInput): boolean {
  return !isTestOrPlaceholderEvent(event);
}
