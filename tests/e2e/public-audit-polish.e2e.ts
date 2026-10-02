import { test, expect } from '@playwright/test';

test('hero actions, directory navigation, and skip link are usable', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Explore events', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Meet our communities', exact: true })).toBeVisible();
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

test('archive pauses into one accessible set and team contacts have no placeholders', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  const pause = page.getByRole('button', { name: 'Pause archive motion' });
  await pause.click();
  await expect(page.getByRole('button', { name: 'Resume archive motion' })).toHaveAttribute('aria-pressed', 'true');
  const strip = page.getByTestId('curated-event-strip');
  await expect(strip.locator('img')).toHaveCount(7);
  await expect.poll(() => strip.evaluate(e => getComputedStyle(e).transform)).toBe('none');
  await expect(page.locator('#execom a[href="#"]')).toHaveCount(0);
  const names = await page.locator('#execom h3').allTextContents();
  expect(new Set(names).size).toBe(names.length);
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
