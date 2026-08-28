import { expect, test } from '@playwright/test'

test.describe('societies directory', () => {
  test('hero is a cinematic one-society gallery with clear corner marks', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/societies', { waitUntil: 'networkidle' })

    await expect(page.getByRole('heading', { level: 1 })).toContainText('13 communities.')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('One student branch.')
    const hero = page.getByTestId('society-hero-gallery')
    await expect(hero).toBeVisible()
    const initialSlug = await hero.getAttribute('data-society-hero-active')
    expect(initialSlug).toBeTruthy()
    await expect(page.getByTestId('society-hero-detail-name')).toBeVisible()
    await expect(page.getByTestId('society-hero-previous')).toBeVisible()
    await expect(page.getByTestId('society-hero-next')).toBeVisible()

    await page.getByTestId('society-hero-next').click()
    await expect(hero).not.toHaveAttribute('data-society-hero-active', initialSlug || '')
    const nextSlug = await hero.getAttribute('data-society-hero-active')
    await hero.focus()
    await page.keyboard.press('ArrowLeft')
    await expect(hero).toHaveAttribute('data-society-hero-active', initialSlug || '')
    expect(nextSlug).not.toBe(initialSlug)

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
    await expect(page.getByTestId('society-hero-gallery')).toBeHidden()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  })
})
