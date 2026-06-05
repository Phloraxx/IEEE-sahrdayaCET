import { chromium } from '@playwright/test'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })

const errors: string[] = []
const failedRequests: string[] = []
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message))
page.on('console', msg => { if (msg.type() === 'error') errors.push('CONSOLE: ' + msg.text()) })
page.on('requestfailed', req => failedRequests.push(`FAILED: ${req.url()} - ${req.failure()?.errorText}`))
page.on('response', resp => { if (resp.status() >= 400) failedRequests.push(`${resp.status()}: ${resp.url()}`) })

await page.goto('http://localhost:3000/societies', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(8000)

const csTile = page.locator('text=Computer Society').first()
await csTile.click()
await page.waitForTimeout(15000)

const eventBanners = await page.locator('img[src*="i.ibb.co"], img[src*="backend.mulearnscet"], img[src*="backend.ieeesahrdaya"]').count()
const eventCards = await page.locator('img[src*="/api/media/file/event"]').count()
const allImages = await page.locator('img').count()
const societyLogos = await page.locator('img[src*="/api/media/file/"]:not([src*="event"])').count()

console.log('--- ERRORS ---')
for (const e of errors) console.log(e)
console.log('--- FAILED REQUESTS ---')
for (const r of failedRequests) console.log(r)
console.log(`event banners (external CDN): ${eventBanners}`)
console.log(`event cards (local): ${eventCards}`)
console.log(`society/member logos: ${societyLogos}`)
console.log(`total images: ${allImages}`)

const memberImgs = await page.locator('img').evaluateAll(els =>
  els.map(el => ({ src: (el as HTMLImageElement).src, alt: el.alt }))
)

const membersWithImg = memberImgs.filter(i => i.src.includes('media/file') && !i.src.includes('Ieee.svg'))
console.log('member/event images found:', membersWithImg.length)
for (const i of membersWithImg) console.log('  ', i.alt, '→', i.src.slice(-50))

await page.screenshot({ path: 'society-cs.png', fullPage: false })
await browser.close()
