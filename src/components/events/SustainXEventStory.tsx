import { useEffect, useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
} from "framer-motion";
import {
  ArrowLeft,
  ArrowUpRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Leaf,
  MapPin,
  Maximize2,
  Trophy,
  Users,
  X,
} from "lucide-react";
import { createPortal } from "react-dom";
import { Link } from "react-router";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import type { SerializableEvent } from "@/server/public/events.server";
import "@/styles/events.css";

type Props = {
  event: SerializableEvent;
  canonicalUrl: string;
  schemaJson: string;
};

const phases = [
  {
    number: "01",
    verb: "Identify",
    title: "Start with the street, not the solution.",
    body: "Students identified a real sustainability problem in their locality and documented it with photographic evidence.",
  },
  {
    number: "02",
    verb: "Innovate",
    title: "Turn observations into something buildable.",
    body: "Shortlisted teams moved through a campus bootcamp, technical mentorship and structured solution development.",
  },
  {
    number: "03",
    verb: "Present",
    title: "Put the idea in front of people who can challenge it.",
    body: "Teams pitched their proposed solutions to an IEEE and faculty panel, where the ideas were formally evaluated.",
  },
] as const;

const challengeThemes = [
  "Urban water & pollution",
  "Accessible menstrual care",
  "Climate-resilient housing",
  "Food waste",
  "Urban heat",
  "Roadside waste",
  "Safer mobility",
  "Air quality",
  "Energy visibility",
  "Flooding & drainage",
  "Smart waste systems",
  "Human-wildlife conflict",
] as const;

const winners = [
  {
    place: "01",
    team: "HYDRO",
    title: "Integrated oil–solid waste management",
    body: "A low-cost canal and coastal-water treatment concept combining floating-debris segregation with reusable hair-based oil sorption.",
  },
  {
    place: "02",
    team: "ZERO POINT2",
    title: "Accessible sustainable menstrual care",
    body: "A practical campus-focused response to affordability and access barriers around sustainable menstrual products.",
  },
  {
    place: "03",
    team: "UNEMPLOYED",
    title: "Vernacular intelligence for resilient communities",
    body: "A climate-resilience platform translating Kerala’s traditional architectural knowledge and local hazard data into practical housing recommendations.",
  },
] as const;

const teams = [
  "HYDRO",
  "ZERO POINT2",
  "UNEMPLOYED",
  "URBANOVA",
  "WATTWISE",
  "COMMUTEMATE",
  "BEYOND THE BIN",
  "TEAM FOSS",
  "TITAN",
  "VOIE SÛRE",
  "X-FACTOR",
  "TEAM WASTED",
  "TEAM Z",
  "NIK",
] as const;

const criteria = [
  ["Sustainability & community impact", "30"],
  ["Innovation", "20"],
  ["Technical feasibility", "20"],
  ["Cost effectiveness", "15"],
  ["Presentation clarity", "15"],
] as const;

const galleryPhotos = [
  {
    src: "/media/sustainx/sustainx-01.webp",
    alt: "Opening remarks at the SustainX event",
    eyebrow: "Opening",
    caption: "The room settles in before the challenge moves from brief to pitch.",
  },
  {
    src: "/media/sustainx/sustainx-02.webp",
    alt: "Students seated in the SustainX audience",
    eyebrow: "The room",
    caption: "Teams, classmates and the people waiting to hear what each idea can do.",
  },
  {
    src: "/media/sustainx/sustainx-03.webp",
    alt: "Student team presenting a sustainability idea",
    eyebrow: "Pitch / 01",
    caption: "A local problem becomes a proposition in front of the room.",
  },
  {
    src: "/media/sustainx/sustainx-04.webp",
    alt: "Student team presenting an energy project",
    eyebrow: "Pitch / 02",
    caption: "Concepts are explained, challenged and made more concrete in public.",
  },
  {
    src: "/media/sustainx/sustainx-05.webp",
    alt: "Student presenter pointing to a project slide",
    eyebrow: "Explain",
    caption: "The strongest moments are often the simplest: point, explain, defend.",
  },
  {
    src: "/media/sustainx/sustainx-06.webp",
    alt: "Student participant speaking with a microphone and laptop",
    eyebrow: "Between pitches",
    caption: "Not every exchange happens on stage; the event lives in the room too.",
  },
  {
    src: "/media/sustainx/sustainx-07.webp",
    alt: "A SustainX team standing together during a presentation",
    eyebrow: "Together",
    caption: "Teams close the loop by putting the work in front of people.",
  },
] as const;

