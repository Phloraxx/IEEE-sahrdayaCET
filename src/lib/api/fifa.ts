import type { FifaSettings } from "@/schemas/fifa"

export async function fetchSettings(): Promise<FifaSettings> {
  const res = await fetch('/api/admin/fifa/settings')
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Failed to load settings')
  }
  const data = await res.json()
  return data.settings
}
