import { expect, test } from "@playwright/test";

test.describe("Infinia showcase and independent Altair archive", () => {
  test("serves the showcase, distinct editions and native workshop content without JavaScript", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, baseURL: test.info().project.use.baseURL });
    const page = await context.newPage();
    try {
      await page.goto("/infinia");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("INFINIA");
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://ieeesahrdaya.com/infinia");
      await expect(page.locator(".infinia-stat-grid dd")).toHaveText(["400+", "70", "15", "10+"]);
      await expect(page.locator(".infinia-vitals-stats dd")).toHaveText(["724", "270+", "150+", "12"]);
      await expect(page.getByText(/Registrations are separate from Infinia 2.0 attendance/)).toBeVisible();
      const workshop = page.locator(".infinia-workshop-grid article").first();
      await workshop.locator("summary").click();
      await expect(workshop.getByText(/63 attendees reported for this workshop/)).toBeVisible();
      const editions = page.getByRole("navigation", { name: "Infinia editions" });
      await expect(editions.getByRole("link")).toHaveText(["Infinia 2.02025", "TechX Infinia2024"]);
      await editions.getByRole("link", { name: /TechX Infinia/ }).click();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("TechX Infinia");
      await expect(page.locator(".infinia-track-list h3")).toHaveCount(9);
      await expect(page.locator(".infinia-stat-grid")).toHaveCount(0);
      await expect(page.getByRole("link", { name: "Read the 2024 event recap", exact: true })).toHaveAttribute("href", "/blog/event-recap-techx-infinia-2024-where-imagination-meets-technology");
      await page.getByRole("link", { name: "Altair archive", exact: true }).click();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Altair");
      await expect(page.getByText("2023 programme", { exact: true })).toBeVisible();
      await expect(page.getByText("11–13 November 2022", { exact: true })).toBeVisible();
    } finally { await context.close(); }
  });

  test("includes every flagship edition in a newest-first timeline without JavaScript", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, baseURL: test.info().project.use.baseURL });
    try {
      const page = await context.newPage();
      await page.goto("/infinia");
      await page.getByRole("link", { name: "Step inside", exact: true }).click();
      await expect(page).toHaveURL(/#experience$/);
      await expect(page.getByRole("heading", { name: /The ideas are big/ })).toBeInViewport();
      await page.getByRole("link", { name: "Explore the timeline", exact: true }).click();
      await expect(page).toHaveURL(/#timeline$/);
      const timeline = page.getByRole("region", { name: "Flagship timeline", exact: true });
      await expect(timeline.getByRole("heading", { name: "Flagship timeline", exact: true })).toBeInViewport();
      await expect(timeline.getByRole("link")).toHaveCount(4);
      expect(await page.locator("main > :last-child").getAttribute("id")).toBe("timeline");
      await expect(timeline.getByRole("heading", { level: 3 })).toHaveText(["Infinia 2.0", "TechX Infinia", "Altair 2.0", "Altair"]);
      await expect(timeline.locator(".infinia-timeline-year")).toHaveText(["2025", "2024", "2023", "2022"]);
      await expect(timeline.getByText("Programme archive", { exact: true })).toHaveCount(1);
      for (const [name, href, title] of [
        ["Explore Infinia 2.0 2025", "/infinia/2025", "Infinia 2.0"],
        ["Explore TechX Infinia 2024", "/infinia/2024", "TechX Infinia"],
        ["Explore Altair 2.0 2023", "/flagships/altair/2023", "Altair 2.0"],
        ["Explore Altair 2022", "/flagships/altair/2022", "Altair"],
      ]) {
        await page.goto("/infinia#timeline");
        const link = timeline.getByRole("link", { name: name!, exact: true });
        await expect(link).toHaveAttribute("href", href!);
        await link.click();
        await expect(page).toHaveURL(new RegExp(href + "$"));
        await expect(page.getByRole("heading", { level: 1 })).toHaveText(title!);
        await expect(page.getByRole("region", { name: "Flagship timeline", exact: true })).toHaveCount(0);
      }
    } finally { await context.close(); }
  });

  test("plays a muted filmstrip with working pause, off-screen suspension and motion preferences", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/infinia");
    const hero = page.locator(".infinia-hero");
    const videos = hero.locator("video");
    await expect(videos).toHaveCount(3);
    const centre = videos.nth(1);
    await expect.poll(() => centre.evaluate(element => !(element as HTMLVideoElement).paused)).toBe(true);
    for (const video of await videos.all()) {
      expect(await video.evaluate(element => (element as HTMLVideoElement).muted && (element as HTMLVideoElement).loop)).toBe(true);
      await expect(video).toHaveAttribute("playsinline", "");
    }
    await expect(hero.getByText("In motion · TechX Infinia, 2024", { exact: true })).toBeVisible();
    await hero.getByRole("button", { name: "Pause background film", exact: true }).click();
    await expect.poll(() => videos.evaluateAll(elements => elements.every(element => (element as HTMLVideoElement).paused))).toBe(true);
    await hero.getByRole("link", { name: "Step inside", exact: true }).click();
    await expect(page).toHaveURL(/#experience$/);
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(hero.getByRole("button", { name: "Play background film", exact: true })).toBeVisible();
    await hero.getByRole("button", { name: "Play background film", exact: true }).click();
    await expect.poll(() => centre.evaluate(element => !(element as HTMLVideoElement).paused)).toBe(true);
    await hero.getByRole("link", { name: "Explore the timeline", exact: true }).click();
    await expect.poll(() => videos.evaluateAll(elements => elements.every(element => (element as HTMLVideoElement).paused))).toBe(true);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(videos).toHaveCount(0);
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(hero.locator("img")).toBeVisible();
    await page.goto("/infinia/2025");
    await expect(page.locator(".infinia-hero video")).toHaveCount(0);
    await expect(page.locator(".infinia-hero img")).toHaveAttribute("src", /2025/);
  });

  test("uses one background stream on mobile and no video download in data-saving mode", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "no-preference", baseURL: test.info().project.use.baseURL });
    try {
      const page = await context.newPage();
      await page.goto("/infinia");
      await expect(page.locator(".infinia-hero video")).toHaveCount(1);
      await expect(page.getByRole("button", { name: "Pause background film", exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
      await page.addInitScript(() => Object.defineProperty(navigator, "connection", {
        configurable: true, value: Object.assign(new EventTarget(), { saveData: true, effectiveType: "4g" }),
      }));
      const requests: string[] = [];
      page.on("request", request => { if (/highlights\.(webm|mp4)/.test(request.url())) requests.push(request.url()); });
      await page.reload();
      await page.getByRole("button", { name: "Open more navigation", exact: true }).click();
      await expect(page.getByRole("dialog", { name: "Site navigation", exact: true })).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.locator(".infinia-hero video")).toHaveCount(0);
      await expect(page.locator(".infinia-hero img")).toBeVisible();
      expect(requests).toEqual([]);
    } finally { await context.close(); }
  });

  test("retains the photo, story and film link if background playback fails", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.route("**/media/infinia/techx-2024-highlights.*", route => route.abort());
    await page.goto("/infinia");
    const hero = page.locator(".infinia-hero");
    await expect(page.getByRole("button", { name: "SIGN IN", exact: true })).toBeVisible();
    await expect(hero.locator("video")).toHaveCount(0);
    await expect(hero.locator("img")).toBeVisible();
    await expect(hero.getByRole("heading", { level: 1 })).toHaveText("INFINIA");
    await expect(hero.getByRole("link", { name: "Watch the 2024 film", exact: true })).toHaveAttribute("href", "/infinia/2024#film");
    await hero.getByRole("link", { name: "Step inside", exact: true }).click();
    await expect(page).toHaveURL(/#experience$/);
  });

  test("preserves legacy links with permanent redirects and rejects unknown editions", async ({ request }) => {
    for (const [from, to] of [
      ["/flagships", "/infinia"],
      ["/flagships/infinia", "/infinia"],
      ["/flagships/infinia/2025", "/infinia/2025"],
      ["/flagships/infinia/2024", "/infinia/2024"],
    ]) {
      const response = await request.get(from!, { maxRedirects: 0 });
      expect(response.status()).toBe(301);
      expect(response.headers().location).toBe(to);
    }
    for (const path of ["/infinia/2099", "/flagships/unknown", "/flagships/infinia/2099", "/flagships/altair/2025"])
      expect((await request.get(path)).status()).toBe(404);
  });

  test("keeps canonical metadata and media tied to each edition", async ({ page }) => {
    for (const [path, title, year] of [
      ["/infinia/2025", "Infinia 2.0", "2025"],
      ["/infinia/2024", "TechX Infinia", "2024"],
      ["/flagships/altair/2023", "Altair 2.0", "2023"],
      ["/flagships/altair/2022", "Altair", "2022"],
    ]) {
      await page.goto(path!);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(title!);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://ieeesahrdaya.com" + path);
      await expect(page.locator('meta[property="og:url"]')).toHaveAttribute("content", "https://ieeesahrdaya.com" + path);
      await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", new RegExp("-" + year + "-"));
      // Infinia's explicitly labelled next-edition card is separate from this chapter's gallery.
      const images = await page.locator(path!.startsWith("/infinia") ? ".infinia-photo-grid img" : "main img").evaluateAll(elements => elements.map(element => element.getAttribute("src")));
      for (const src of images) expect(src).toContain(year!);
      if (year === "2023") await expect(page.getByText(/announced in the Altair 2.0 brochure/)).toBeVisible();
    }
  });

  test("opens full posters and returns keyboard focus when dismissed", async ({ page }) => {
    await page.goto("/infinia/2025");
    await expect(page.getByRole("button", { name: "SIGN IN", exact: true })).toBeVisible();
    const trigger = page.getByRole("link", { name: "View AEGIS · Agentic AI", exact: true });
    await trigger.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "AEGIS · Agentic AI", exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator("img")).toHaveAttribute("src", "/media/infinia/2025-aegis-poster.webp");
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    const photo = page.getByRole("link", { name: "View Opening a shared conversation · 2025", exact: true });
    await photo.click();
    await expect(page.getByRole("dialog", { name: "Opening a shared conversation · 2025", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Close image", exact: true }).click();
    await expect(photo).toBeFocused();
  });

  test("keeps the 2024 film user-initiated and playable with a text alternative", async ({ page, request }) => {
    await page.goto("/infinia/2024#film");
    const video = page.locator("#film video");
    await expect(video).toHaveAttribute("preload", "none");
    await expect(video).not.toHaveAttribute("autoplay");
    await expect(video.locator("track")).toHaveAttribute("src", "/media/infinia/techx-2024-highlights.vtt");
    await page.getByText("Read the visual description", { exact: true }).click();
    await expect(page.getByText(/The film opens on expo tables/)).toBeVisible();
    await video.evaluate(element => (element as HTMLVideoElement).play());
    await expect.poll(() => video.evaluate(element => (element as HTMLVideoElement).currentTime)).toBeGreaterThan(0);
    await video.evaluate(element => (element as HTMLVideoElement).pause());
    const range = await request.get("/media/infinia/techx-2024-highlights.mp4", { headers: { Range: "bytes=0-99" } });
    expect(range.status()).toBe(206);
    await page.goto("/infinia/2025");
    await expect(page.locator("video")).toHaveCount(0);
  });

  for (const width of [320, 390, 768, 1440]) {
    test(`keeps Infinia and Altair readable at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      for (const path of ["/infinia", "/infinia/2025", "/infinia/2024", "/flagships/altair", "/flagships/altair/2022", "/flagships/altair/2023"]) {
        await page.goto(path);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
        for (const image of await page.locator("main img").all()) {
          await image.scrollIntoViewIfNeeded();
          await expect.poll(() => image.evaluate(element => (element as HTMLImageElement).complete && (element as HTMLImageElement).naturalWidth > 0)).toBe(true);
        }
        const heights = await page.locator("main a, main button, main summary").evaluateAll(elements => elements.map(element => element.getBoundingClientRect().height));
        expect(heights.every(height => height >= 44)).toBe(true);
      }
    });
  }

  test("shows rainbow Infinia in shared navigation with reduced-motion support", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/infinia/2025");
    const link = page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: "INFINIA", exact: true });
    await expect(link).toHaveAttribute("href", "/infinia");
    await expect(link).toHaveAttribute("aria-current", "page");
    // Hydration may replace the SSR navbar between locator resolution and evaluation.
    // Poll the live node so a detached SSR span cannot produce an empty style.
    await expect.poll(() => link.locator("span").evaluate(element => getComputedStyle(element).animationName)).toBe("none");
    await page.goto("/");
    const shared = page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: "INFINIA", exact: true });
    await expect.poll(() => shared.locator("span").evaluate(element => getComputedStyle(element).backgroundImage)).toContain("linear-gradient");
    await expect(page.getByRole("link", { name: "FLAGSHIPS", exact: true })).toHaveCount(0);
  });

  test("keeps mobile More navigation and focus behavior on the new edition routes", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/infinia/2024");
    await page.getByRole("button", { name: "Open more navigation" }).click();
    const sheet = page.getByRole("dialog", { name: "Site navigation" });
    await expect(sheet.getByRole("link", { name: /INFINIA/ })).toHaveAttribute("aria-current", "page");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Open more navigation" })).toBeFocused();
    await page.getByRole("button", { name: "Open more navigation" }).click();
    await sheet.getByRole("link", { name: /INFINIA/ }).click();
    await expect(page).toHaveURL(/\/infinia$/);
    await expect(sheet).toHaveCount(0);
    await expect(page.getByText("Two identities. A shared spirit.", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Explore all events", exact: true })).toHaveCount(0);
  });
});
