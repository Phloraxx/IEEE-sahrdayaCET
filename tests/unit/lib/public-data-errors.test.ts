import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * Public data failure semantics.
 *
 * Phase 1 moved the public reads from PocketBase to the SQLite repo layer, so
 * this suite mocks `@/server/public/repo.server` instead of `@/lib/pb.server`.
 * The *behaviour* under test is unchanged: an outage must surface as 503, a
 * genuinely missing leaf record must surface as null/404, and a successful empty
 * read must stay an honest empty state.
 */
const {
  listPublicEvents,
  listPublicSocieties,
  getPublicEventBySlug,
  getEventById,
  listExecom,
  listPublishedBlogs,
} = vi.hoisted(() => ({
  listPublicEvents: vi.fn(),
  listPublicSocieties: vi.fn(),
  getPublicEventBySlug: vi.fn(),
  getEventById: vi.fn(),
  listExecom: vi.fn(),
  listPublishedBlogs: vi.fn(),
}));

vi.mock('@/server/public/repo.server', () => ({
  listPublicEvents,
  listPublicSocieties,
  getPublicEventBySlug,
  getEventById,
  listUpcomingEvents: listPublicEvents,
  listExecom,
  countExecom: vi.fn().mockResolvedValue(0),
  listPublishedBlogs,
  listPublishedBlogsForSociety: vi.fn().mockResolvedValue([]),
  getPublishedBlogBySlug: vi.fn().mockResolvedValue(undefined),
  listPublicEventsForSociety: vi.fn().mockResolvedValue([]),
  listExecomForSociety: vi.fn().mockResolvedValue([]),
  getPublicSocietyBySlug: vi.fn().mockResolvedValue(undefined),
  listSocietyChairIds: vi.fn().mockResolvedValue([]),
  lookupTicket: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));

import { fetchEvents, fetchEventBySlug } from '@/server/public/events.server';
import { fetchSocieties } from '@/server/public/societies.server';
import { loader as registerLoader } from '@/routes/register.$eventId';
import { loader as directoryLoader } from '@/routes/full-execom';
import { loader as blogLoader } from '@/routes/blog.index';
import { loader as pricingLoader } from '@/routes/pricing';

beforeEach(() => {
  vi.clearAllMocks();
  listPublicEvents.mockResolvedValue([]);
  listPublicSocieties.mockResolvedValue([]);
  listExecom.mockResolvedValue([]);
  listPublishedBlogs.mockResolvedValue([]);
});

/** A minimal EventRow as the repo returns it. */
function eventRow(overrides: Record<string, unknown>) {
  return {
    id: 'e1',
    title: 'Event',
    slug: 'event',
    description: null,
    date: '2026-01-01T00:00:00.000Z',
    end_date: null,
    time_tbc: 0,
    venue: null,
    timezone: null,
    attendance_mode: null,
    location_address: null,
    price: 0,
    banner: null,
    status: 'published',
    registration_open: 0,
    registration_mode: null,
    registration_start: null,
    registration_deadline: null,
    max_capacity: null,
    registered_count: 0,
    waitlist_enabled: 0,
    waitlist_reserved_count: 0,
    external_form_url: null,
    external_link: null,
    collect_ieee_member: 0,
    ieee_member_discount_percent: 0,
    eligible_semesters: null,
    eligible_programmes: null,
    requirements: null,
    attendee_note: null,
    tags: null,
    contact_email: null,
    contact_phone: null,
    is_deleted: 0,
    check_in_enabled: 0,
    form_template: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    society_id: null,
    society_row_id: null,
    society_name: null,
    society_slug: null,
    society_logo: null,
    ...overrides,
  };
}

describe('public data failure semantics', () => {
  it('retains an honest empty list after a successful read', async () => {
    expect(await fetchEvents()).toEqual([]);
    expect(await fetchSocieties()).toEqual([]);
  });

  it('exposes an outage as 503 rather than empty content', async () => {
    listPublicEvents.mockRejectedValue(new Error('private internal address'));
    listPublicSocieties.mockRejectedValue(new Error('private internal address'));
    await expect(fetchEvents()).rejects.toMatchObject({ status: 503 });
    await expect(fetchSocieties()).rejects.toMatchObject({ status: 503 });
  });

  it('uses not-found only for a missing leaf record', async () => {
    // A missing slug is a normal "no such record", not an outage.
    getPublicEventBySlug.mockResolvedValue(undefined);
    expect(await fetchEventBySlug('missing')).toBeNull();

    // A failing query is an outage.
    getPublicEventBySlug.mockRejectedValue(new Error('database unavailable'));
    await expect(fetchEventBySlug('existing')).rejects.toMatchObject({ status: 503 });
  });

  it('keeps directory and blog failures out of normal empty states', async () => {
    // The directory reads the execom table; the blog index reads published blogs.
    listExecom.mockRejectedValue(new Error('service unavailable'));
    listPublishedBlogs.mockRejectedValue(new Error('service unavailable'));
    await expect(directoryLoader()).rejects.toMatchObject({ status: 503 });
    await expect(blogLoader()).rejects.toMatchObject({ status: 503 });
  });

  it('distinguishes a missing registration event from an outage', async () => {
    const args = {
      params: { eventId: 'test-event' },
      request: new Request('http://localhost/register/test-event'),
      context: {},
      url: new URL('http://localhost/register/test-event'),
      pattern: '/register/:eventId',
    } as never;

    getEventById.mockResolvedValue(undefined);
    await expect(registerLoader(args)).rejects.toMatchObject({ status: 404 });

    getEventById.mockRejectedValue(new Error('database unavailable'));
    await expect(registerLoader(args)).rejects.toMatchObject({ status: 503 });
  });

  it('classifies past published events as history and sorts it chronologically', async () => {
    listPublicEvents.mockResolvedValue([
      eventRow({ id: 'older', title: 'Older published', date: '2020-01-01T00:00:00.000Z' }),
      eventRow({ id: 'next', title: 'Upcoming', date: '2099-01-01T00:00:00.000Z' }),
      eventRow({
        id: 'recent',
        title: 'Recent completed',
        status: 'completed',
        date: '2025-01-01T00:00:00.000Z',
      }),
    ]);

    const result = await pricingLoader();
    expect(result.current.map((e) => e.id)).toEqual(['next']);
    expect(result.past.map((e) => e.id)).toEqual(['recent', 'older']);
  });
});
