export type FifaNavKey = 'home' | 'matches' | 'leaderboard' | 'feed' | 'rules' | 'dashboard'

export const FIFA_NAV_ITEMS = [
  { key: 'home' as const, label: 'Overview', to: '/FIFA/' as const },
  { key: 'matches' as const, label: 'Matches', to: '/FIFA/matches/' as const },
  { key: 'leaderboard' as const, label: 'Leaderboard', to: '/FIFA/leaderboard/' as const },
  { key: 'feed' as const, label: 'Feed', to: '/FIFA/feed/' as const },
  { key: 'rules' as const, label: 'Rules', to: '/FIFA/rules/' as const },
]

export function fifaNavKeyFromPath(pathname: string): FifaNavKey {
  const p = pathname.replace(/\/+$/, '') || '/'
  if (p === '/FIFA') return 'home'
  if (p.startsWith('/FIFA/matches')) return 'matches'
  if (p.startsWith('/FIFA/leaderboard')) return 'leaderboard'
  if (p.startsWith('/FIFA/feed')) return 'feed'
  if (p.startsWith('/FIFA/rules')) return 'rules'
  if (p.startsWith('/FIFA/dashboard')) return 'dashboard'
  return 'home'
}

export function isFifaPath(pathname: string): boolean {
  return pathname.toLowerCase().startsWith('/fifa')
}

export function isFifaHomePath(pathname: string): boolean {
  const p = pathname.replace(/\/+$/, '') || '/'
  return p === '/FIFA'
}