const marqueeWords = ["OBSERVE", "BUILD", "TEST", "PITCH", "RETHINK", "SUSTAIN"] as const;

function Reveal({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const reduceMotion = Boolean(useReducedMotion());
  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0.72, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.16 }}
      transition={{ duration: reduceMotion ? 0 : 0.62, ease: [0.16, 1, 0.3, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function MaskedHeading({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const reduceMotion = Boolean(useReducedMotion());
  return (
    <div className="overflow-hidden pb-[0.08em]">
      <motion.div
        initial={reduceMotion ? false : { y: 22, opacity: 0.78 }}
        whileInView={{ y: 0, opacity: 1 }}
        viewport={{ once: true, amount: 0.35 }}
        transition={{ duration: reduceMotion ? 0 : 0.78, ease: [0.16, 1, 0.3, 1] }}
        className={className}
      >
        {children}
      </motion.div>
    </div>
  );
}

function HeroPanel({
  children,
  className,
  delay,
}: {
  children: React.ReactNode;
  className: string;
  delay: number;
}) {
  const reduceMotion = Boolean(useReducedMotion());
  return (
    <motion.div
      initial={reduceMotion ? false : { clipPath: "inset(100% 0 0 0)" }}
      animate={{ clipPath: "inset(0% 0 0 0)" }}
      transition={{ duration: reduceMotion ? 0 : 1.05, delay: reduceMotion ? 0 : delay, ease: [0.16, 1, 0.3, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function EventGallery() {
  const reduceMotion = Boolean(useReducedMotion());
  const [selected, setSelected] = useState<number | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const isOpen = selected !== null;

  const openPhoto = (index: number, trigger: HTMLButtonElement) => {
    triggerRef.current = trigger;
    setSelected(index);
  };

  const closePhoto = () => setSelected(null);
  const showPrevious = () => setSelected((current) => (current === null ? null : (current - 1 + galleryPhotos.length) % galleryPhotos.length));
  const showNext = () => setSelected((current) => (current === null ? null : (current + 1) % galleryPhotos.length));

  useEffect(() => {
    if (!isOpen) return;

    const scrollY = window.scrollY;
    const body = document.body;
    const root = document.documentElement;
    const previousBody = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      overflowY: body.style.overflowY,
      paddingRight: body.style.paddingRight,
    };
    const previousRootOverflow = root.style.overflow;
    const scrollbarWidth = Math.max(0, window.innerWidth - root.clientWidth);

    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    body.style.overflowY = "scroll";
    if (scrollbarWidth > 0) body.style.paddingRight = `${scrollbarWidth}px`;
    root.style.overflow = "hidden";

    const dialog = dialogRef.current;
    const inerted: Array<{ element: HTMLElement; value: boolean }> = [];
    if (dialog) {
      for (const child of Array.from(body.children)) {
        if (!(child instanceof HTMLElement) || child === dialog || child.contains(dialog)) continue;
        inerted.push({ element: child, value: child.inert });
        child.inert = true;
      }
    }

    const focusDialog = window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closePhoto();
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        showPrevious();
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        showNext();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;

      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.getClientRects().length > 0);
      if (focusable.length === 0) return;

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = document.activeElement;
      if (!dialogRef.current.contains(active)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(focusDialog);
      document.removeEventListener("keydown", onKeyDown);
      inerted.forEach(({ element, value }) => { element.inert = value; });
      root.style.overflow = previousRootOverflow;
      body.style.position = previousBody.position;
      body.style.top = previousBody.top;
      body.style.left = previousBody.left;
      body.style.right = previousBody.right;
      body.style.width = previousBody.width;
      body.style.overflowY = previousBody.overflowY;
      body.style.paddingRight = previousBody.paddingRight;
      window.scrollTo(0, scrollY);
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    };
  }, [isOpen]);

  const onTouchStart = (event: React.TouchEvent) => {
    const touch = event.touches[0];
    if (touch) touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const onTouchEnd = (event: React.TouchEvent) => {
    const start = touchStartRef.current;
    const touch = event.changedTouches[0];
    touchStartRef.current = null;
    if (!start || !touch) return;
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) < 55 || Math.abs(dx) <= Math.abs(dy) * 1.2) return;
    if (dx > 0) showPrevious();
    else showNext();
  };

  const modal = typeof document !== "undefined" ? createPortal(
    <AnimatePresence>
      {selected !== null && (
        <motion.div
          ref={dialogRef}
          className="fixed inset-0 z-[200] grid place-items-center bg-[#090a0d]/95 p-4 sm:p-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          role="dialog"
          aria-modal="true"
          aria-label="SustainX photo viewer"
          onClick={closePhoto}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          <button ref={closeButtonRef} type="button" onClick={closePhoto} className="absolute right-4 top-4 z-10 grid h-11 w-11 place-items-center rounded-full border border-white/25 bg-black/45 text-white sm:right-8 sm:top-8" aria-label="Close photo viewer">
            <X className="h-5 w-5" />
          </button>
          <button type="button" onClick={(event) => { event.stopPropagation(); showPrevious(); }} className="absolute left-3 top-1/2 z-10 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-white/25 bg-black/45 text-white sm:left-8" aria-label="Previous photo">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button type="button" onClick={(event) => { event.stopPropagation(); showNext(); }} className="absolute right-3 top-1/2 z-10 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-white/25 bg-black/45 text-white sm:right-8" aria-label="Next photo">
            <ChevronRight className="h-5 w-5" />
          </button>
          <motion.figure
            key={galleryPhotos[selected]!.src}
            initial={reduceMotion ? false : { opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: reduceMotion ? 0 : 0.35 }}
            className="flex max-h-[90svh] max-w-[1040px] flex-col items-center"
            onClick={(event) => event.stopPropagation()}
          >
            <img src={galleryPhotos[selected]!.src} alt={galleryPhotos[selected]!.alt} className="max-h-[76svh] max-w-full object-contain sm:max-h-[78svh]" />
            <figcaption className="mt-4 flex w-full max-w-2xl items-start justify-between gap-4 text-white sm:gap-6">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#8ce0d8]">{galleryPhotos[selected]!.eyebrow}</p>
                <p className="mt-1 text-sm leading-6 text-white/64">{galleryPhotos[selected]!.caption}</p>
              </div>
              <span className="text-xs font-bold tabular-nums text-white/45">{String(selected + 1).padStart(2, "0")} / {String(galleryPhotos.length).padStart(2, "0")}</span>
            </figcaption>
          </motion.figure>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  ) : null;

  return (
    <section className="border-b border-black/10 bg-[#f3f2f8] py-20 sm:py-28 lg:py-36" aria-labelledby="sustainx-gallery-title">
      <div className="mx-auto max-w-[1440px] px-5 sm:px-8 lg:px-12">
        <div className="grid gap-8 border-b border-black/14 pb-8 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-8">
            <p className="text-[10px] font-bold uppercase tracking-[0.27em] text-[#319b9a]">Inside SustainX / 20.08.26</p>
            <MaskedHeading className="mt-4">
              <h2 id="sustainx-gallery-title" className="max-w-5xl text-[clamp(3rem,7.3vw,7.4rem)] font-semibold leading-[0.84] tracking-[-0.072em]">
                The event,<br />not the poster.
              </h2>
            </MaskedHeading>
          </div>
          <p className="max-w-sm text-sm leading-6 text-black/55 lg:col-span-3 lg:col-start-10 lg:pb-2">
            A field archive from the room: presentations, reactions and the moments between them. Select any frame to open it.
          </p>
        </div>

        <div className="mt-7 flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.18em] text-black/42 lg:hidden" aria-hidden="true">
          <span>Swipe the archive →</span><span>01 / 07</span>
        </div>
        <div className="event-filter-scroll -mx-5 mt-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-4 sm:-mx-8 sm:px-8 lg:hidden">
          {galleryPhotos.map((photo, index) => (
            <button
              key={photo.src}
              type="button"
              onClick={(event) => openPhoto(index, event.currentTarget)}
              className="group relative w-[78vw] max-w-[360px] shrink-0 snap-center text-left"
              aria-label={`Open gallery image ${index + 1} of ${galleryPhotos.length}`}
            >
              <div className="aspect-[4/5] overflow-hidden bg-black">
                <img src={photo.src} alt={photo.alt} loading={index < 2 ? "eager" : "lazy"} className="h-full w-full object-cover transition-transform duration-700 group-active:scale-[1.02]" />
              </div>
              <div className="flex items-start justify-between gap-4 border-t border-black/15 pt-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#6558c9]">{photo.eyebrow}</p>
                  <p className="mt-1 max-w-[16rem] text-xs leading-5 text-black/55">{photo.caption}</p>
                </div>
                <span className="text-[10px] font-bold tabular-nums text-black/35">{String(index + 1).padStart(2, "0")}</span>
              </div>
            </button>
          ))}
        </div>

        <div className="mt-12 hidden grid-cols-12 gap-x-5 gap-y-20 lg:grid">
          {galleryPhotos.map((photo, index) => {
            const placements = [
              "col-span-6 col-start-1 row-start-1",
              "col-span-4 col-start-9 row-start-1 mt-28",
              "col-span-4 col-start-2 row-start-2",
              "col-span-5 col-start-7 row-start-2 mt-20",
              "col-span-3 col-start-1 row-start-3 mt-12",
              "col-span-5 col-start-4 row-start-3",
              "col-span-3 col-start-10 row-start-3 mt-28",
            ];
            const aspects = ["aspect-[5/4]", "aspect-[3/4]", "aspect-[4/5]", "aspect-[5/4]", "aspect-[3/4]", "aspect-[4/3]", "aspect-[3/4]"];
            return (
              <motion.button
                key={photo.src}
                type="button"
                onClick={(event) => openPhoto(index, event.currentTarget)}
                initial={reduceMotion ? false : { clipPath: "inset(0 0 8% 0)", y: 20, opacity: 0.9 }}
                whileInView={{ clipPath: "inset(0 0 0% 0)", y: 0, opacity: 1 }}
                viewport={{ once: true, amount: 0.18 }}
                transition={{ duration: reduceMotion ? 0 : 0.9, ease: [0.16, 1, 0.3, 1] }}
                className={`group text-left ${placements[index]}`}
                aria-label={`Open gallery image ${index + 1} of ${galleryPhotos.length}`}
              >
                <div className={`relative overflow-hidden bg-[#101114] ${aspects[index]}`}>
                  <motion.img
                    src={photo.src}
                    alt={photo.alt}
                    loading="lazy"
                    className="h-full w-full object-cover"
                    whileHover={reduceMotion ? undefined : { scale: 1.035 }}
                    transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                  />
                  <span className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full bg-black/55 text-white opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100">
                    <Maximize2 className="h-3.5 w-3.5" />
                  </span>
                </div>
                <div className="flex items-start justify-between gap-4 border-t border-black/15 pt-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#6558c9]">{photo.eyebrow}</p>
                    <p className="mt-1 max-w-[22rem] text-xs leading-5 text-black/55">{photo.caption}</p>
                  </div>
                  <span className="text-[10px] font-bold tabular-nums text-black/35">{String(index + 1).padStart(2, "0")}</span>
                </div>
              </motion.button>
            );
          })}
        </div>
      </div>
      {modal}
    </section>
  );
}

export default function SustainXEventStory({ event, canonicalUrl, schemaJson }: Props) {
  const reduceMotion = Boolean(useReducedMotion());
  const heroRef = useRef<HTMLElement>(null);
  const heroVideoRef = useRef<HTMLVideoElement>(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ["start start", "end start"] });
  const titleY = useTransform(scrollYProgress, [0, 1], [0, reduceMotion ? 0 : 130]);
  const mediaY = useTransform(scrollYProgress, [0, 1], [0, reduceMotion ? 0 : 72]);

  useEffect(() => {
    const video = heroVideoRef.current;
    if (!video) return;
    if (reduceMotion) {
      video.pause();
      video.currentTime = 0;
      return;
    }
    void video.play().catch(() => undefined);
  }, [reduceMotion]);

  return (
    <main className="min-h-screen overflow-hidden bg-[#f3f2f8] text-[#101114] selection:bg-[#6558c9] selection:text-white">
      <link rel="canonical" href={canonicalUrl} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: schemaJson }} />
      <Navbar mobileAlign="right" />

      <section ref={heroRef} className="relative isolate min-h-[100svh] overflow-hidden bg-[#090a0d] text-white">
        <motion.div className="absolute inset-0" style={{ y: mediaY }} aria-hidden="true">
          <div className="grid h-[calc(100%+72px)] grid-cols-2 grid-rows-2 gap-px bg-white/10 lg:grid-cols-[0.82fr_1.36fr_0.82fr] lg:grid-rows-1">
            <HeroPanel className="relative hidden overflow-hidden lg:block" delay={0.06}>
              <img src="/media/sustainx/sustainx-02.webp" alt="" className="h-full w-full object-cover" />
              <div className="absolute inset-0 bg-black/20" />
            </HeroPanel>
            <HeroPanel className="relative col-span-2 overflow-hidden lg:col-span-1" delay={0.14}>
              <video
                ref={heroVideoRef}
                poster="/media/sustainx/sustainx-04.webp"
                muted
                loop
                playsInline
                preload="metadata"
                className="h-full w-full object-cover"
              >
                <source src="/media/sustainx/sustainx-hero-loop.webm" type="video/webm" />
                <source src="/media/sustainx/sustainx-hero-loop.mp4" type="video/mp4" />
              </video>
              <div className="absolute inset-0 bg-black/10" />
            </HeroPanel>
            <HeroPanel className="relative overflow-hidden" delay={0.22}>
              <img src="/media/sustainx/sustainx-06.webp" alt="" className="h-full w-full object-cover" />
              <div className="absolute inset-0 bg-black/18" />
            </HeroPanel>
            <HeroPanel className="relative overflow-hidden lg:hidden" delay={0.28}>
              <img src="/media/sustainx/sustainx-03.webp" alt="" className="h-full w-full object-cover" />
              <div className="absolute inset-0 bg-black/25" />
            </HeroPanel>
          </div>
        </motion.div>
        <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,9,12,.58)_0%,rgba(8,9,12,.08)_34%,rgba(8,9,12,.2)_62%,rgba(8,9,12,.88)_100%)]" />
        <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,transparent_20%,rgba(0,0,0,.34)_100%)]" />

        <div className="relative mx-auto flex min-h-[100svh] max-w-[1600px] flex-col px-5 pb-7 pt-24 sm:px-8 sm:pt-28 lg:px-12">
          <div className="flex items-center justify-between border-b border-white/22 py-4 text-white">
            <Link to="/events" className="group inline-flex min-h-11 items-center gap-2 text-[9px] font-bold uppercase tracking-[0.2em] text-white/72 transition hover:text-white">
              <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" /> All events
            </Link>
            <p className="text-right text-[10px] font-bold uppercase tracking-[0.22em] text-white/58">Event archive<br className="sm:hidden" /> / 20.08.26</p>
          </div>

          <div className="mt-auto pb-4 pt-28 sm:pt-36">
            <motion.div style={{ y: titleY }}>
              <motion.p
                initial={reduceMotion ? false : { opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: reduceMotion ? 0 : 0.55, delay: reduceMotion ? 0 : 0.55 }}
                className="mb-4 text-[10px] font-bold uppercase tracking-[0.3em] text-[#a5f0e7] sm:tracking-[0.34em]"
              >
                See the challenge. Shape the change.
              </motion.p>
              <div className="overflow-hidden">
                <motion.h1
                  initial={reduceMotion ? false : { y: "108%" }}
                  animate={{ y: 0 }}
                  transition={{ duration: reduceMotion ? 0 : 1.05, delay: reduceMotion ? 0 : 0.32, ease: [0.16, 1, 0.3, 1] }}
                  className="whitespace-nowrap text-[clamp(4.25rem,15.2vw,14.5rem)] font-black leading-[0.7] tracking-[-0.09em] drop-shadow-[0_8px_45px_rgba(0,0,0,.34)]"
                >
                  SUSTAIN<span className="bg-[linear-gradient(135deg,#78d6ca_0_45%,#a68df2_48%_100%)] bg-clip-text text-transparent">X</span>
                </motion.h1>
              </div>
              <div className="mt-5 grid gap-5 border-t border-white/24 pt-5 sm:grid-cols-[1fr_auto] sm:items-end">
                <p className="max-w-xl text-[clamp(1.25rem,2.6vw,2.55rem)] font-semibold leading-[0.96] tracking-[-0.045em]">From Street to Smart City</p>
                <div className="flex flex-wrap gap-x-5 gap-y-2 text-[10px] font-bold uppercase tracking-[0.14em] text-white/65 sm:justify-end sm:tracking-[0.16em]">
                  <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5 text-[#a68df2]" />20 August 2026</span>
                  <span className="inline-flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-[#78d6ca]" />{event.venue || "Sahrdaya College"}</span>
                  <span className="inline-flex items-center gap-1.5"><Leaf className="h-3.5 w-3.5 text-[#a68df2]" />UN SDG 11</span>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      <section className="overflow-hidden border-b border-black/12 bg-[#dcd6f4] py-4" aria-label="SustainX process">
        <div className="sustainx-marquee-track flex w-max items-center gap-7 pr-7" aria-hidden="true">
          {[...marqueeWords, ...marqueeWords, ...marqueeWords].map((word, index) => (
            <span key={`${word}-${index}`} className="flex items-center gap-7 whitespace-nowrap text-[clamp(2.6rem,6vw,5.8rem)] font-black leading-none tracking-[-0.065em] text-[#101114]">
              {word}<span className="text-[#6558c9]">✦</span>
            </span>
          ))}
        </div>
        <span className="sr-only">Observe, build, test, pitch, rethink, sustain.</span>
      </section>

      <section className="border-b border-black/10 py-20 sm:py-28 lg:py-36">
        <div className="mx-auto grid max-w-[1440px] gap-12 px-5 sm:px-8 lg:grid-cols-12 lg:px-12">
          <Reveal className="lg:col-span-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-[#6558c9]">What SustainX became</p>
            <p className="mt-5 text-xs font-bold uppercase tracking-[0.14em] text-black/35">One campus. Fourteen teams. Local problems first.</p>
          </Reveal>
          <div className="lg:col-span-8">
            <MaskedHeading>
              <h2 className="max-w-5xl text-[clamp(2.8rem,6.8vw,6.8rem)] font-semibold leading-[0.87] tracking-[-0.068em]">
                Small local changes can redraw the way a city works.
              </h2>
            </MaskedHeading>
            <Reveal>
              <p className="mt-8 max-w-3xl text-base leading-7 text-black/62 sm:text-lg sm:leading-8">
                SustainX brought students together to identify real sustainability challenges, explore practical ideas and reimagine how everyday interventions can contribute to safer, more inclusive, resilient and sustainable communities.
              </p>
            </Reveal>
          </div>
        </div>
      </section>

      <EventGallery />

      <section className="border-b border-black/10 bg-[#101114] py-20 text-white sm:py-28 lg:py-36">
        <div className="mx-auto max-w-[1440px] px-5 sm:px-8 lg:px-12">
          <div className="grid gap-8 border-b border-white/16 pb-8 lg:grid-cols-12 lg:items-end">
            <div className="lg:col-span-9">
              <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-[#8ce0d8]">The journey / three moves</p>
              <MaskedHeading className="mt-4">
                <h2 className="text-[clamp(3rem,7.2vw,7.3rem)] font-semibold leading-[0.85] tracking-[-0.07em]">Identify. Innovate. Present.</h2>
              </MaskedHeading>
            </div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/38 lg:col-span-3 lg:text-right">3 phases / 1 challenge</p>
          </div>
          <div className="mt-2">
            {phases.map((phase, index) => (
              <motion.article
                key={phase.number}
                initial={reduceMotion ? false : { opacity: 0.62 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: false, amount: 0.55 }}
                transition={{ duration: reduceMotion ? 0 : 0.45 }}
                className="grid min-h-[48svh] gap-7 border-b border-white/13 py-12 last:border-b-0 sm:grid-cols-[120px_1fr] sm:py-16 lg:grid-cols-12 lg:items-center"
              >
                <p className="text-[clamp(4rem,8vw,8rem)] font-black leading-none tracking-[-0.08em] text-white/16 sm:col-span-1 lg:col-span-3">{phase.number}</p>
                <div className={`max-w-4xl sm:col-start-2 lg:col-span-8 lg:col-start-5 ${index === 1 ? "lg:translate-x-[5%]" : ""}`}>
                  <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#8ce0d8]">{phase.verb}</p>
                  <h3 className="mt-4 text-[clamp(2.1rem,4.8vw,5rem)] font-semibold leading-[0.92] tracking-[-0.055em]">{phase.title}</h3>
                  <p className="mt-6 max-w-2xl text-sm leading-7 text-white/55 sm:text-base">{phase.body}</p>
                </div>
              </motion.article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-black/10 bg-[#eeecf7] py-20 sm:py-28 lg:py-32">
        <div className="mx-auto max-w-[1440px] px-5 sm:px-8 lg:px-12">
          <div className="grid gap-8 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-[#319b9a]">Challenge area / SDG 11</p>
              <MaskedHeading className="mt-4">
                <h2 className="text-[clamp(3rem,7vw,7rem)] font-semibold leading-[0.86] tracking-[-0.07em]">The city was the brief.</h2>
              </MaskedHeading>
            </div>
            <Reveal className="lg:col-span-4 lg:col-start-9 lg:pt-12">
              <blockquote className="border-l-2 border-[#6558c9] pl-5 text-lg font-medium leading-[1.18] tracking-[-0.025em] text-black/68">
                “What can we change here, with what we already know, have and can realistically build?”
              </blockquote>
            </Reveal>
          </div>
          <div className="mt-12 grid grid-cols-2 border-l border-t border-black/15 lg:grid-cols-3">
            {challengeThemes.map((theme, index) => (
              <Reveal key={theme} className="group flex min-h-24 items-end justify-between gap-3 border-b border-r border-black/15 p-4 transition-colors hover:bg-white/45 sm:min-h-28 sm:p-5">
                <span className="max-w-[15rem] text-sm font-semibold leading-tight tracking-[-0.025em] sm:text-base">{theme}</span>
                <span className="text-[10px] font-bold tabular-nums text-black/28">{String(index + 1).padStart(2, "0")}</span>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-black/10 py-20 sm:py-28 lg:py-36">
        <div className="mx-auto max-w-[1440px] px-5 sm:px-8 lg:px-12">
          <div className="grid gap-8 border-b border-black/14 pb-8 lg:grid-cols-12 lg:items-end">
            <div className="lg:col-span-8">
              <p className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.25em] text-[#6558c9]"><Trophy className="h-4 w-4" />The podium</p>
              <MaskedHeading className="mt-4">
                <h2 className="text-[clamp(3rem,7vw,7rem)] font-semibold leading-[0.86] tracking-[-0.07em]">Three ideas rose to the top.</h2>
              </MaskedHeading>
            </div>
            <p className="max-w-sm text-sm leading-6 text-black/52 lg:col-span-4 lg:ml-auto">Selected for the strength of the idea and the way it was developed and presented through SustainX.</p>
          </div>
          <div className="mt-4">
            {winners.map((winner) => (
              <Reveal key={winner.place} className="grid gap-5 border-b border-black/12 py-9 sm:grid-cols-[90px_1fr] sm:gap-8 sm:py-12 lg:grid-cols-[130px_1fr_1fr] lg:items-start">
                <p className="text-5xl font-black tracking-[-0.07em] text-[#6558c9] sm:text-6xl">{winner.place}</p>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#319b9a]">Team</p>
                  <h3 className="mt-2 text-3xl font-black tracking-[-0.055em] sm:text-5xl">{winner.team}</h3>
                  <p className="mt-3 text-lg font-semibold tracking-[-0.025em] text-black/66">{winner.title}</p>
                </div>
                <p className="max-w-xl text-sm leading-6 text-black/58 sm:col-start-2 lg:col-start-auto lg:text-base lg:leading-7">{winner.body}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-black/10 bg-[#dcd6f4] py-20 sm:py-28">
        <div className="mx-auto max-w-[1440px] px-5 sm:px-8 lg:px-12">
          <div className="grid gap-8 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <p className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.25em] text-[#5649b7]"><Users className="h-4 w-4" />14 teams</p>
              <MaskedHeading className="mt-4">
                <h2 className="text-4xl font-semibold leading-[0.95] tracking-[-0.055em] sm:text-6xl">Fourteen ways of seeing the city differently.</h2>
              </MaskedHeading>
            </div>
            <p className="max-w-xl text-sm leading-6 text-black/58 lg:col-span-5 lg:col-start-8 lg:pt-8 sm:text-base sm:leading-7">Every team entered the same SDG 11 challenge from a different lived problem. The archive below records the participating team names without publishing private participant information.</p>
          </div>
          <div className="mt-12 grid grid-cols-2 border-l border-t border-black/16 lg:grid-cols-4">
            {teams.map((team, index) => (
              <Reveal key={team} className="flex min-h-24 flex-col justify-between gap-3 border-b border-r border-black/16 p-4 sm:min-h-32 sm:p-5">
                <span className="text-[10px] font-bold tabular-nums tracking-[0.18em] text-black/34">{String(index + 1).padStart(2, "0")}</span>
                <span className="break-words text-sm font-black leading-tight tracking-[-0.035em] sm:text-lg">{team}</span>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-black/10 py-20 sm:py-28">
        <div className="mx-auto grid max-w-[1440px] gap-12 px-5 sm:px-8 lg:grid-cols-12 lg:px-12">
          <div className="lg:col-span-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-[#319b9a]">How ideas were evaluated</p>
            <MaskedHeading className="mt-4">
              <h2 className="text-4xl font-semibold leading-[0.96] tracking-[-0.055em] sm:text-6xl">The pitch was only part of the score.</h2>
            </MaskedHeading>
            <p className="mt-6 max-w-md text-sm leading-6 text-black/56">The documented judging framework put the largest share of the score on sustainability and community impact.</p>
          </div>
          <Reveal className="lg:col-span-6 lg:col-start-7">
            <div className="border-t border-black/18">
              {criteria.map(([label, score]) => (
                <div key={label} className="grid grid-cols-[1fr_auto] items-end gap-5 border-b border-black/14 py-5">
                  <p className="text-sm font-semibold tracking-[-0.02em] sm:text-base">{label}</p>
                  <p className="text-4xl font-black tabular-nums tracking-[-0.06em] text-[#6558c9] sm:text-5xl">{score}</p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-right text-[10px] font-bold uppercase tracking-[0.2em] text-black/34">100 points total</p>
          </Reveal>
        </div>
      </section>

      <section className="relative isolate min-h-[86svh] overflow-hidden bg-[#101114] text-white">
        <img src="/media/sustainx/sustainx-07.webp" alt="" className="absolute inset-0 h-full w-full object-cover object-center" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(7,8,10,.93)_0%,rgba(7,8,10,.78)_46%,rgba(7,8,10,.24)_100%)]" />
        <div className="relative mx-auto flex min-h-[86svh] max-w-[1440px] flex-col justify-end px-5 py-20 sm:px-8 sm:py-28 lg:px-12">
          <p className="text-[10px] font-bold uppercase tracking-[0.32em] text-[#8ce0d8]">Spot it. Solve it. Sustain it.</p>
          <MaskedHeading className="mt-6">
            <h2 className="max-w-6xl text-[clamp(3.6rem,10vw,10rem)] font-black leading-[0.78] tracking-[-0.08em]">
              SEE THE<br />CHALLENGE.<br /><span className="text-[#8ce0d8]">SHAPE THE</span><br /><span className="text-[#9a86ed]">CHANGE.</span>
            </h2>
          </MaskedHeading>
          <div className="mt-10 flex flex-wrap items-center gap-4 border-t border-white/22 pt-7">
            <Link to="/events" className="inline-flex min-h-11 items-center gap-2 border border-white/35 px-5 py-3 text-[10px] font-bold uppercase tracking-[0.18em] transition hover:border-[#8ce0d8] hover:text-[#8ce0d8]">
              Explore more events <ArrowUpRight className="h-4 w-4" />
            </Link>
            <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/48 sm:tracking-[0.18em]">IEEE Sahrdaya · 20 August 2026</span>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
