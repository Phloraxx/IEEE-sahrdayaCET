import { expect, test } from '@playwright/test'

test.describe('blog journal', () => {
  test('index opens directly into a lead story and real archive', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/blog', { waitUntil: 'networkidle' })

    await expect(page.getByTestId('blog-journal-masthead')).toBeVisible()
    await expect(page.getByRole('heading', { level: 1 })).toContainText('IEEE Sahrdaya / Blog')
    await expect(page.getByTestId('blog-lead-story')).toBeVisible()
    const rows = page.locator('[data-blog-archive-row]')
    expect(await rows.count()).toBeGreaterThan(0)
    await expect(page.getByText('THE BLOG', { exact: true })).toHaveCount(0)
  })

  test('archive search and article reading system remain usable', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto('/blog', { waitUntil: 'networkidle' })
    const firstRow = page.locator('[data-blog-archive-row]').first()
    const title = (await firstRow.locator('h3').innerText()).trim()
    await page.getByPlaceholder('Search stories…').fill(title)
    await expect(page.locator('[data-blog-archive-row]')).toHaveCount(1)
    const href = await page.locator('[data-blog-archive-row] a').first().getAttribute('href')
    expect(href).toMatch(/^\/blog\//)
    await page.goto(href || '/blog', { waitUntil: 'networkidle' })
    await expect(page.getByTestId('blog-article-header')).toBeVisible()
    await expect(page.locator('.prose-blog')).toBeVisible()
  })

  test('mobile index and article stay overflow-free', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/blog', { waitUntil: 'networkidle' })
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
    const href = await page.locator('[data-blog-archive-row] a').first().getAttribute('href')
    await page.goto(href || '/blog', { waitUntil: 'networkidle' })
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  })
})
