const STAGE_LABELS: Record<string, string> = {
  r32: 'Round of 32',
  r16: 'Round of 16',
  qf: 'Quarter-final',
  sf: 'Semi-final',
  third_place: 'Third place',
  final: 'Final',
}

const STAGE_COLORS: Record<string, string> = {
  r32: '#0099D6',
  r16: '#00B8A9',
  qf: '#00629B',
  sf: '#6366F1',
  third_place: '#8B5CF6',
  final: '#F59E0B',
}

/** Team display name → flagcdn.com ISO code */
const TEAM_FLAG_CODES: Record<string, string> = {
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

function getFlagCode(team: string): string | null {
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

export interface MatchCardAsset {
  imageUrl: string
  position: string
  gradient: string
  isFallback: boolean
}

function getMatchCardAsset(home: string, away: string, stage?: string): MatchCardAsset {
  const key = pairKey(home, away)
  const reversed = pairKey(away, home)
  const fallbackAsset = { imageUrl: '/fifa/hero-poster.jpg', position: '50% 20%' }
  const matched = MATCH_CARD_IMAGES[key] ?? MATCH_CARD_IMAGES[reversed]
  const asset = matched ?? fallbackAsset
  const gradient = stage ? getStageColor(stage) : '#00629B'
  return { imageUrl: asset.imageUrl, position: asset.position, gradient, isFallback: !matched }
}

/** Prefer internet-sourced ESPN promo photo; fall back to local pair art. */
export function resolveMatchCardAsset(
  home: string,
  away: string,
  stage?: string,
  remote?: { imageUrl?: string | null; position?: string | null },
): MatchCardAsset {
  if (remote?.imageUrl) {
    return {
      imageUrl: remote.imageUrl,
      position: remote.position || '50% 35%',
      gradient: stage ? getStageColor(stage) : '#00629B',
      isFallback: false,
    }
  }
  return getMatchCardAsset(home, away, stage)
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

/** Canonical full name for 3-letter / alias codes used in some imports. */
const TEAM_ALIASES: Record<string, string> = {
  ARG: 'Argentina',
  ENG: 'England',
  FRA: 'France',
  SPA: 'Spain',
  ESP: 'Spain',
  SUI: 'Switzerland',
  SWI: 'Switzerland',
  GER: 'Germany',
  BRA: 'Brazil',
  POR: 'Portugal',
  NED: 'Netherlands',
  BEL: 'Belgium',
  NOR: 'Norway',
  MEX: 'Mexico',
  USA: 'United States',
  CRO: 'Croatia',
  ITA: 'Italy',
  URU: 'Uruguay',
  COL: 'Colombia',
  JPN: 'Japan',
  KOR: 'South Korea',
  MAR: 'Morocco',
  SEN: 'Senegal',
  NGA: 'Nigeria',
  GHA: 'Ghana',
  AUS: 'Australia',
  KSA: 'Saudi Arabia',
  CAN: 'Canada',
}

export interface TeamStarPlayer {
  name: string
  photoUrl: string
}

function espnHeadshot(playerId: string): string {
  return `https://a.espncdn.com/i/headshots/soccer/players/full/${playerId}.png`
}

/** Star player per nation — ESPN headshots with team-logo fallback via getTeamPlayerVisual(). */
const TEAM_STAR_PLAYERS: Record<string, TeamStarPlayer> = {
  Argentina: { name: 'Lionel Messi', photoUrl: espnHeadshot('45843') },
  France: { name: 'Kylian Mbappé', photoUrl: espnHeadshot('231388') },
  England: { name: 'Harry Kane', photoUrl: espnHeadshot('142200') },
  Spain: { name: 'Lamine Yamal', photoUrl: espnHeadshot('362150') },
  Switzerland: { name: 'Granit Xhaka', photoUrl: espnHeadshot('149656') },
  Germany: { name: 'Jamal Musiala', photoUrl: espnHeadshot('291808') },
  Brazil: { name: 'Vinícius Júnior', photoUrl: espnHeadshot('277479') },
  Portugal: { name: 'Cristiano Ronaldo', photoUrl: espnHeadshot('139437') },
  Netherlands: { name: 'Virgil van Dijk', photoUrl: espnHeadshot('140553') },
  Belgium: { name: 'Kevin De Bruyne', photoUrl: espnHeadshot('159543') },
  Norway: { name: 'Erling Haaland', photoUrl: espnHeadshot('256642') },
  Mexico: { name: 'Hirving Lozano', photoUrl: espnHeadshot('205498') },
  'United States': { name: 'Christian Pulisic', photoUrl: espnHeadshot('227363') },
  USA: { name: 'Christian Pulisic', photoUrl: espnHeadshot('227363') },
  Canada: { name: 'Alphonso Davies', photoUrl: espnHeadshot('227364') },
  Croatia: { name: 'Luka Modrić', photoUrl: espnHeadshot('132948') },
  Italy: { name: 'Federico Chiesa', photoUrl: espnHeadshot('227127') },
  Uruguay: { name: 'Darwin Núñez', photoUrl: espnHeadshot('256632') },
  Colombia: { name: 'Luis Díaz', photoUrl: espnHeadshot('256633') },
  Japan: { name: 'Takefusa Kubo', photoUrl: espnHeadshot('256634') },
  'South Korea': { name: 'Son Heung-min', photoUrl: espnHeadshot('149945') },
  Morocco: { name: 'Achraf Hakimi', photoUrl: espnHeadshot('227128') },
  Senegal: { name: 'Sadio Mané', photoUrl: espnHeadshot('173896') },
  Nigeria: { name: 'Victor Osimhen', photoUrl: espnHeadshot('256635') },
  Ghana: { name: 'Mohammed Kudus', photoUrl: espnHeadshot('291809') },
  Australia: { name: 'Mathew Ryan', photoUrl: espnHeadshot('149657') },
  'Saudi Arabia': { name: 'Salem Al-Dawsari', photoUrl: espnHeadshot('256636') },
}

export function normalizeTeamDisplayName(team: string): string {
  const trimmed = team.trim()
  return TEAM_ALIASES[trimmed.toUpperCase()] ?? trimmed
}

export function getTeamStarPlayer(team: string): TeamStarPlayer | null {
  const name = normalizeTeamDisplayName(team)
  return TEAM_STAR_PLAYERS[name] ?? TEAM_STAR_PLAYERS[team.trim()] ?? null
}

export interface TeamPlayerVisual {
  name: string
  photoUrl: string
  isPlayerPhoto: boolean
}

/** Player headshot when mapped; otherwise a large team crest as a stand-in. */
export function getTeamPlayerVisual(team: string): TeamPlayerVisual | null {
  const star = getTeamStarPlayer(team)
  if (star) {
    return { name: star.name, photoUrl: star.photoUrl, isPlayerPhoto: true }
  }
  const code = getFlagCode(normalizeTeamDisplayName(team)) ?? getFlagCode(team)
  if (!code) return null
  const crestCode = code.replace('gb-eng', 'eng')
  return {
    name: normalizeTeamDisplayName(team),
    photoUrl: `https://a.espncdn.com/i/teamlogos/countries/500/${crestCode}.png`,
    isPlayerPhoto: false,
  }
}