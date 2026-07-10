async function inspectEspn() {
  const url = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard'
  console.log(`Fetching from ${url}...`)
  const res = await fetch(url)
  if (!res.ok) throw new Error('Failed to fetch ESPN')
  const data = await res.json()

  const events = data.events || []
  for (const event of events) {
    const comp = event.competitions[0]
    const home = comp.competitors.find((c: any) => c.homeAway === 'home')?.team?.name || 'Unknown'
    const away = comp.competitors.find((c: any) => c.homeAway === 'away')?.team?.name || 'Unknown'
    console.log(`[ESPN ${event.id}] ${home} vs ${away} | Date: ${event.date} | Status: ${event.status.type.state}`)
  }
  console.log(`\nTotal events: ${events.length}`)
}

inspectEspn().catch(console.error)
