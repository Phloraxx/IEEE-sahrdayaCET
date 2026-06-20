# Admin Dashboard — UI Specification for IEEE Sahrdaya Student Branch

> Paste the entire block below into Gemini/V0/Claude Artifacts to generate the new admin dashboard.

---

```
You are a premium UI engineer. Build a single-page admin dashboard for an IEEE student branch event management platform.

## Stack
- Next.js 16 App Router + React 19 + TypeScript
- Tailwind CSS v4
- Framer Motion for animations
- shadcn/ui primitives (Card, Badge, Avatar, Button, Progress)
- Recharts for charts (BarChart, PieChart/Donut, ResponsiveContainer)
- Lucide React for icons
- Dark mode supported via Tailwind `dark:` variants + CSS custom properties

## Design system
- Premium-minimal aesthetic inspired by Linear / Stripe
- Glass cards: `bg-white/80 backdrop-blur-sm border border-border/40 rounded-xl`
- Subtle shadows, micro-interactions, smooth transitions
- Framer Motion: `animate-in fade-in slide-in-from-bottom-1 duration-300` on sections with staggered delays (delay-100, delay-150, delay-200)
- Color palette: ieee-blue (#0066B4), ieee-success (#10B981), ieee-warning (#F59E0B), ieee-light-blue (#3B82F6), ieee-danger (#EF4444)
- Dark mode: bg-gray-950, glass becomes bg-gray-900/80

## Layout
The page is inside an admin layout with a sidebar on the left. The main content area is `max-w-7xl mx-auto px-6 py-8 space-y-8`.

## Sections (in order)

### 1. Greeting + header
- Time-based greeting ("Good morning ☀️", "Working late 🌙") with user's first name
- Today's date formatted: "Monday, 24 March 2025"
- If user role is "chair", show a small badge: rounded-full bg-ieee-blue/10 px-3 py-1 text-xs font-medium text-ieee-blue with a blue dot
- Right side: "Create Event" button (CalendarPlus icon, links to /admin/events/new)

### 2. 🏆 Society Leaderboard (NEW — replaces stat cards)
- Purpose: rank all 14 IEEE societies by event count. For chairs, auto-scope to only their societies (they have 1-3).
- Data per society: rank #, society name, logo (small 32x32 rounded), event count, total registrations across their events, average fill rate %, **check-in rate %, and a tiny sparkline** of their registration activity over time (4 data points per society showing recent trend)
- Top 3 get special treatment: gold/silver/bronze accent or a small medal emoji 🥇🥈🥉
- Display: a clean table-like card with rows, each row is a link to /admin/societies/{id}
- Column headers: #, Society, Events, Registrations, Avg. Fill Rate, Check-in %, Trend
- Sort by event count descending
- Empty state: "No societies yet"
- **Admin-only extra**: a small chip next to each society showing the name of their assigned chair (or "No chair assigned" in red). This lets admins spot orphaned societies instantly.

### 3. 🔴 Action Center — Events Needing Attention (NEW — enhanced)
- A 2-column grid of alert cards, each with an urgency indicator
- Show events where:
  a) **Nearing capacity** ≥ 80% full — red/orange progress bar, "Almost full" badge
  b) **Registration deadline expiring** within 48 hours — clock icon, "Closing soon" badge (amber if <48h, red if <24h)
  c) **Low check-in rate** < 40% of registered attendees checked in — warning triangle, "Low attendance" badge
  d) **Stuck in Draft > 7 days** — calendar-x icon, "Unpublished" badge — the chair created it but never launched it
  e) **Societies with no chair assigned** (admin-only) — user-x icon, "Orphaned society" badge, links to edit society
- Each card: event title, society name, the specific metric with visual indicator, relative time ("Created 9 days ago", "Deadline in 6h"), and a "View" / "Assign" link
- Group by severity: red alerts first, then amber, then info
- If nothing needs attention, show a subtle green success card: "✅ All clear — everything's on track" with a small confetti-ish animation

### 4. 🍩 Registration Pipeline (NEW — replaces "Total Registrations" stat card)
- A donut chart (Recharts PieChart with innerRadius=65 outerRadius=90)
- Three segments: Confirmed (green), Pending (amber), Cancelled (red)
- Center text: total registrations count in large bold font
- Legend below the chart with counts and percentages
- Empty state: "No registrations yet"

### 5. 📊 Stat Cards (condensed to 3 key metrics + 1 more)
Replace the current 4 stat cards with these 4, more meaningful ones:

| Card | Data | Extra |
|------|------|-------|
| **Live Events** | Count of currently-live events | "+X upcoming" subtitle |
| **Registrations Today** | Count of registrations in last 24h | Trend arrow (up/down) + 7-day sparkline SVG |
| **Pending Actions** | Count of pending registrations | "need attention" subtitle |
| **📈 This Week's Growth** | New registrations this week vs last week | Percentage change arrow, e.g. "+24% vs last week". If no prior week data, show just the count. Also show "X new users joined" sub-line. |

Keep the existing StatCard component style: glass card with colored accent bar at top, icon in a rounded box, large number, optional sparkline.

### 6. 📈 7-Day Registration Trend (keep existing)
- Bar chart using Recharts (BarChart with gradient fill)
- X-axis: dates (formatted "Mar 18", "Mar 19", etc.)
- Y-axis: count (hidden)
- Bars: rounded top, gradient fill from primary to primary/30%
- Tooltip on hover showing exact count
- Empty state: "No registration data yet"
- Card title: "Registrations (7 days)" with subtitle "Daily sign-ups over the past week"

### 7. 📈 Check-in Performance (NEW — right column of section 6)
- In a 2-column grid next to the bar chart
- For live/recent events: show each event's registered count, checked-in count, and check-in percentage
- Display: a list of event rows with a progress bar showing check-in %
- Each row: event name, society tag, registered → checked-in count, color-coded progress bar (green ≥75%, amber 50-74%, red <50%)
- If an event has <40% check-in rate, show a small "Investigate" link
- Empty state: "No live events to track"

### 8. 🔔 Event Status Pipeline (NEW)
- A compact horizontal stacked bar showing counts of events in each status
- Statuses: Draft → Published → Live → Completed
- Each segment is proportional to the total, with a label and count
- Colors: gray (#9CA3AF), ieee-blue (#0066B4), ieee-success (#10B981), indigo (#6366F1)
- Below the bar: a small legend with counts and a "View all" link to /admin/events
- If most events (≥60%) are in Draft, show a soft tip: "💡 Tip: Most events are still in draft — remind chairs to publish."
- Empty state: "No events created yet"

### 9. ⏰ Deadline Watch — Next 7 Days (NEW)
- A compact timeline/list of registration deadlines coming up in the next 7 days
- Each entry: event title, society name, deadline date/time, urgency chip ("Due today" in red, "Tomorrow" in amber, "In 3 days" in gray)
- Clickable row linking to /admin/events/{id}
- If no deadlines this week, show: "No deadlines this week" with a relaxed icon
- This ensures nothing slips through the cracks

### 10. 📅 Upcoming Events (keep existing, but enhanced)
- List of next 5 upcoming events
- Each row: event title, date, venue, capacity progress bar with fraction (25/100), and a **mini society tag** (small colored chip showing which society owns it)
- Clickable row linking to /admin/events/{id}
- Card title: "Upcoming Events" with "View all →" link to /admin/events
- Empty state: "No upcoming events"

### 11. 📋 Recent Registrations (keep existing)
- Latest 8 registrations
- Each row: Avatar (initials fallback, bg-ieee-blue/10), user name, email, status Badge (confirmed=default/green, pending=secondary/amber, cancelled=destructive/red), relative time ("2m ago", "3h ago")
- Clickable row linking to /admin/registrations/{id}
- Card title: "Recent Registrations" with "View all →" link to /admin/registrations
- Empty state: "No registrations yet"

### 12. 👥 Chair Activity Monitor (admin-only section, NEW)
- A small card visible ONLY when userRole === "admin"
- Shows a compact table:
  | Chair Name | Assigned Society | Last Event Created | Last Modified | Status |
  |------------|-----------------|-------------------|---------------|--------|
  | John Doe   | Computer Society | "AI Workshop" (Mar 20) | 2 days ago | 🟢 Active |
  | Jane Smith | Aerospace        | —                 | 14 days ago   | 🟡 Idle  |
  | (none)     | Power & Energy   | —                 | —            | 🔴 No chair |
- Color-coded status: Active (<7d since action), Idle (7-30d), Stale (>30d), No chair
- Quick action: "Assign Chair" button next to orphaned societies
- Empty state: "No chair data available"
- Purpose: lets admins see which chairs are engaged and which societies need attention

### 13. 💰 Revenue Snapshot (conditional — only if paid events exist, NEW)
- Only show this card when there is at least one paid event with revenue data
- Three small metrics in a row:
  - **Collected**: total paid amount so far (in INR, formatted ₹XX,XXX)
  - **Pending**: total pending payment amount
  - **Free Events**: count of free events in the system
- A small horizontal stacked bar: Paid (blue) vs Pending (amber) vs Free (gray)
- Compact — 1/3 width card that fits in a row or sits at the bottom
- Empty/hidden state: don't render the card at all if no paid event data exists

### 14. 🗓️ 2-Week Calendar Strip / Timeline (NEW, nice-to-have)
- A compact horizontal scrollable Gantt-like strip of the next 14 days
- Each event is a colored bar positioned by its start/end date, labeled with event title
- Color-coded by society (up to 8 distinct colors, cycling)
- Hover shows event tooltip with full details
- Purpose: visual overview to spot scheduling overlaps (two events on same day/time)
- Empty state: "No events in the next 2 weeks"

## Responsive behavior
- Mobile (single column): stack everything vertically, leaderboard rows simplify (hide check-in % and trend)
- Tablet: 2-column grid where appropriate, 3-column for leaderboard stats
- Desktop: full layout as described
- The 2-week calendar strip collapses to just dates (hide bar labels) on mobile

## Chair vs Admin scoping
When userRole === "chair":
- Leaderboard shows only their societies (1-3), still ranked
- Action Center shows only their events' alerts
- Chair Activity Monitor section is HIDDEN entirely
- Everything else scoped to their events/registrations

When userRole === "admin":
- Everything is global (all 14 societies)
- Chair Activity Monitor is VISIBLE
- Leaderboard shows chair names + "no chair" warnings
- Action Center includes orphaned society alerts

## Empty states
Every section must handle empty data gracefully:
- "No societies yet" / "No registrations yet" / "No upcoming events" — centered text with muted icon
- "All events on track" — green success card for action center when empty
- "No deadlines this week" — relaxed relaxed icon
- "No live events to track" — for check-in section
- "No events in the next 2 weeks" — for calendar strip
- Revenue card: don't render if no paid events

## Animation
- Sections stagger in with `fade-in slide-in-from-bottom-1` using Framer Motion (delay-100 to delay-700)
- Stat numbers count up on mount (optional nice-to-have)
- Bar chart bars animate up on mount
- Donut chart animates with a rotate-in effect
- Action center alert cards pulse gently if red severity
- Hover states: cards lift slightly (translateY(-2px)) with shadow increase
- Leaderboard rows: subtle slide-in stagger per row
```
