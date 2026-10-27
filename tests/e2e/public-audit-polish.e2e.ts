import { test, expect } from '@playwright/test';

test('identity-first hero, directory navigation, and skip link are usable', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'IEEE', exact: true, level: 1 })).toBeVisible();
  await expect(page.locator('main').getByRole('heading', { name: 'SAHRDAYA', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Explore events', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Meet our communities', exact: true })).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Primary navigation', exact: true }).getByRole('link', { name: 'EXECOM' })).toHaveAttribute('href', '/full-execom');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-page-content]').first()).toBeFocused();
  await page.goto('/events');
  await expect(page.getByRole('navigation', { name: 'Primary navigation', exact: true }).getByRole('link', { name: 'EVENTS', exact: true })).toHaveAttribute('aria-current', 'page');
});

test('sign-in contains focus and restores it without starting OAuth', async ({ page }) => {
  await page.goto('/events');
  const trigger = page.getByRole('button', { name: 'SIGN IN', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'SIGN IN', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Sign in to register, view tickets and manage your events.')).toBeVisible();
  for (let n = 0; n < 5; n++) {
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate(e => e.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
});

test('archive search survives a reload and leaves show-more state in the URL', async ({ page }) => {
  await page.goto('/events?q=workshop&limit=20');
  const search = page.getByRole('searchbox', { name: 'Search past events' });
  await expect(search).toHaveValue('workshop');
  await search.fill('security');
  await expect(page).toHaveURL(/q=security/);
  expect(new URL(page.url()).searchParams.has('limit')).toBe(false);
  await page.reload();
  await expect(search).toHaveValue('security');
});

test('archive pauses on hover/focus without a visible pause button and keeps unique team contacts', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  const gallery = page.getByRole('region', { name: 'Past events gallery' });
  await expect(gallery.getByRole('button', { name: /archive motion/i })).toHaveCount(0);
  const strip = page.getByTestId('curated-event-strip');
  await gallery.locator('[aria-label="Selected past event photographs"]').focus();
  await expect(strip.locator('img')).toHaveCount(21);
  // Decorative clones stay mounted on focus; the container must never expose a scrollbar.
  const tickerViewport = gallery.locator('[data-testid="curated-format-marquee"]').locator('..');
  await expect.poll(() => tickerViewport.evaluate(el => getComputedStyle(el).overflowX)).toBe('hidden');
  const pausedTransform = await strip.evaluate(element => getComputedStyle(element).transform);
  await page.waitForTimeout(220);
  await expect.poll(() => strip.evaluate(element => getComputedStyle(element).transform)).toBe(pausedTransform);
  await expect.poll(() => gallery.locator('[aria-label="Selected past event photographs"]').evaluate(el => getComputedStyle(el).overflowX)).toBe('hidden');
  await expect(page.locator('#execom a[href="#"]')).toHaveCount(0);
  const names = await page.locator('#execom h3').allTextContents();
  expect(new Set(names).size).toBe(names.length);
});

test('hero identity and live summary share one centered column', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const identity = page.getByTestId('hero-identity');
  const summary = page.getByTestId('hero-summary');
  await expect(identity).toBeVisible();
  await expect(summary).toBeVisible();
  const a = await identity.boundingBox();
  const b = await summary.boundingBox();
  expect(a).not.toBeNull();
  expect(b).not.toBeNull();
  expect(Math.abs((a!.x + a!.width / 2) - (b!.x + b!.width / 2))).toBeLessThan(3);
  expect(b!.y - (a!.y + a!.height)).toBeGreaterThan(20);
  expect(b!.y - (a!.y + a!.height)).toBeLessThan(105);
  const stage = page.locator('main > div').first();
  const stageBox = await stage.boundingBox();
  expect(stageBox).not.toBeNull();
  // On initial load, the identity hero owns the entire visible viewport.
  // The next section must not peek into the first screen at scroll position 0.
  expect(stageBox!.height).toBeGreaterThanOrEqual(900);
  expect(a!.y - stageBox!.y).toBeGreaterThan(100);
  const nextSection = page.locator('#events');
  const nextBox = await nextSection.boundingBox();
  expect(nextBox).not.toBeNull();
  expect(nextBox!.y).toBeGreaterThanOrEqual(899);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  // The decorative mascot belongs to the hero, not the browser viewport.
  const mascot = page.getByTestId('home-mascot');
  await expect(mascot).toBeVisible();
  expect(await mascot.evaluate(el => getComputedStyle(el).position)).toBe('absolute');
  const mascotBox = await mascot.boundingBox();
  expect(mascotBox).not.toBeNull();
  expect(mascotBox!.y + mascotBox!.height).toBeLessThanOrEqual(stageBox!.y + stageBox!.height + 2);
});

for (const width of [320, 390, 768, 1440]) {
  test(`public pages stay inside the viewport at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ['/', '/events', '/societies', '/pricing', '/full-execom', '/contact']) {
      const response = await page.goto(path);
      expect(response?.ok(), path).toBeTruthy();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), path).toBeLessThanOrEqual(1);
    }
  });
}

test('mobile sign-in closes back to the More control', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/events');
  const more = page.getByRole('button', { name: 'Open more navigation' });
  await more.click();
  await page.getByRole('dialog', { name: 'Site navigation' }).getByRole('button', { name: 'Sign in', exact: true }).click();
  const signIn = page.getByRole('dialog', { name: 'SIGN IN', exact: true });
  await expect(signIn).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(signIn).not.toBeVisible();
  await expect(more).toBeFocused();
});
