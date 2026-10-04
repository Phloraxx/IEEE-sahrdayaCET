import { expect, test } from "@playwright/test";

test.describe("Infinia showcase and independent Altair archive", () => {
  test("serves the showcase, distinct editions and native workshop content without JavaScript", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, baseURL: test.info().project.use.baseURL });
    const page = await context.newPage();
    try {
      await page.goto("/infinia");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("INFINIA");
      await expect(page.locator(".infinia-scene-media video")).toHaveCount(0);
      await expect(page.locator(".infinia-video-chapter h2")).toHaveText(["Robot football.", "Taking flight.", "Lantern Fest."]);
      const footer = page.getByRole("contentinfo");
      await expect(footer.getByRole("navigation", { name: "Branch and attendee links" })).toBeVisible();
      await expect(footer.getByRole("link", { name: "Verify a certificate", exact: true })).toHaveAttribute("href", "/verify");
      await expect(footer.getByRole("img", { name: "IEEE Kerala Section", exact: true })).toHaveCount(1);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://ieeesahrdaya.com/infinia");
      await expect(page.locator(".infinia-stat-grid dd")).toHaveText(["400+", "70", "15", "10+"]);
      await expect(page.locator(".infinia-vitals-stats dd")).toHaveText(["724", "270+", "150+", "12"]);
      await expect(page.getByText(/Registrations are separate from Infinia 2.0 attendance/)).toBeVisible();
      const workshop = page.locator(".infinia-workshop-grid article").first();
      await workshop.locator("summary").click();
      await expect(workshop.getByText(/63 attendees reported for this workshop/)).toBeVisible();
      const editions = page.getByRole("navigation", { name: "Infinia editions" });
      await expect(editions.getByRole("link")).toHaveText(["Altair archive", "Infinia 2.02025", "TechX Infinia2024"]);
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
      await page.getByRole("link", { name: "Explore Infinia 2.0", exact: true }).click();
      await expect(page).toHaveURL(/#experience$/);
      await expect(page.getByRole("heading", { name: /Infinia 2.0.*26–28 September.*2025/ })).toBeInViewport();
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

  test("plays sequential scenes, follows scroll and suspends inactive footage", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/infinia");
    const hero = page.locator(".infinia-hero");
    const car = hero.locator(".infinia-hero-panel-car video");
    await expect(car).toHaveCount(1);
    await expect(hero.locator("video")).toHaveCount(3);
    await expect.poll(() => hero.locator("video").evaluateAll(elements => elements.every(element => !(element as HTMLVideoElement).paused))).toBe(true);
    await expect(page.locator(".infinia-video-chapter video")).toHaveCount(0);
    await expect.poll(() => car.evaluate(element => !(element as HTMLVideoElement).paused)).toBe(true);
    expect(await car.evaluate(element => [(element as HTMLVideoElement).videoWidth, (element as HTMLVideoElement).videoHeight])).toEqual([1080, 1920]);
    await expect(hero.getByText("Lanterns · RC cars · Flight / TechX Infinia, 2024", { exact: true })).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 180));
    await expect.poll(() => hero.locator(".infinia-scene-progress span").evaluate(element => new DOMMatrixReadOnly(getComputedStyle(element).transform).a)).toBeGreaterThan(.2);
    expect(await hero.locator(".infinia-hero-stage").evaluate(element => Math.round(element.getBoundingClientRect().top))).toBe(0);
    await hero.getByRole("button", { name: "Pause hero films", exact: true }).click();
    await expect.poll(() => hero.locator("video").evaluateAll(elements => elements.every(element => (element as HTMLVideoElement).paused))).toBe(true);
    await hero.getByRole("link", { name: "See it in motion", exact: true }).click();
    await expect(page).toHaveURL(/#expo-floor$/);
    const robot = page.locator("#expo-floor video");
    await expect.poll(() => robot.evaluate(element => !(element as HTMLVideoElement).paused)).toBe(true);
    expect(await robot.evaluate(element => [(element as HTMLVideoElement).videoWidth, (element as HTMLVideoElement).videoHeight])).toEqual([1920,1080]);
    await expect.poll(() => car.evaluate(element => (element as HTMLVideoElement).paused)).toBe(true);
    await expect(page.locator("#flight-demo video, #lantern-fest video")).toHaveCount(0);
    await page.getByRole("link", { name: "Next: flight demonstration", exact: true }).click();
    const flight = page.locator("#flight-demo video");
    await expect.poll(() => flight.evaluate(element => !(element as HTMLVideoElement).paused)).toBe(true);
    await expect.poll(() => robot.evaluate(element => (element as HTMLVideoElement).paused)).toBe(true);
    await page.getByRole("link", { name: "Next: Lantern Fest", exact: true }).click();
    await expect.poll(() => page.locator("#lantern-fest video").evaluate(element => !(element as HTMLVideoElement).paused)).toBe(true);
    await expect.poll(() => page.locator(".infinia-scene-media video").evaluateAll(elements => elements.filter(element => !(element as HTMLVideoElement).paused).length)).toBe(1);
    await page.evaluate(() => window.scrollTo(0,0));
    await expect(hero.getByRole("button", { name: "Play hero films", exact: true })).toBeVisible();
    await expect.poll(() => car.evaluate(element => (element as HTMLVideoElement).paused)).toBe(true);
    await hero.getByRole("button", { name: "Play hero films", exact: true }).click();
    await expect.poll(() => car.evaluate(element => !(element as HTMLVideoElement).paused)).toBe(true);
    for (const video of await page.locator(".infinia-scene-media video").all()) {
      expect(await video.evaluate(element => (element as HTMLVideoElement).muted && (element as HTMLVideoElement).loop)).toBe(true);
      await expect(video).toHaveAttribute("playsinline", "");
    }
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(page.locator(".infinia-scene-media video")).toHaveCount(0);
    await expect(hero.locator("img").first()).toBeVisible();
    await page.goto("/infinia/2025");
    await expect(page.locator("video, .infinia-video-chapter")).toHaveCount(0);
    await expect(page.locator(".infinia-hero img")).toHaveAttribute("src", /2025/);
  });

  test("pauses on page hiding and handles rejected autoplay with a usable play button", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/infinia");
    const video = page.locator(".infinia-hero-panel-car video");
    await expect.poll(() => video.evaluate(element => !(element as HTMLVideoElement).paused)).toBe(true);
    await page.evaluate(() => { Object.defineProperty(document,"visibilityState",{configurable:true,value:"hidden"}); document.dispatchEvent(new Event("visibilitychange")); });
    await expect.poll(() => page.locator(".infinia-hero video").evaluateAll(elements => elements.every(element => (element as HTMLVideoElement).paused))).toBe(true);
    await page.evaluate(() => { Object.defineProperty(document,"visibilityState",{configurable:true,value:"visible"}); document.dispatchEvent(new Event("visibilitychange")); });
    await expect.poll(() => video.evaluate(element => !(element as HTMLVideoElement).paused)).toBe(true);
    await page.addInitScript(() => { HTMLMediaElement.prototype.play = function() { return Promise.reject(new DOMException("Autoplay declined", "NotAllowedError")); }; });
    await page.reload();
    await expect(page.locator(".infinia-hero video")).toHaveCount(3);
    await expect(page.getByRole("button", {name:"Play hero films",exact:true})).toBeVisible();
    await expect(page.locator(".infinia-hero img").first()).toBeVisible();
    await page.getByRole("link", {name:"Explore Infinia 2.0",exact:true}).click();
    await expect(page).toHaveURL(/#experience$/);
  });

  test("uses one background stream on mobile and no video download in data-saving mode", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "no-preference", baseURL: test.info().project.use.baseURL });
    try {
      const page = await context.newPage();
      await page.goto("/infinia");
      await expect(page.locator(".infinia-hero video")).toHaveCount(1);
      await expect(page.getByRole("button", { name: "Pause hero films", exact: true })).toBeVisible();
      await page.getByRole("link", {name:"See it in motion",exact:true}).click();
      await expect.poll(() => page.locator("#expo-floor video").evaluate(element => !(element as HTMLVideoElement).paused)).toBe(true);
      await expect.poll(() => page.locator(".infinia-scene-media video").evaluateAll(elements => elements.filter(element => !(element as HTMLVideoElement).paused).length)).toBe(1);
      expect(await page.locator("#expo-floor .infinia-scene-stage").evaluate(element => getComputedStyle(element).position)).not.toBe("sticky");
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
      await page.addInitScript(() => Object.defineProperty(navigator, "connection", {
        configurable: true, value: Object.assign(new EventTarget(), { saveData: true, effectiveType: "4g" }),
      }));
      const requests: string[] = [];
      page.on("request", request => { if (/techx-2024-(film-\d|robot-football)\.(webm|mp4)/.test(request.url())) requests.push(request.url()); });
      await page.reload();
      await page.getByRole("button", { name: "Open more navigation", exact: true }).click();
      await expect(page.getByRole("dialog", { name: "Site navigation", exact: true })).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.locator(".infinia-scene-media video")).toHaveCount(0);
      await page.getByRole("link", {name:"See it in motion",exact:true}).click();
      await expect(page.locator("#expo-floor img")).toBeVisible();
      await expect(page.locator(".infinia-scene-media video")).toHaveCount(0);
      expect(requests).toEqual([]);
    } finally { await context.close(); }
  });

  test("retains the photo, story and film link if background playback fails", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.route("**/media/infinia/techx-2024-film-*", route => route.abort());
    await page.goto("/infinia");
    const hero = page.locator(".infinia-hero");
    await expect(page.getByRole("button", { name: "SIGN IN", exact: true })).toBeVisible();
    await expect(hero.locator("video")).toHaveCount(0);
    await expect(hero.locator("img").first()).toBeVisible();
    await expect(hero.getByRole("heading", { level: 1 })).toHaveText("INFINIA");
    await expect(hero.getByRole("link", { name: "Watch the 2024 film", exact: true })).toHaveAttribute("href", "/infinia/2024#film");
    await hero.getByRole("link", { name: "Explore Infinia 2.0", exact: true }).click();
    await expect(page).toHaveURL(/#experience$/);
  });

  test("keeps scene controls reachable on short desktops and visible during tall desktop pins", async ({ page }) => {
    await page.emulateMedia({reducedMotion:"no-preference"});
    for (const height of [740,900]) for (const width of [1440,1760]) {
      await page.setViewportSize({width,height});
      await page.goto("/infinia");
      const stage = page.locator(".infinia-hero-stage");
      await expect(page.getByRole("button",{name:"Pause hero films",exact:true})).toBeVisible();
      expect(await stage.evaluate(element => getComputedStyle(element).position)).toBe(height < 850 ? "relative" : "sticky");
      const caption = page.locator(".infinia-hero-caption");
      if (height < 850) await caption.scrollIntoViewIfNeeded();
      expect(await caption.evaluate(element => element.getBoundingClientRect().bottom)).toBeLessThanOrEqual(height);
      await page.getByRole("link",{name:"See it in motion",exact:true}).click();
      await page.getByRole("link",{name:"Next: flight demonstration",exact:true}).click();
      const controls = page.locator("#flight-demo .infinia-scene-caption");
      if (height < 850) await controls.scrollIntoViewIfNeeded();
      const bounds = await controls.evaluate(element => ({top:element.getBoundingClientRect().top,bottom:element.getBoundingClientRect().bottom}));
      expect(bounds.top).toBeGreaterThanOrEqual(0);
      expect(bounds.bottom).toBeLessThanOrEqual(height);
    }
  });

  test("restores three portrait panels with rainbow type, safe motion and curved controls", async ({page}) => {
    for (const width of [390,1440]) {
      await page.setViewportSize({width,height:900});
      await page.emulateMedia({reducedMotion:"reduce"});
      await page.goto("/infinia");
      const hero=page.locator(".infinia-hero");
      await expect(hero.locator(".infinia-hero-panel")).toHaveCount(3);
      await expect(hero.locator("video")).toHaveCount(0);
      for(const panel of await hero.locator(".infinia-hero-panel").all()) {
        const rect=await panel.boundingBox();
        expect(rect!.height).toBeGreaterThan(rect!.width);
        expect(await panel.locator("img").evaluate(e=>(e as HTMLImageElement).naturalWidth)).toBe(1080);
      }
      const word=hero.locator(".infinia-rainbow-word");
      expect(await word.evaluate(e=>getComputedStyle(e).backgroundImage)).toContain("linear-gradient");
      expect(await word.evaluate(e=>getComputedStyle(e).animationName)).toBe("none");
      expect(parseFloat(await hero.locator(".infinia-hero-enter").evaluate(e=>getComputedStyle(e).borderRadius))).toBeGreaterThan(30);
      for(const selector of ["#expo-floor", "#flight-demo", "#lantern-fest"]) {
        const stage=page.locator(selector+" .infinia-scene-stage");
        const frame=await stage.boundingBox();
        const media=await stage.locator(".infinia-scene-media").boundingBox();
        expect(media!.width).toBeGreaterThanOrEqual(frame!.width-1);
        expect(media!.height).toBeGreaterThanOrEqual(frame!.height-1);
      }
    }
    await page.setViewportSize({width:1440,height:900});
    await page.emulateMedia({reducedMotion:"no-preference"});
    await page.goto("/infinia");
    await expect(page.getByRole("button",{name:"Pause hero films",exact:true})).toBeVisible();
    const car=page.locator(".infinia-hero-panel-car");
    await expect.poll(() => page.locator(".infinia-rainbow-word").evaluate(e=>getComputedStyle(e).animationPlayState)).toBe("running");
    const before=(await car.boundingBox())!.width;
    await page.evaluate(()=>window.scrollTo(0,220));
    await expect.poll(async()=>(await car.boundingBox())!.width).toBeGreaterThan(before*1.5);
    await page.getByRole("button",{name:"Pause hero films",exact:true}).click();
    const stopped=(await car.boundingBox())!.width;
    await page.evaluate(()=>window.scrollTo(0,300));
    expect((await car.boundingBox())!.width).toBeCloseTo(stopped,0);
  });

  test("keeps film metadata readable even over a white video frame", async ({page}) => {
    await page.goto("/infinia");
    const contrast=await page.locator(".infinia-hero-meta a, .infinia-hero-meta>span, .infinia-scene-top>span").evaluateAll(elements=>elements.map(element=>{
      const style=getComputedStyle(element);
      const channels=(color:string)=>(color.match(/[\d.]+/g) ?? []).map(Number);
      const foreground=channels(style.color),background=channels(style.backgroundColor);
      const alpha=background[3] ?? 1;
      const brightest=background.slice(0,3).map(channel=>channel*alpha+255*(1-alpha));
      const luminance=(rgb:number[])=>rgb.map(channel=>channel/255).map(channel=>channel<=.04045?channel/12.92:((channel+.055)/1.055)**2.4).reduce((sum,channel,index)=>sum+channel*[.2126,.7152,.0722][index]!,0);
      const a=luminance(foreground.slice(0,3)),b=luminance(brightest);
      return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
    }));
    expect(contrast).toHaveLength(8);
    for(const ratio of contrast) expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  test("keeps expo overlay content inside the footage and preserves usable controls", async ({page}) => {
    await page.setViewportSize({width:1440,height:900});
    await page.goto("/infinia");
    await page.getByRole("link",{name:"See it in motion",exact:true}).click();
    const chapter = page.locator("#expo-floor");
    await expect(chapter.getByRole("button",{name:"Pause expo floor film",exact:true})).toBeVisible();
    const media = await chapter.locator(".infinia-scene-media").boundingBox();
    const copy = await chapter.locator(".infinia-scene-copy").boundingBox();
    expect(media).not.toBeNull(); expect(copy).not.toBeNull();
    expect(copy!.x).toBeGreaterThanOrEqual(media!.x);
    expect(copy!.x+copy!.width).toBeLessThanOrEqual(media!.x+media!.width);
    expect(copy!.y).toBeGreaterThanOrEqual(media!.y);
    expect(copy!.y+copy!.height).toBeLessThanOrEqual(media!.y+media!.height);
    await chapter.getByRole("button",{name:"Pause expo floor film",exact:true}).click();
    await expect(chapter.getByRole("button",{name:"Play expo floor film",exact:true})).toBeVisible();
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
    const photo = page.getByRole("link", { name: "View The opening ceremony · 2025", exact: true });
    await photo.click();
    await expect(page.getByRole("dialog", { name: "The opening ceremony · 2025", exact: true })).toBeVisible();
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
