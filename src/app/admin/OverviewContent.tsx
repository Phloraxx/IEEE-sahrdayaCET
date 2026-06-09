import { createPB, createAdminPB } from '@/lib/pb'
import { cookies } from 'next/headers'
import { OverviewClient } from './OverviewClient'
import { getChairSocietyIds } from '@/lib/chair-scope'

export async function OverviewContent() {
  const cookieStore = await cookies()
  const pb = createPB(`pb_auth=${cookieStore.get('pb_auth')?.value}`)

  // Determine user role for scoping
  let userRole = ''
  let userId = ''
  let userName = ''
  try {
    await pb.collection('users').authRefresh()
    const record = pb.authStore.record as { id: string; role: string; name: string } | null
    if (record) {
      userRole = record.role || ''
      userId = record.id || ''
      userName = record.name || ''
    }
  } catch {
    // Fall through with empty role
  }

  const adminPB = createAdminPB()
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  const past7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

  // Build scope filter for chairs
  let eventScopeFilter = ''
  let chairEventIds: string[] = []
  if (userRole === 'chair' && userId) {
    const societyIds = await getChairSocietyIds(adminPB, userId)
    if (societyIds.length > 0) {
      eventScopeFilter = societyIds.map((id) => `society = '${id}'`).join(' || ')
      // Also get event IDs for registration filtering
      const chairEvents = await adminPB.collection('events').getFullList({
        filter: eventScopeFilter,
        fields: 'id',
      })
      chairEventIds = (chairEvents || []).map((e: Record<string, unknown>) => e.id as string)
    }
  }

  try {
    const eventFilter = eventScopeFilter ? { filter: eventScopeFilter, fields: 'id,title,date,endDate,venue,status,maxCapacity,registeredCount', sort: 'date' } as const : { fields: 'id,title,date,endDate,venue,status,maxCapacity,registeredCount', sort: 'date' } as const
    const [allEvents, allSocieties] = await Promise.all([
      adminPB.collection('events').getFullList(eventFilter) as Promise<Record<string, unknown>[]>,
      adminPB.collection('societies').getFullList({ fields: 'id,isHidden' }) as Promise<Record<string, unknown>[]>,
    ])

    // Fetch registrations — for chairs only those for their events
    let allRegs: Record<string, unknown>[] = []
    if (userRole === 'chair' && chairEventIds.length > 0) {
      const regFilter = chairEventIds.map((id) => `event = '${id}'`).join(' || ')
      allRegs = await adminPB.collection('registrations').getFullList({
        filter: regFilter,
        fields: 'id,userName,userEmail,registrationStatus,paymentStatus,registrationDate,checkedIn',
        sort: '-registrationDate',
      }) as Record<string, unknown>[]
    } else if (userRole !== 'chair') {
      allRegs = await adminPB.collection('registrations').getFullList({
        fields: 'id,userName,userEmail,registrationStatus,paymentStatus,registrationDate,checkedIn',
        sort: '-registrationDate',
      }) as Record<string, unknown>[]
    }

    // ── Derive event stats ──
    const eventsTotal = allEvents.length
    const eventsUpcoming = allEvents.filter((e) => {
      const d = new Date(e.date as string)
      return d > now && (e.status as string) === 'published'
    }).length
    const eventsLive = allEvents.filter((e) => {
      const start = new Date(e.date as string)
      const end = e.endDate ? new Date(e.endDate as string) : start
      return start <= now && end >= now && (e.status as string) === 'published'
    }).length

    // ── Derive registration stats ──
    const regsTotal = allRegs.length
    const regsConfirmed = allRegs.filter((r) => (r.registrationStatus as string) === 'confirmed').length
    const regsPending = allRegs.filter((r) => (r.registrationStatus as string) === 'pending').length
    const regsToday = allRegs.filter((r) => {
      const d = new Date(r.registrationDate as string)
      return d >= startOfToday && d < endOfToday
    }).length

    // ── Derive society stats ──
    const societiesTotal = allSocieties.length
    const societiesActive = allSocieties.filter((s) => !s.isHidden).length

    const stats = {
      events: { total: eventsTotal, upcoming: eventsUpcoming, live: eventsLive },
      registrations: { total: regsTotal, confirmed: regsConfirmed, pending: regsPending, today: regsToday },
      societies: { active: societiesActive, total: societiesTotal },
    }

    // ── Upcoming events widget (next 5) ──
    const upcoming = allEvents
      .filter((e) => {
        const d = new Date(e.date as string)
        return d > now && (e.status as string) === 'published'
      })
      .slice(0, 5)
      .map((e) => ({
        id: e.id as string,
        title: e.title as string,
        date: e.date as string,
        venue: (e.venue as string) || '',
        maxCapacity: Number(e.maxCapacity) || 0,
        registeredCount: Number(e.registeredCount) || 0,
      }))

    // ── Recent registrations (latest 8) ──
    const recent = allRegs
      .slice(0, 8)
      .map((r) => ({
        id: r.id as string,
        userName: (r.userName as string) || 'Unknown',
        userEmail: (r.userEmail as string) || '',
        registrationStatus: (r.registrationStatus as string) || 'pending',
        paymentStatus: (r.paymentStatus as string) || '',
        checkedIn: !!r.checkedIn,
        createdAt: (r.registrationDate as string) || '',
      }))

    // ── Chart data (last 7 days) ──
    const dailyMap: Record<string, number> = {}
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now)
      d.setDate(d.getDate() - i)
      const key = d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })
      dailyMap[key] = 0
    }
    let paid = 0, pending = 0, notRequired = 0
    for (const r of allRegs) {
      const d = new Date(r.registrationDate as string)
      if (d < past7) continue
      const key = d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })
      if (key in dailyMap) dailyMap[key]++
      const ps = r.paymentStatus as string
      if (ps === 'paid') paid++
      else if (ps === 'pending') pending++
      else notRequired++
    }
    const dailyRegistrations = Object.entries(dailyMap).map(([date, count]) => ({ date, count }))
    const paymentDistribution = [
      { name: 'Paid', value: paid, fill: 'var(--color-chart-1)' },
      { name: 'Pending', value: pending, fill: 'var(--color-chart-2)' },
      { name: 'Free', value: notRequired, fill: 'var(--color-chart-3)' },
    ]

    return (
      <OverviewClient
        stats={stats}
        upcoming={upcoming}
        recent={recent}
        dailyRegistrations={dailyRegistrations}
        paymentDistribution={paymentDistribution}
        userName={userName}
        userRole={userRole}
      />
    )
  } catch (e) {
    console.error('Overview fetch failed:', e)
    return (
      <OverviewClient
        stats={null}
        upcoming={[]}
        recent={[]}
        dailyRegistrations={[]}
        paymentDistribution={[]}
        userName={userName}
        userRole={userRole}
      />
    )
  }
}
