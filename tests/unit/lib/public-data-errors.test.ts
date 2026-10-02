import { describe, expect, it, vi, beforeEach } from 'vitest';
const { fullList, firstItem } = vi.hoisted(() => ({ fullList: vi.fn(), firstItem: vi.fn() }));
vi.mock('@/lib/pb.server', () => ({ createPublicPB: () => ({ collection: () => ({ getFullList: fullList, getFirstListItem: firstItem }) }) }));
vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));
import { fetchEvents, fetchEventBySlug } from '@/server/public/events.server';
import { fetchSocieties } from '@/server/public/societies.server';
import { loader as pricingLoader } from '@/routes/pricing';

beforeEach(() => { vi.clearAllMocks(); });
describe('public data failure semantics', () => {
  it('retains an honest empty list after a successful read', async () => {
    fullList.mockResolvedValue([]);
    expect(await fetchEvents()).toEqual([]);
    expect(await fetchSocieties()).toEqual([]);
  });
  it('exposes an outage as 503 rather than empty content', async () => {
    fullList.mockRejectedValue(new Error('private internal address'));
    await expect(fetchEvents()).rejects.toMatchObject({ status: 503 });
    await expect(fetchSocieties()).rejects.toMatchObject({ status: 503 });
  });
  it('uses not-found only for a missing leaf record', async () => {
    firstItem.mockRejectedValue({ status: 404 });
    expect(await fetchEventBySlug('missing')).toBeNull();
    firstItem.mockRejectedValue({ status: 500 });
    await expect(fetchEventBySlug('existing')).rejects.toMatchObject({ status: 503 });
  });
  it('classifies past published events as history and sorts it chronologically', async () => {
    const base = { status: 'published', price: 0 };
    fullList.mockResolvedValue([
      { ...base, id: 'older', title: 'Older published', date: '2020-01-01T00:00:00Z' },
      { ...base, id: 'next', title: 'Upcoming', date: '2099-01-01T00:00:00Z' },
      { ...base, id: 'recent', title: 'Recent completed', status: 'completed', date: '2025-01-01T00:00:00Z' },
    ]);
    const result = await pricingLoader();
    expect(result.current.map(e => e.id)).toEqual(['next']);
    expect(result.past.map(e => e.id)).toEqual(['recent', 'older']);
  });
});
