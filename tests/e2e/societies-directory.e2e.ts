import { expect, test } from '@playwright/test'

test.describe('societies directory', () => {
  test('hero is a single interactive IEEE identity field with clear corner marks', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/societies', { waitUntil: 'networkidle' })

    await expect(page.getByRole('heading', { level: 1 })).toContainText('IEEE Sahrdaya Societies')
    const hero = page.getByTestId('society-field-hero')
    await expect(hero).toBeVisible()
    await expect(hero.getByRole('img', { name: 'Deconstructed IEEE identity mark' })).toBeVisible()
    await expect(hero.locator('img')).toHaveCount(0)
    await expect(hero.locator('[data-society-hero-word]')).toHaveCount(0)
    await expect(hero.locator('[data-society-hero-strip]')).toHaveCount(0)
    await expect(hero).toContainText('communities · one student branch')

    const coordinates = page.getByTestId('society-field-coordinates')
    const initialCoordinates = await coordinates.innerText()
    const box = await hero.boundingBox()
    expect(box).not.toBeNull()
    if (box) {
      await page.mouse.move(box.x + box.width * 0.82, box.y + box.height * 0.28)
      await expect(coordinates).not.toHaveText(initialCoordinates)
    }

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
    await expect(page.getByTestId('society-field-hero')).toBeHidden()
    await expect(page.getByTestId('society-field-mobile')).toBeVisible()
    await expect(page.getByRole('heading', { level: 1 })).toContainText('IEEE Sahrdaya Societies')
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  })
})
