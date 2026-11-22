import { useEffect, useRef, type RefObject } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

/* The wordmark, built from the typeface's own pixels.

   Press Start 2P is drawn on an 8×8 grid with two-unit strokes, so one glyph
   pixel is exactly fontSize / 8. Rather than guessing where that grid starts on
   a rasterised canvas, each glyph's 8×8 pattern is read once at font-size 8 -
   where one design pixel is one device pixel and the grid cannot drift - and
   then stamped out at the size the heading actually renders.

   That lets the mark assemble itself on load, step aside under the cursor and
   come apart as the programme arrives, none of which is possible with a text
   node. The headings stay in the DOM and in the accessibility tree at all
   times: the cell layer is aria-hidden decoration drawn over them, and the text
   is only faded out once the cells exist. Under prefers-reduced-motion the
   layer is never built and the plain wordmark stays exactly as it is today. */

const PIXEL_FONT = '"Press Start 2P"';
const ACCENT_RATIO = 0;

type Pattern = { cells: { col: number; row: number }[]; advance: number };
type Cell = { x: number; y: number; size: number; color: string };
type CellNode = { el: HTMLElement; x: number; y: number; size: number };

const patterns = new Map<string, Pattern | null>();

/** Read one glyph's pattern on the font's own 8×8 grid. */
function glyphPattern(char: string): Pattern | null {
  const cached = patterns.get(char);
  if (cached !== undefined) return cached;

  /* drawn at 64px so each design pixel is an 8px block: testing the centre of
     that block is immune to the antialiasing an 8px raster would carry */
  const size = 64;
  const cell = size / 8;
  const margin = cell * 2;
  const canvas = document.createElement("canvas");
  canvas.width = size + margin * 2;
  canvas.height = size + margin * 2;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;

  ctx.font = `400 ${size}px ${PIXEL_FONT}`;
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#000";
  const metrics = ctx.measureText(char);
  const ascent = metrics.fontBoundingBoxAscent;
  const originX = margin;
  const baseline = margin + ascent;
  ctx.fillText(char, originX, baseline);

  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const cells: { col: number; row: number }[] = [];
  for (let row = -1; row <= 8; row++) {
    for (let col = -1; col <= 8; col++) {
      const x = Math.round(originX + col * cell + cell / 2);
      const y = Math.round(baseline - ascent + row * cell + cell / 2);
      if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) continue;
      if ((data[(y * canvas.width + x) * 4 + 3] ?? 0) > 110) cells.push({ col, row });
    }
  }

  const pattern = { cells, advance: metrics.width / cell }; // advance in design pixels
  patterns.set(char, pattern);
  return pattern;
}

