import { logError } from '@/lib/logger';
export function isMissingRecord(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'status' in error && error.status === 404;
}
export function publicDataUnavailable(context: string, error: unknown): never {
  logError(context, error);
  throw new Response('Content temporarily unavailable', { status: 503, headers: { 'Retry-After': '60', 'Cache-Control': 'no-store' } });
}
