import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const OUT = 'tmp/verify'
mkdirSync(OUT, { recursive: true })

const BASE = 'http://localhost:3000'

async function main() {
  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()

  console.log('--- /admin ---')
  await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle', timeout: 30000 })
  await page.waitForTimeout(1500)
  await page.screenshot({ path: join(OUT, '01-dashboard.png'), fullPage: true })

  const heroText = await page.locator('.dash-hero').first().innerText().catch(() => 'NOT FOUND')
  const quickActions = await page.locator('.quick-action').count().catch(() => 0)
  const statCards = await page.locator('.dash-stats .dash-card').count().catch(() => 0)
  const progressBars = await page.locator('.pb').count().catch(() => 0)
  const societyChips = await page.locator('.society-chip').count().catch(() => 0)
  const collectionsWidget = await page.locator('text=Collections').count().catch(() => 0)
  const sidebarTeam = await page.locator('text=Team').count().catch(() => 0)

  console.log('hero text length:', heroText.length)
  console.log('quick action buttons:', quickActions)
  console.log('stat cards in row 2:', statCards)
  console.log('progress bars:', progressBars)
  console.log('society chips:', societyChips)
  console.log('"Collections" widget count:', collectionsWidget, '(should be 0)')
  console.log('sidebar "Team" group visible:', sidebarTeam > 0)

  console.log('--- /admin/collections/events ---')
  await page.goto(`${BASE}/admin/collections/events`, { waitUntil: 'networkidle', timeout: 30000 })
  await page.waitForTimeout(1500)
  await page.screenshot({ path: join(OUT, '02-events-list.png'), fullPage: true })
  const edcCards = await page.locator('.edc-card').count().catch(() => 0)
  console.log('EventDashboardCards on list page:', edcCards)

  console.log('--- /admin/event-dashboard (no id) ---')
  await page.goto(`${BASE}/admin/event-dashboard`, { waitUntil: 'networkidle', timeout: 30000 })
  await page.waitForTimeout(1000)
  await page.screenshot({ path: join(OUT, '03-no-id.png'), fullPage: true })
  const noIdTitle = await page.locator('.evd-empty__title').first().innerText().catch(() => 'NOT FOUND')
  console.log('no-id page title:', noIdTitle)

  console.log('--- /admin/event-dashboard/1 ---')
  await page.goto(`${BASE}/admin/event-dashboard/1`, { waitUntil: 'networkidle', timeout: 30000 })
  await page.waitForTimeout(1500)
  await page.screenshot({ path: join(OUT, '04-event-1.png'), fullPage: true })

  console.log('--- /admin/event-dashboard/99999 (not found) ---')
  await page.goto(`${BASE}/admin/event-dashboard/99999`, { waitUntil: 'networkidle', timeout: 30000 })
  await page.waitForTimeout(1000)
  await page.screenshot({ path: join(OUT, '05-not-found.png'), fullPage: true })
  const nfTitle = await page.locator('.evd-empty__title').first().innerText().catch(() => 'NOT FOUND')
  console.log('not-found page title:', nfTitle)

  await browser.close()
}

main().catch(err => { console.error(err); process.exit(1) })
