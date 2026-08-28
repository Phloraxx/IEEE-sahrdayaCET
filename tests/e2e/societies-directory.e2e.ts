import { expect, test } from '@playwright/test'

test.describe('societies directory', () => {
  test('hero is a scroll-directed editorial story with clear corner marks', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/societies', { waitUntil: 'networkidle' })

    await expect(page.getByRole('heading', { level: 1 })).toContainText('Where')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Ideas')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Classroom')
    const story = page.getByTestId('society-editorial-story')
    await expect(story).toBeVisible()
    expect(await story.locator('img').count()).toBeGreaterThanOrEqual(3)
    await expect(story.locator('[data-society-hero-word]')).toHaveCount(0)
    await expect(story.locator('[data-society-hero-strip]')).toHaveCount(0)

    const storyMetrics = await story.evaluate((node) => {
      const rect = node.getBoundingClientRect()
      return { top: rect.top + window.scrollY, height: rect.height, viewport: window.innerHeight }
    })
    await page.evaluate(({ top, height, viewport }) => window.scrollTo(0, top + Math.max(0, height - viewport) * 0.52), storyMetrics)
    await page.waitForTimeout(180)
    const verbsOpacity = Number(await page.getByTestId('society-editorial-verbs').evaluate((node) => getComputedStyle(node).opacity))
    expect(verbsOpacity).toBeGreaterThan(0.3)
    await page.evaluate(({ top, height, viewport }) => window.scrollTo(0, top + Math.max(0, height - viewport) * 0.92), storyMetrics)
    await page.waitForTimeout(180)
    const finalOpacity = Number(await page.getByTestId('society-editorial-final').evaluate((node) => getComputedStyle(node).opacity))
    expect(finalOpacity).toBeGreaterThan(0.5)

    await expect(page.locator('img[alt="IEEE SB Logo"]')).toBeVisible()
    await expect(page.locator('img[alt="Sahrdaya Logo"]')).toBeVisible()

    const liveBg = await page.getByTestId('society-live-activity').evaluate((node) => getComputedStyle(node).backgroundColor)
    const endBg = await page.getByTestId('society-directory-end').evaluate((node) => getComputedStyle(node).backgroundColor)
    expect(endBg).not.toBe(liveBg)
  })

  test('network nodes jump to and focus society entries', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/societies', { waitUntil: 'networkidle' })

    const nodes = page.locator('[data-society-node]')
    expect(await nodes.count()).toBeGreaterThan(3)
    const target = nodes.nth(Math.min(9, (await nodes.count()) - 1))
    const slug = await target.getAttribute('data-society-node')
    await target.click()
    await page.waitForTimeout(900)

    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(300)
    expect(await page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.societyId || '')).not.toBe('')
    await expect(page.getByTestId('society-network')).toContainText((slug || '').toUpperCase())
  })

  test('keyboard view/search controls remain usable', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto('/societies', { waitUntil: 'networkidle' })
    await page.keyboard.press('l')
    await expect(page.getByRole('button', { name: 'List view' })).toHaveAttribute('aria-pressed', 'true')
    const societyName = (await page.locator('[data-society-id] h2').first().innerText()).trim()
    await page.keyboard.press('/')
    await expect(page.locator('#society-search')).toBeFocused()
    await page.keyboard.type(societyName)
    await expect(page.locator('[data-society-id]')).toHaveCount(1)
    await expect(page.locator('[data-society-id] h2')).toHaveText(societyName)
    await page.keyboard.press('Escape')
    await expect(page.locator('#society-search')).toHaveValue('')
  })

  test('mobile stays overflow-free without desktop network chrome', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/societies', { waitUntil: 'networkidle' })
    await expect(page.getByTestId('society-network')).toBeHidden()
    await expect(page.getByTestId('society-editorial-story')).toBeHidden()
    await expect(page.getByTestId('society-editorial-mobile')).toBeVisible()
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Where ideas leave the classroom.')
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  })
})
