/** Google OAuth `name` on users — immutable, shown on leaderboard/dashboard. */
export function userDisplayName(user: {
  name?: string | null
  display_name?: string | null
}): string {
  const google = String(user.name ?? '').trim()
  if (google) return google
  const legacy = String(user.display_name ?? '').trim()
  if (legacy) return legacy
  return ''
}