export const STAGE_LABELS: Record<string, string> = {
  r32: 'Round of 32',
  r16: 'Round of 16',
  qf: 'Quarter-final',
  sf: 'Semi-final',
  third_place: 'Third place',
  final: 'Final',
}

export const STAGE_COLORS: Record<string, string> = {
  r32: '#0099D6',
  r16: '#00B8A9',
  qf: '#00629B',
  sf: '#6366F1',
  third_place: '#8B5CF6',
  final: '#F59E0B',
}

/** Team display name → flagcdn.com ISO code */
export const TEAM_FLAG_CODES: Record<string, string> = {
  'United States': 'us',
  USA: 'us',
  Mexico: 'mx',
  Canada: 'ca',
  Brazil: 'br',
  Argentina: 'ar',
  Germany: 'de',
  France: 'fr',
  England: 'gb-eng',
  Spain: 'es',
  Portugal: 'pt',
  Netherlands: 'nl',
  Belgium: 'be',
  Japan: 'jp',
  'South Korea': 'kr',
  Morocco: 'ma',
  Senegal: 'sn',
  Uruguay: 'uy',
  Colombia: 'co',
  Croatia: 'hr',
  Italy: 'it',
  Nigeria: 'ng',
  Ghana: 'gh',
  Australia: 'au',
  'Saudi Arabia': 'sa',
  Norway: 'no',
  NOR: 'no',
  Switzerland: 'ch',
  SWI: 'ch',
  ENG: 'gb-eng',
  ARG: 'ar',
}

type CardAsset = { imageUrl: string; position: string }

/** Normalized home|away → card photo (from prototype fixtures) */
const MATCH_CARD_IMAGES: Record<string, CardAsset> = {
  'united states|mexico': { imageUrl: '/fifa/cards/usa-mexico.jpg', position: '50% 35%' },
  'canada|brazil': { imageUrl: '/fifa/cards/canada-brazil.jpg', position: '50% 55%' },
  'argentina|germany': { imageUrl: '/fifa/cards/argentina-germany.jpg', position: '50% 30%' },
  'france|england': { imageUrl: '/fifa/cards/france-england.jpg', position: '75% 45%' },
  'spain|portugal': { imageUrl: '/fifa/cards/spain-portugal.jpg', position: '50% 30%' },
  'netherlands|belgium': { imageUrl: '/fifa/cards/netherlands-belgium.jpg', position: '60% 60%' },
  'japan|south korea': { imageUrl: '/fifa/cards/japan-korea.jpg', position: '60% 30%' },
  'morocco|senegal': { imageUrl: '/fifa/cards/morocco-senegal.jpg', position: '50% 40%' },
  'uruguay|colombia': { imageUrl: '/fifa/cards/uruguay-colombia.jpg', position: '50% 50%' },
  'croatia|italy': { imageUrl: '/fifa/cards/croatia-italy.jpg', position: '55% 55%' },
  'nigeria|ghana': { imageUrl: '/fifa/cards/nigeria-ghana.jpg', position: '50% 35%' },
  'australia|saudi arabia': { imageUrl: '/fifa/cards/australia-saudi.jpg', position: '50% 40%' },
}

function pairKey(home: string, away: string): string {
  return `${home.trim().toLowerCase()}|${away.trim().toLowerCase()}`
}

export function getFlagCode(team: string): string | null {
  return TEAM_FLAG_CODES[team.trim()] ?? null
}

export function flagUrl(team: string): string | null {
  const code = getFlagCode(team)
  return code ? `https://flagcdn.com/w80/${code}.png` : null
}

export function getStageLabel(stage: string): string {
  return STAGE_LABELS[stage] ?? stage.toUpperCase()
}

export function getStageColor(stage: string): string {
  return STAGE_COLORS[stage] ?? '#00629B'
}

export function getMatchCardAsset(home: string, away: string, stage?: string): {
  imageUrl: string | null
  position: string
  gradient: string
} {
  const key = pairKey(home, away)
  const reversed = pairKey(away, home)
  const fallbackAsset = { imageUrl: '/fifa/hero-poster.jpg', position: '50% 20%' }
  const asset = MATCH_CARD_IMAGES[key] ?? MATCH_CARD_IMAGES[reversed] ?? fallbackAsset
  const gradient = stage ? getStageColor(stage) : '#00629B'
  return { imageUrl: asset.imageUrl, position: asset.position, gradient }
}

export function teamShortName(team: string): string {
  const shorts: Record<string, string> = {
    'United States': 'USA',
    'South Korea': 'KOR',
    'Saudi Arabia': 'KSA',
  }
  if (shorts[team]) return shorts[team]
  if (team.length <= 4) return team.toUpperCase()
  return team.slice(0, 3).toUpperCase()
}