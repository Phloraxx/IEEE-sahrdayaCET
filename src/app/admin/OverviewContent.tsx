import { createPB, createAdminPB, escapeFilterValue } from '@/lib/pb'
import { cookies } from 'next/headers'
import { OverviewClient } from './OverviewClient'
import { getChairScope } from '@/lib/chair-scope'
import { requireAuth } from '@/lib/auth'
import { PB_AUTH_COOKIE, EMPTY_FILTER, MS_PER_DAY, RECENT_WINDOW_DAYS } from '@/lib/constants'
import { toIso } from '@/lib/dates'

export async function OverviewContent() {
  const cookieStore = await cookies()
  const pb = createPB(`${PB_AUTH_COOKIE}=${cookieStore.get(PB_AUTH_COOKIE)?.value}`)

  let userName = ''
  let userRole = ''
  let userId = ''
  try {
    const { user } = await requireAuth(pb)
    userName = user.name || ''
    userRole = user.role || ''
    userId = user.id
  } catch {
    return (
      <OverviewClient
        stats={null}
        upcoming={[]}
        recent={[]}
        dailyRegistrations={[]}
        paymentDistribution={[]}
        userName={''}
        userRole={''}
      />
    )
  }

  const adminPB = createAdminPB()
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  const past7 = new Date(now.getTime() - RECENT_WINDOW_DAYS * MS_PER_DAY)

  try {
    const scope = await getChairScope(adminPB, userId, userRole)
    if (userRole === 'chair' && !scope.hasScope) {
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

    const withScope = (base: string) => (scope.societyFilter ? `(${base}) && (${scope.societyFilter})` : base)

    const count = async (collection: string, filter: string) => {
      const res = await adminPB.collection(collection).getList(1, 1, { filter, fields: 'id' })
      return res.totalItems
    }

    const nowIso = toIso(now)
    const startTodayIso = toIso(startOfToday)
    const endTodayIso = toIso(endOfToday)

    const [
      eventsTotal,
      eventsUpcoming,
      eventsLive,
      regsTotal,
      regsConfirmed,
      regsPending,
      regsToday,
      societiesActive,
      societiesTotal,
    ] = await Promise.all([
      count('events', withScope('') || 'id != ""'),
      count('events', withScope(`date > '${nowIso}' && status = 'published'`)),
      count('events', withScope(`date <= '${nowIso}' && endDate >= '${nowIso}' && status = 'published'`)),
      count('registrations', scope.eventFilter && scope.eventFilter !== EMPTY_FILTER ? scope.eventFilter : 'id != ""'),
      count('registrations', `registrationStatus = 'confirmed'${scope.eventFilter && scope.eventFilter !== EMPTY_FILTER ? ` && (${scope.eventFilter})` : ''}`),
      count('registrations', `registrationStatus = 'pending'${scope.eventFilter && scope.eventFilter !== EMPTY_FILTER ? ` && (${scope.eventFilter})` : ''}`),
      count('registrations', `registrationDate >= '${startTodayIso}' && registrationDate < '${endTodayIso}'${scope.eventFilter && scope.eventFilter !== EMPTY_FILTER ? ` && (${scope.eventFilter})` : ''}`),
      count('societies', 'isHidden = false'),
      count('societies', 'id != ""'),
    ])

    const stats = {
      events: { total: eventsTotal, upcoming: eventsUpcoming, live: eventsLive },
      registrations: { total: regsTotal, confirmed: regsConfirmed, pending: regsPending, today: regsToday },
      societies: { active: societiesActive, total: societiesTotal },
    }

    const upcomingRes = await adminPB.collection('events').getList(1, 5, {
      filter: withScope(`date > '${nowIso}' && status = 'published'`),
      sort: 'date',
      fields: 'id,title,date,venue,maxCapacity,registeredCount',
    })
    const upcoming = upcomingRes.items.map((e: Record<string, unknown>) => ({
      id: e.id as string,
      title: e.title as string,
      date: e.date as string,
      venue: (e.venue as string) || '',
      maxCapacity: Number(e.maxCapacity) || 0,
      registeredCount: Number(e.registeredCount) || 0,
    }))

    const recentRes = await adminPB.collection('registrations').getList(1, 8, {
      filter: scope.eventFilter && scope.eventFilter !== EMPTY_FILTER ? scope.eventFilter : undefined,
      sort: '-registrationDate',
      expand: 'event',
      fields: 'id,userName,userEmail,registrationStatus,paymentStatus,checkedIn,registrationDate,expand.event.id,expand.event.title',
    })
    const recent = recentRes.items.map((r: Record<string, unknown>) => {
      const expand = r.expand as Record<string, unknown> | undefined
      const event = expand?.event as Record<string, unknown> | undefined
      return {
        id: r.id as string,
        userName: (r.userName as string) || 'Unknown',
        userEmail: (r.userEmail as string) || '',
        registrationStatus: (r.registrationStatus as string) || 'pending',
        paymentStatus: (r.paymentStatus as string) || '',
        checkedIn: !!r.checkedIn,
        createdAt: (r.registrationDate as string) || '',
        eventTitle: (event?.title as string) || '',
        eventId: (event?.id as string) || '',
      }
    })

    const chartRes = await adminPB.collection('registrations').getList(1, 500, {
      filter: `registrationDate >= '${toIso(past7)}'${scope.eventFilter && scope.eventFilter !== EMPTY_FILTER ? ` && (${scope.eventFilter})` : ''}`,
      fields: 'registrationDate,paymentStatus',
    })

    const dailyMap: Record<string, number> = {}
    for (let i = RECENT_WINDOW_DAYS - 1; i >= 0; i--) {
      const d = new Date(now)
      d.setDate(d.getDate() - i)
      const key = d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })
      dailyMap[key] = 0
    }
    let paid = 0, pending = 0, notRequired = 0
    for (const r of chartRes.items as unknown as Record<string, unknown>[]) {
      const d = new Date(r.registrationDate as string)
      const key = d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })
      if (key in dailyMap) dailyMap[key]++
      const ps = r.paymentStatus as string
      if (ps === 'paid') paid++
      else if (ps === 'pending') pending++
      else notRequired++
    }
    const dailyRegistrations = Object.entries(dailyMap).map(([date, c]) => ({ date, count: c }))
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
