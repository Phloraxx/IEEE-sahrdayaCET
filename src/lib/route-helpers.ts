/**
 * Parses and validates pagination params from a URL with NaN/clamp guards.
 */
export function parsePagination(
  url: URL,
  options: { defaultPerPage?: number; maxPerPage?: number } = {},
): { page: number; perPage: number } {
  const defaultPerPage = options.defaultPerPage ?? 20
  const maxPerPage = options.maxPerPage ?? 100
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1)
  const perPage = Math.min(
    Math.max(1, parseInt(url.searchParams.get('perPage') || String(defaultPerPage), 10) || defaultPerPage),
    maxPerPage,
  )
  return { page, perPage }
}

/**
 * Joins non-empty PocketBase filter fragments with ' && ', wrapping in parens.
 * Accepts undefined/null entries and drops them — callers can pass optional
 * filter parts without pre-filtering.
 */
export function buildFilter(parts: Array<string | undefined | null>): string {
  const nonEmpty = parts.filter((p): p is string => Boolean(p))
  if (nonEmpty.length === 0) return ''
  if (nonEmpty.length === 1) return nonEmpty[0]
  return nonEmpty.map((p) => (p.includes(' && ') || p.includes(' || ') ? `(${p})` : p)).join(' && ')
}
