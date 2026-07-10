export const TEAM_ALIASES: Record<string, string> = {
  // Common aliases mapped to our standard DB names
  // Keys must be strictly lowercase.
  'usa': 'united states',
  'us': 'united states',
  'korea republic': 'south korea',
  'korea dpr': 'north korea',
  'ir iran': 'iran',
  'islamic republic of iran': 'iran',
  'türkiye': 'turkey',
  'turkiye': 'turkey',
  'nederland': 'netherlands',
  'holland': 'netherlands',
  'czechia': 'czech republic',
  'cote d\'ivoire': 'ivory coast',
  'côte d\'ivoire': 'ivory coast',
  'ksa': 'saudi arabia',
  'pr china': 'china',
  'china pr': 'china',
  'uae': 'united arab emirates',
  'bosnia and herzegovina': 'bosnia',
  'bosnia-herzegovina': 'bosnia',
  'cape verde islands': 'cape verde',
  'dr congo': 'congo dr',
  'democratic republic of the congo': 'congo dr',
  'republic of ireland': 'ireland',
}

/**
 * Normalises a team name to handle API variants vs DB names.
 * Lowercases, trims, and resolves through the TEAM_ALIASES dictionary.
 */
export function normaliseTeamName(name: string): string {
  if (!name) return ''
  const clean = name.trim().toLowerCase()
  return TEAM_ALIASES[clean] || clean
}
