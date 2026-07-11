import dotenv from 'dotenv'
dotenv.config({ path: '.env' })

async function inspectMatches() {
  const PB_URL = process.env.POCKETBASE_URL || process.env.PB_URL || 'http://127.0.0.1:8090'
  
  console.log('Fetching fifa_matches (unauthenticated)...')
  const res = await fetch(`${PB_URL}/api/collections/fifa_matches/records?perPage=500`)
  if (!res.ok) throw new Error('Failed to fetch matches')
  const data = await res.json()

  for (const m of data.items) {
    console.log(`[${m.id}] ${m.team_home} vs ${m.team_away} | Stage: ${m.stage} | Status: ${m.status} | Kickoff: ${m.kickoff_at} | Settled: ${m.settled} | ESPN ID: ${m.external_ids?.espn || 'NONE'}`)
  }
  console.log(`\nTotal count: ${data.totalItems}`)
}

inspectMatches().catch(console.error)
