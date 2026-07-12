// Team-name normalization for matching ESPN / openfootball names to fifa_matches.

/** Canonical alias → normalized form (already lowercased). */
const TEAM_ALIASES: Record<string, string> = {
  usa: 'united states',
  us: 'united states',
  'u.s.': 'united states',
  'u.s.a.': 'united states',
  'united states of america': 'united states',
  kor: 'south korea',
  'republic of korea': 'south korea',
  ksa: 'saudi arabia',
  'saudi arabia national team': 'saudi arabia',
  eng: 'england',
  ger: 'germany',
  deu: 'germany',
  fra: 'france',
  esp: 'spain',
  por: 'portugal',
  ned: 'netherlands',
  bel: 'belgium',
  arg: 'argentina',
  bra: 'brazil',
  mex: 'mexico',
  can: 'canada',
  jpn: 'japan',
  mar: 'morocco',
  sen: 'senegal',
  uru: 'uruguay',
  col: 'colombia',
  cro: 'croatia',
  ita: 'italy',
  nga: 'nigeria',
  gha: 'ghana',
  aus: 'australia',
}

function stripFcSuffix(name: string): string {
  return name.replace(/\s+fc$/i, '').trim()
}

/** Lowercase, trim, strip "FC", and map known aliases to a canonical name. */
export function normalizeTeamName(name: string): string {
  const trimmed = stripFcSuffix(name.trim())
  const lower = trimmed.toLowerCase()
  return TEAM_ALIASES[lower] ?? lower
}

/** Case-insensitive match with alias resolution. */
export function teamNamesMatch(a: string, b: string): boolean {
  return normalizeTeamName(a) === normalizeTeamName(b)
}

/** Stable dedupe key for a home/away pair (order-preserving). */
export function teamPairKey(home: string, away: string): string {
  return `${normalizeTeamName(home)}|${normalizeTeamName(away)}`
}