export type FifaNavKey = 'home' | 'matches' | 'leaderboard' | 'rules' | 'dashboard'

export const FIFA_NAV_ITEMS = [
  { key: 'home' as const, label: 'Overview', to: '/FIFA/' as const },
  { key: 'matches' as const, label: 'Matches', to: '/FIFA/matches/' as const },
  { key: 'leaderboard' as const, label: 'Leaderboard', to: '/FIFA/leaderboard/' as const },
  { key: 'rules' as const, label: 'Rules', to: '/FIFA/rules/' as const },
]

export function isFifaPath(pathname: string): boolean {
  return pathname.toLowerCase().startsWith('/fifa')
}

export function isFifaHomePath(pathname: string): boolean {
  const p = pathname.replace(/\/+$/, '') || '/'
  return p === '/FIFA'
}