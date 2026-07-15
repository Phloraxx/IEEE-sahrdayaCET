import PocketBase from 'pocketbase'
import dotenv from 'dotenv'

dotenv.config({ path: '.env' })

const PB_URL = process.env.POCKETBASE_URL || 'http://127.0.0.1:8090'
const PB_ADMIN_EMAIL = process.env.PB_ADMIN_EMAIL || ''
const PB_ADMIN_PASSWORD = process.env.PB_ADMIN_PASSWORD || ''
const PB_SUPERUSER_TOKEN = process.env.POCKETBASE_SUPERUSER_TOKEN || ''

async function seedLiveMatches() {
  console.log(`Connecting to PocketBase at ${PB_URL}...`)
  const pb = new PocketBase(PB_URL)
  
  if (PB_SUPERUSER_TOKEN) {
    pb.authStore.save(PB_SUPERUSER_TOKEN, null)
    console.log('Authenticated using POCKETBASE_SUPERUSER_TOKEN')
  } else if (PB_ADMIN_EMAIL && PB_ADMIN_PASSWORD) {
    await pb.admins.authWithPassword(PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD)
    console.log('Authenticated using Admin Email/Password')
  } else {
    throw new Error('No admin credentials provided in .env (PB_ADMIN_EMAIL/PASSWORD or POCKETBASE_SUPERUSER_TOKEN). Cannot perform deletions.')
  }

  // 1. Delete ALL records from collections in order
  const collections = ['fifa_bets', 'fifa_transactions', 'fifa_bet_markets', 'fifa_matches']
  for (const col of collections) {
    const records = await pb.collection(col).getFullList()
    let deleted = 0
    for (const r of records) {
      await pb.collection(col).delete(r.id)
      deleted++
    }
    console.log(`Deleted ${deleted} records from ${col}`)
  }

  // 2. Fetch WC 2026 fixtures from ESPN
  const espnUrls = [
    'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard',
    'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=20260601-20260630',
    'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=20260701-20260731'
  ]

  const espnEventsMap = new Map()

  for (const url of espnUrls) {
    const res = await fetch(url)
    if (!res.ok) continue
    const data = await res.json()
    for (const event of data.events || []) {
      espnEventsMap.set(event.id, event)
    }
  }

  console.log(`\nFound ${espnEventsMap.size} unique ESPN events across date ranges.`)

  // 3. Map and insert
  const insertedMatches = []
  
  for (const event of espnEventsMap.values()) {
    const comp = event.competitions[0]
    const home = comp.competitors.find((c: any) => c.homeAway === 'home')?.team?.name || 'Unknown'
    const away = comp.competitors.find((c: any) => c.homeAway === 'away')?.team?.name || 'Unknown'
    
    // Map stage
    let stageName = 'group'
    const note = comp.notes?.[0]?.headline?.toLowerCase() || ''
    if (note.includes('round of 32')) stageName = 'r32'
    else if (note.includes('round of 16')) stageName = 'r16'
    else if (note.includes('quarter')) stageName = 'qf'
    else if (note.includes('semi')) stageName = 'sf'
    else if (note.includes('third place')) stageName = 'third_place'
    else if (note.includes('final')) stageName = 'final'
    else if (note.includes('group')) stageName = 'group'
    
    // Map status
    let status = 'upcoming'
    const state = event.status.type.state // 'pre', 'in', 'post'
    if (state === 'in') status = 'live'
    else if (state === 'post') status = 'finished'

    const record = {
      team_home: home,
      team_away: away,
      stage: stageName,
      kickoff_at: event.date,
      betting_locks_at: event.date,
      status: status,
      external_ids: { espn: event.id },
      settled: false
    }

    await pb.collection('fifa_matches').create(record)
    insertedMatches.push(`[${event.id}] ${home} vs ${away} | Stage: ${stageName} | Kickoff: ${event.date}`)
  }

  console.log(`\nInserted ${insertedMatches.length} matches:`)
  insertedMatches.forEach(m => console.log(m))
}

seedLiveMatches().catch((err) => {
  console.error('\\nERROR:', err.message)
  process.exit(1)
})