export function PixelWordmark({
  reduceMotion,
  ieeeRef,
  branchRef,
  layerRef,
  wrapRef,
}: {
  reduceMotion: boolean;
  ieeeRef: RefObject<HTMLHeadingElement | null>;
  branchRef: RefObject<HTMLHeadingElement | null>;
  layerRef: RefObject<HTMLDivElement | null>;
  wrapRef: RefObject<HTMLDivElement | null>;
}) {
  const cellsRef = useRef<CellNode[]>([]);

  useEffect(() => {
    const wrap = wrapRef.current;
    const layer = layerRef.current;
    const ieee = ieeeRef.current;
    const branch = branchRef.current;
    if (!wrap || !layer || !ieee || !branch) return;
    if (reduceMotion) return;

    let disposed = false;
    let raf = 0;
    let rebuildTimer: ReturnType<typeof setTimeout> | undefined;
    let pointer = { x: -9999, y: -9999 };
    let entrance: gsap.core.Timeline | null = null;
    let scatter: gsap.core.Timeline | null = null;

    gsap.registerPlugin(ScrollTrigger);

    const lines = [
      { el: ieee, text: "IEEE", color: "#00629B", accent: "#3F97C6" },
      { el: branch, text: "SAHRDAYA", color: "#1E293B", accent: "#00629B" },
    ];

    const build = (animate: boolean) => {
      const wrapRect = wrap.getBoundingClientRect();
      if (wrapRect.width < 40 || wrapRect.height < 20) return;

      const cells: Cell[] = [];
      /* the layer usually sits on a fractional page offset. Cell coordinates are
         rounded in *screen* space and converted back, so every cell lands on
         whole pixels and adjacent cells meet without an antialiased hairline. */
      const toLayerX = (v: number) => Math.round(wrapRect.left + v) - wrapRect.left;
      const toLayerY = (v: number) => Math.round(wrapRect.top + v) - wrapRect.top;
      for (const line of lines) {
        const style = getComputedStyle(line.el);
        const fontSize = parseFloat(style.fontSize);
        const lineHeight =
          style.lineHeight === "normal" ? fontSize * 1.2 : parseFloat(style.lineHeight);
        const tracking = style.letterSpacing === "normal" ? 0 : parseFloat(style.letterSpacing);
        const rect = line.el.getBoundingClientRect();
        const size = fontSize / 8;

        const patternsForLine = [...line.text].map((char) => glyphPattern(char));
        /* pattern advances are in design pixels (8 per em); convert to display px */
        const advanceOf = (p: Pattern | null) => (p?.advance ?? 8) * (fontSize / 8);
        const advance = patternsForLine.reduce((sum, p) => sum + advanceOf(p), 0);
        const total = advance + tracking * line.text.length;
        const originX = rect.left - wrapRect.left + (rect.width - total) / 2;
        /* the em box is centred in the line box; Press Start 2P fills it exactly */
        const originY = rect.top - wrapRect.top + (lineHeight - fontSize) / 2;

        let penX = originX;
        patternsForLine.forEach((pattern) => {
          if (!pattern) {
            penX += fontSize + tracking;
            return;
          }
          for (const { col, row } of pattern.cells) {
            cells.push({
              x: toLayerX(penX + col * size),
              y: toLayerY(originY + row * size),
              size,
              color: Math.random() < ACCENT_RATIO ? line.accent : line.color,
            });
          }
          penX += advanceOf(pattern) + tracking;
        });
      }

      if (disposed || cells.length === 0) return;

      entrance?.kill();
      scatter?.scrollTrigger?.kill();
      scatter?.kill();
      cellsRef.current.forEach(({ el }) => el.remove());
      cellsRef.current = cells.map((cell) => {
        const el = document.createElement("i");
        el.style.position = "absolute";
        el.style.left = `${cell.x}px`;
        el.style.top = `${cell.y}px`;
        /* half-pixel overlap: the layer can sit on a fractional page offset and
           without it every cell edge shows as a hairline seam */
        el.style.width = `${cell.size + 0.5}px`;
        el.style.height = `${cell.size + 0.5}px`;
        el.style.background = cell.color;
        el.style.pointerEvents = "none";
        layer.appendChild(el);
        return { el, x: cell.x, y: cell.y, size: cell.size };
      });
      const nodes = cellsRef.current.map(({ el }) => el);

      if (animate) {
        /* the plain wordmark dissolves into the cells as they arrive, so the
           hero is never an empty box waiting for an animation */
        entrance = gsap.timeline({ delay: 0.04 });
        entrance
          .to([ieee, branch], { opacity: 0, duration: 0.22, ease: "power1.out" }, 0)
          .from(nodes, {
            x: () => gsap.utils.random(-150, 150),
            y: () => gsap.utils.random(-120, 120),
            rotate: () => gsap.utils.random(-90, 90),
            scale: 0.55,
            opacity: 0.15,
            duration: 0.9,
            ease: "expo.out",
            stagger: { each: 0.0028, from: "random" },
          }, 0)
          /* drop the per-cell transform once settled: a transformed element is
             its own compositing layer, and 340 of them show a hairline at every
             row boundary. Plain backgrounds tile exactly. */
          .set(nodes, { clearProps: "transform" });
      } else {
        gsap.set([ieee, branch], { opacity: 0 });
      }

      /* the mark comes apart while the programme sheet rises over the hero.
         The sheet itself is the trigger, so the scrub stays locked to the
         covering motion instead of to a scroll offset that can drift. */
      const handoff = document.querySelector("[data-hero-handoff]");
      const heroSection = wrap.closest("section");

      if (handoff) {
        /* The sheet's edge runs from the tagline (63% of the viewport) up past
           the top of the wordmark (30%) across this one scrub. The mark falls
           slightly ahead of the edge, bottom line first, so it reads as the
           hero giving way to the section rather than being sliced by it. */
        scatter = gsap.timeline({
          scrollTrigger: {
            trigger: handoff,
            start: "top 63%",
            end: "top 30%",
            scrub: 0.3,
          },
        });
      } else {
        scatter = gsap.timeline({
          paused: true,
          scrollTrigger: heroSection
            ? {
                trigger: heroSection,
                start: "bottom 62%",
                toggleActions: "play none none reverse",
              }
            : undefined,
        });
      }
      scatter.to(nodes, {
        x: () => gsap.utils.random(-30, 30),
        y: () => gsap.utils.random(70, 200),
        rotate: () => gsap.utils.random(-16, 16),
        opacity: 0,
        ease: "power1.in",
        duration: 0.5,
        stagger: { amount: 0.4, from: "end" },
      });
    };

    const start = async () => {
      try {
        await document.fonts.load(`400 64px ${PIXEL_FONT}`);
        await document.fonts.ready;
      } catch {
        /* if the face never loads, leave the plain wordmark alone */
      }
      if (disposed) return;
      build(true);
      ScrollTrigger.refresh();
    };
    void start();

    /* cursor: cells step aside, nothing else changes */
    const repel = () => {
      raf = 0;
      const cells = cellsRef.current;
      if (cells.length === 0) return;
      const layerRect = layer.getBoundingClientRect();
      const radius = 84;
      /* geometry comes from the cached build, never from the DOM: reading
         offsetWidth per cell here would force a reflow 340 times per move */
      for (const cell of cells) {
        const cx = layerRect.left + cell.x + cell.size / 2;
        const cy = layerRect.top + cell.y + cell.size / 2;
        const dx = cx - pointer.x;
        const dy = cy - pointer.y;
        const distance = Math.hypot(dx, dy);
        if (distance < radius && distance > 0.01) {
          const push = (1 - distance / radius) ** 2 * 9;
          cell.el.style.transform = `translate3d(${((dx / distance) * push).toFixed(2)}px, ${((dy / distance) * push).toFixed(2)}px, 0)`;
        } else if (cell.el.style.transform) {
          cell.el.style.transform = "";
        }
      }
    };
    const onMove = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      pointer = { x: event.clientX, y: event.clientY };
      if (!raf) raf = requestAnimationFrame(repel);
    };
    const onLeave = () => {
      pointer = { x: -9999, y: -9999 };
      if (!raf) raf = requestAnimationFrame(repel);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerleave", onLeave);

    const onResize = () => {
      clearTimeout(rebuildTimer);
      rebuildTimer = setTimeout(() => build(false), 180);
    };
    window.addEventListener("resize", onResize);

    return () => {
      disposed = true;
      clearTimeout(rebuildTimer);
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("resize", onResize);
      entrance?.kill();
      scatter?.scrollTrigger?.kill();
      scatter?.kill();
      cellsRef.current.forEach(({ el }) => el.remove());
      cellsRef.current = [];
      layer.replaceChildren();
      gsap.set([ieee, branch], { clearProps: "opacity" });
    };
  }, [reduceMotion, wrapRef, ieeeRef, branchRef, layerRef]);

  return null;
}
