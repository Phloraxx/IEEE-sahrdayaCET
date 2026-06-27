"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, ArrowUpRight, Clock } from "lucide-react";
import { Link } from "@tanstack/react-router";

import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import type { BlogPost, BlogTopic } from "@/types";
import { cn } from "@/lib/utils";

/* ─────────────────────────────────────────────────────────────
   FAKE DATA — will be replaced by a PocketBase loader later.
   Cover images use Unsplash so we don't need any local assets.
   ───────────────────────────────────────────────────────────── */

const FEATURED: BlogPost[] = [
  {
    id: "f1",
    title: "Inside RoboFest 2025: 36 Hours, 14 Bots, One Champion",
    slug: "robofest-2025-recap",
    excerpt:
      "A behind-the-scenes recap of the largest robotics build-off our branch has ever hosted.",
    coverUrl:
      "https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=900&auto=format&fit=crop&q=80",
    readMinutes: 7,
    topicLabel: "Robotics",
    author: { name: "Ananya Krishnan", role: "RAS Chair" },
    publishedAt: "2025-04-12",
  },
  {
    id: "f2",
    title: "We Trained a Tiny Transformer on a Raspberry Pi — Here's What Broke",
    slug: "tiny-transformer-raspi",
    excerpt:
      "Edge ML is fun until your model is bigger than your RAM. A field report from our last AI hack night.",
    coverUrl:
      "https://images.unsplash.com/photo-1518770660439-4636190af475?w=900&auto=format&fit=crop&q=80",
    readMinutes: 9,
    topicLabel: "AI / ML",
    author: { name: "Rahul Menon", role: "CS Society" },
    publishedAt: "2025-03-28",
  },
  {
    id: "f3",
    title: "Women in Engineering: Why Our WIE Affinity Group Just Doubled",
    slug: "wie-doubled",
    excerpt:
      "How a year of small, deliberate decisions turned WIE Sahrdaya into the most-joined affinity group on campus.",
    coverUrl:
      "https://images.unsplash.com/photo-1573164713988-8665fc963095?w=900&auto=format&fit=crop&q=80",
    readMinutes: 5,
    topicLabel: "Community",
    author: { name: "Devika Suresh", role: "WIE Chair" },
    publishedAt: "2025-03-15",
  },
];

const SIDEBAR: BlogPost[] = [
  {
    id: "s1",
    title: "The Art of Showing Up: Why Members Beat Talent",
    slug: "art-of-showing-up",
    author: { name: "Thomas Joseph" },
  },
  {
    id: "s2",
    title: "How I Survived My First Hackathon (And My Semester)",
    slug: "first-hackathon",
    author: { name: "Angela Jose" },
  },
  {
    id: "s3",
    title: "Soldering Teaches You Patience… or How to Tolerate Smoke",
    slug: "soldering-patience",
    author: { name: "Michael Winter" },
  },
  {
    id: "s4",
    title: "Ship Now, Refactor Later: Our New Branch Motto",
    slug: "ship-now-refactor-later",
    author: { name: "Budi Setiawan" },
  },
];

const TOPICS: BlogTopic[] = [
  {
    key: "ai-ml",
    label: "AI & Machine Learning",
    tone: "cream",
    blurb: "From transformers on toasters to honest reads on the hype cycle.",
    posts: [
      {
        id: "ai1",
        title: "From Excel to Embeddings: An Engineer's First ML Project",
        slug: "excel-to-embeddings",
        author: { name: "Thomas Joseph", photoUrl: "https://i.pravatar.cc/80?img=12" },
      },
      {
        id: "ai2",
        title: "Prompt, Don't Beg: Better Outputs with Less Effort",
        slug: "prompt-dont-beg",
        author: { name: "Aishwarya P.", photoUrl: "https://i.pravatar.cc/80?img=47" },
      },
      {
        id: "ai3",
        title: "Vibe Coding is Fine. Vibe Shipping is Not.",
        slug: "vibe-coding-vs-shipping",
        author: { name: "Hari Krishnan", photoUrl: "https://i.pravatar.cc/80?img=33" },
      },
    ],
  },
  {
    key: "robotics",
    label: "Robotics & Hardware",
    tone: "lavender",
    blurb: "Bots, boards, brushless motors and the occasional small fire.",
    posts: [
      {
        id: "r1",
        title: "Picking Your First Microcontroller Without Crying",
        slug: "first-microcontroller",
        author: { name: "Devika Suresh", photoUrl: "https://i.pravatar.cc/80?img=44" },
      },
      {
        id: "r2",
        title: "Line Followers, But Make Them Fast",
        slug: "fast-line-followers",
        author: { name: "Joel Mathew", photoUrl: "https://i.pravatar.cc/80?img=15" },
      },
      {
        id: "r3",
        title: "PCB Design Tips Nobody Told Us in Year One",
        slug: "pcb-tips-year-one",
        author: { name: "Sneha Raj", photoUrl: "https://i.pravatar.cc/80?img=23" },
      },
    ],
  },
  {
    key: "events",
    label: "Events & Branch Life",
    tone: "dark",
    blurb: "Recaps, lessons, and what we're brewing for next semester.",
    posts: [
      {
        id: "e1",
        title: "First-Time Volunteer: What to Expect on Event Day",
        slug: "first-time-volunteer",
        author: { name: "Akshay R.", photoUrl: "https://i.pravatar.cc/80?img=8" },
      },
      {
        id: "e2",
        title: "The Rookie Organizer: Surviving Your First Tech Fest",
        slug: "rookie-organizer",
        author: { name: "Meera Anand", photoUrl: "https://i.pravatar.cc/80?img=49" },
      },
      {
        id: "e3",
        title: "Crowd Control 101: Lessons from a Standing-Room Talk",
        slug: "crowd-control-101",
        author: { name: "Arjun Pillai", photoUrl: "https://i.pravatar.cc/80?img=11" },
      },
    ],
  },
];

/* ─────────────────────────────────────────────────────────────
   Page component
   ───────────────────────────────────────────────────────────── */

export default function BlogClient() {
  const [hovered, setHovered] = useState<string | null>(null);
  const featured = useMemo(() => FEATURED, []);
  const sidebar = useMemo(() => SIDEBAR, []);

  return (
    <div className="relative min-h-screen w-full overflow-x-hidden bg-background text-foreground font-sans">
      <Navbar />

      {/* Soft paper grain to give the editorial layout a printed feel */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 opacity-[0.035] mix-blend-multiply dark:opacity-[0.06] dark:mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.55'/></svg>\")",
        }}
      />

      <main className="relative z-10 mx-auto w-full max-w-[1400px] px-5 pt-32 pb-24 md:px-10">
        {/* ── Eyebrow strip (above the wordmark) ───────────────── */}
        <EyebrowStrip />

        {/* ── Giant editorial wordmark ─────────────────────────── */}
        <Wordmark text="THE BLOG" />

        {/* ── Featured row: 3 photo cards + sidebar list ──────── */}
        <section className="mt-10 grid grid-cols-1 gap-8 lg:grid-cols-[1fr_1fr_1fr_minmax(240px,300px)]">
          {featured.map((post, i) => (
            <FeaturedCard
              key={post.id}
              post={post}
              index={i}
              hovered={hovered === post.id}
              onHover={(h) => setHovered(h ? post.id : null)}
            />
          ))}

          <SidebarColumn posts={sidebar} />
        </section>

        {/* ── Divider ──────────────────────────────────────────── */}
        <div className="mt-14 mb-8 h-px w-full bg-border" />

        {/* ── Topics header row ────────────────────────────────── */}
        <div className="mb-6 flex items-end justify-between">
          <h2 className="text-xs font-extrabold uppercase tracking-[0.22em] text-accent">
            Browse topics
          </h2>
          <button
            type="button"
            className="group inline-flex items-center gap-1 text-xs font-bold uppercase tracking-[0.22em] text-muted-foreground transition-colors hover:text-foreground"
          >
            See all topics
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </button>
        </div>

        {/* ── Topic cards row ──────────────────────────────────── */}
        <section className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {TOPICS.map((topic, i) => (
            <TopicCard key={topic.key} topic={topic} index={i} />
          ))}
        </section>

        {/* ── Newsletter ribbon ────────────────────────────────── */}
        <NewsletterRibbon />
      </main>

      <Footer />
    </div>
  );
}

/* ============================================================
   Eyebrow strip — small grouped nav-like labels echoing the
   reference image, without competing with the real Navbar.
   ============================================================ */

function EyebrowStrip() {
  const groups: { title: string; items: string[] }[] = [
    { title: "The Blog", items: ["Latest", "Featured", "Editor's pick"] },
    { title: "Read by topic", items: ["AI / ML", "Robotics", "Events"] },
    { title: "From the branch", items: ["Recaps", "Spotlights", "How-tos"] },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="flex flex-wrap items-start justify-between gap-x-10 gap-y-4 border-y border-border/70 py-4"
    >
      <div className="flex items-baseline gap-3">
        <span className="text-xs font-extrabold uppercase tracking-[0.22em] text-foreground">
          IEEE Sahrdaya
        </span>
        <span className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
          / The Blog
        </span>
      </div>

      <div className="flex flex-wrap gap-8 md:gap-12">
        {groups.map((g) => (
          <div key={g.title} className="min-w-[120px]">
            <p className="mb-1 text-[10px] font-extrabold uppercase tracking-[0.22em] text-accent">
              {g.title}
            </p>
            <ul className="space-y-0.5">
              {g.items.map((it) => (
                <li
                  key={it}
                  className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                >
                  {it}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Mascot mark — minimalist scribble, no external asset */}
      <MascotScribble />
    </motion.div>
  );
}

function MascotScribble() {
  return (
    <svg
      viewBox="0 0 80 60"
      className="hidden h-12 w-16 text-foreground sm:block"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="28" cy="20" r="9" />
      <path d="M28 29 L24 44 L18 55" />
      <path d="M28 29 L34 44 L40 55" />
      <path d="M28 33 L18 38" />
      <path d="M28 33 L44 30" />
      <path d="M50 22 Q60 14 70 22" />
      <path d="M52 28 L68 28" />
    </svg>
  );
}

/* ============================================================
   Wordmark — Anton condensed, scaled with clamp(),
   subtle hover micro-motion per letter.
   ============================================================ */

function Wordmark({ text }: { text: string }) {
  return (
    <div className="relative mt-8 select-none">
      <motion.h1
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="font-display leading-[0.82] tracking-[-0.025em] text-foreground"
        style={{ fontSize: "clamp(4rem, 17.5vw, 17rem)" }}
      >
        <span className="block whitespace-nowrap">
          {text.split("").map((ch, i) => (
            <motion.span
              key={`${ch}-${i}`}
              whileHover={{ y: -6, color: "var(--accent)" }}
              transition={{ type: "spring", stiffness: 400, damping: 18 }}
              className="inline-block"
            >
              {ch === " " ? "\u00A0" : ch}
            </motion.span>
          ))}
        </span>
      </motion.h1>

      {/* Right-side metadata in the negative space */}
      <div className="pointer-events-none absolute right-0 top-2 hidden flex-col items-end gap-1 text-right md:flex">
        <span className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
          Vol. 01
        </span>
        <span className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
          {new Date().getFullYear()} / Sahrdaya
        </span>
      </div>
    </div>
  );
}

/* ============================================================
   FeaturedCard — tall portrait image with overlaid title,
   accent "read" CTA on the bottom-right (echoing the reference
   play button), and an SVG "speech-bubble tail" pinned to the
   bottom-right corner of the card.
   ============================================================ */

function FeaturedCard({
  post,
  index,
  hovered,
  onHover,
}: {
  post: BlogPost;
  index: number;
  hovered: boolean;
  onHover: (hovered: boolean) => void;
}) {
  const authorName =
    typeof post.author === "string" ? post.author : post.author?.name;
  const authorRole =
    typeof post.author === "string" ? undefined : post.author?.role;

  return (
    <motion.article
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, delay: 0.1 + index * 0.08 }}
      onHoverStart={() => onHover(true)}
      onHoverEnd={() => onHover(false)}
      className="group relative flex flex-col"
    >
      {/* Image card */}
      <div className="relative aspect-[4/5] w-full overflow-hidden rounded-2xl bg-muted shadow-sm ring-1 ring-border">
        <img
          src={post.coverUrl}
          alt={post.title}
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />

        {/* Soft top tag */}
        <div className="absolute left-3 top-3 z-10">
          <span className="rounded-full bg-background/85 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-foreground backdrop-blur-sm ring-1 ring-border">
            {post.topicLabel ?? "Article"}
          </span>
        </div>

        {/* Bottom gradient */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />

        {/* Title overlay */}
        <div className="absolute inset-x-0 bottom-0 z-10 flex items-end justify-between gap-3 p-4 sm:p-5">
          <h3 className="max-w-[80%] text-balance text-xl font-extrabold leading-[1.05] text-white drop-shadow-sm sm:text-2xl">
            {post.title}
          </h3>

          <Link
            to="/blog"
            aria-label={`Read ${post.title}`}
            className={cn(
              "relative z-20 grid h-12 w-12 shrink-0 place-items-center rounded-full text-accent-foreground shadow-lg transition-all",
              "bg-accent hover:scale-110 active:scale-95"
            )}
          >
            <ArrowUpRight className="h-5 w-5" strokeWidth={2.4} />
          </Link>
        </div>

        {/* Bottom meta strip */}
        <div className="absolute inset-x-0 bottom-0 z-0 flex translate-y-full items-center gap-2 px-4 pb-2 text-[10px] uppercase tracking-[0.22em] text-white/85">
          <Clock className="h-3 w-3" />
          {post.readMinutes ?? 5} min read
        </div>
      </div>

      {/* Speech-bubble tail (decorative) */}
      <svg
        viewBox="0 0 40 30"
        aria-hidden
        className="-mt-px ml-auto mr-4 h-5 w-7 fill-current text-foreground/90"
        style={{
          filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.06))",
        }}
      >
        <path d="M2 0 L40 0 L40 4 Q20 6 8 28 Q4 22 2 6 Z" />
      </svg>

      {/* Author block */}
      <div className="mt-2 flex items-baseline justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-foreground">{authorName ?? "IEEE Sahrdaya"}</p>
          {authorRole ? (
            <p className="text-xs text-muted-foreground">{authorRole}</p>
          ) : (
            <p className="text-xs text-muted-foreground">Member contribution</p>
          )}
        </div>
        <motion.span
          animate={{ opacity: hovered ? 1 : 0.45, x: hovered ? 0 : -4 }}
          transition={{ duration: 0.25 }}
          className="text-[10px] font-bold uppercase tracking-[0.22em] text-accent"
        >
          Read story →
        </motion.span>
      </div>
    </motion.article>
  );
}

/* ============================================================
   SidebarColumn — "From the Blog" list of recent posts
   ============================================================ */

function SidebarColumn({ posts }: { posts: BlogPost[] }) {
  return (
    <motion.aside
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, delay: 0.4 }}
      className="flex flex-col justify-between"
    >
      <div>
        <h2 className="mb-4 text-xs font-extrabold uppercase tracking-[0.22em] text-accent">
          From the blog
        </h2>

        <ul className="space-y-4">
          {posts.map((p) => {
            const name = typeof p.author === "string" ? p.author : p.author?.name;
            return (
              <li key={p.id} className="group">
                <Link
                  to="/blog"
                  className="block border-b border-border/70 pb-3 last:border-b-0"
                >
                  <p className="text-sm font-semibold leading-snug text-foreground transition-colors group-hover:text-accent">
                    {p.title}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{name}</p>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>

      <Link
        to="/blog"
        className="mt-6 inline-flex items-center justify-center gap-2 self-start rounded-full bg-foreground px-5 py-2.5 text-xs font-bold uppercase tracking-[0.18em] text-background transition-transform hover:scale-[1.02] active:scale-95"
      >
        Visit blog
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </motion.aside>
  );
}

/* ============================================================
   TopicCard — colored topic card with 3 article rows + avatar.
   Tone maps to a surface color (cream / lavender / dark).
   ============================================================ */

const TONE: Record<
  BlogTopic["tone"],
  { surface: string; title: string; sub: string; row: string; divider: string; arrow: string }
> = {
  cream: {
    surface: "bg-[#f3ead7] dark:bg-[#2a2419] text-foreground",
    title: "text-[#3a2d12] dark:text-[#f3ead7]",
    sub: "text-[#7a6940] dark:text-[#b8a06a]",
    row: "hover:bg-black/[0.04] dark:hover:bg-white/[0.05]",
    divider: "border-[#e0d3ad] dark:border-white/10",
    arrow: "text-[#3a2d12] dark:text-[#f3ead7]",
  },
  lavender: {
    surface: "bg-[#e9e4f7] dark:bg-[#22203a] text-foreground",
    title: "text-[#322a5a] dark:text-[#e9e4f7]",
    sub: "text-[#6c5fa3] dark:text-[#b9b0e0]",
    row: "hover:bg-black/[0.04] dark:hover:bg-white/[0.05]",
    divider: "border-[#d5cdee] dark:border-white/10",
    arrow: "text-[#322a5a] dark:text-[#e9e4f7]",
  },
  dark: {
    surface: "bg-[#161616] dark:bg-[#0c0c0c] text-white",
    title: "text-white",
    sub: "text-white/60",
    row: "hover:bg-white/[0.06]",
    divider: "border-white/10",
    arrow: "text-white",
  },
  mint: {
    surface: "bg-[#dcefe3] dark:bg-[#142a1f] text-foreground",
    title: "text-[#143a26] dark:text-[#dcefe3]",
    sub: "text-[#4a8062] dark:text-[#9ad1b4]",
    row: "hover:bg-black/[0.04] dark:hover:bg-white/[0.05]",
    divider: "border-[#c2e0cf] dark:border-white/10",
    arrow: "text-[#143a26] dark:text-[#dcefe3]",
  },
};

function TopicCard({ topic, index }: { topic: BlogTopic; index: number }) {
  const t = TONE[topic.tone];

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: 0.05 + index * 0.08 }}
      whileHover={{ y: -4 }}
      className={cn(
        "relative flex flex-col overflow-hidden rounded-2xl ring-1 ring-black/5 shadow-sm",
        t.surface
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 px-5 pt-5">
        <div>
          <h3 className={cn("text-2xl font-extrabold leading-tight", t.title)}>
            {topic.label}
          </h3>
          {topic.blurb ? (
            <p className={cn("mt-1.5 max-w-[22ch] text-xs leading-relaxed", t.sub)}>
              {topic.blurb}
            </p>
          ) : null}
        </div>
        <TopicDoodle tone={topic.tone} />
      </div>

      {/* Article rows */}
      <ul className="mt-4 flex flex-col">
        {topic.posts.map((p, i) => {
          const name = typeof p.author === "string" ? p.author : p.author?.name;
          const photo =
            typeof p.author === "string" ? undefined : p.author?.photoUrl;
          return (
            <li key={p.id}>
              <Link
                to="/blog"
                className={cn(
                  "group flex items-center gap-3 border-t px-5 py-3.5 transition-colors",
                  i === 0 ? "" : "",
                  t.row,
                  t.divider
                )}
              >
                {/* Avatar */}
                <div
                  className={cn(
                    "h-9 w-9 shrink-0 overflow-hidden rounded-full bg-black/10 ring-1 ring-black/5",
                    topic.tone === "dark" && "bg-white/10 ring-white/10"
                  )}
                >
                  {photo ? (
                    <img
                      src={photo}
                      alt={name ?? ""}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="grid h-full w-full place-items-center text-[10px] font-bold uppercase">
                      {(name ?? "·").slice(0, 2)}
                    </div>
                  )}
                </div>

                {/* Title + author */}
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      "truncate text-sm font-semibold leading-snug",
                      t.title
                    )}
                  >
                    {p.title}
                  </p>
                  <p className={cn("mt-0.5 text-[11px]", t.sub)}>{name}</p>
                </div>

                {/* Arrow */}
                <ArrowRight
                  className={cn(
                    "h-4 w-4 shrink-0 transition-transform group-hover:translate-x-1",
                    t.arrow
                  )}
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </motion.div>
  );
}

/* Small abstract doodle per topic (no external assets) */
function TopicDoodle({ tone }: { tone: BlogTopic["tone"] }) {
  const stroke =
    tone === "dark" ? "rgba(255,255,255,0.85)" : "rgba(20,20,20,0.85)";
  return (
    <svg
      viewBox="0 0 70 60"
      className="h-12 w-14 shrink-0"
      fill="none"
      stroke={stroke}
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {tone === "cream" ? (
        <>
          {/* runner-like figure */}
          <circle cx="22" cy="14" r="7" />
          <path d="M22 21 L18 36 L10 50" />
          <path d="M22 21 L30 36 L40 50" />
          <path d="M22 26 L8 32" />
          <path d="M22 26 L40 22" />
          <path d="M50 30 Q60 22 68 30" />
        </>
      ) : tone === "lavender" ? (
        <>
          {/* swirly motion */}
          <path d="M6 36 Q22 8 38 36 Q54 60 66 30" />
          <circle cx="12" cy="20" r="2" />
          <circle cx="56" cy="18" r="2" />
          <path d="M48 48 L62 48" />
          <path d="M52 44 L58 52" />
        </>
      ) : tone === "dark" ? (
        <>
          {/* stage / trophy */}
          <path d="M14 50 L56 50" />
          <path d="M22 50 L22 36 L48 36 L48 50" />
          <circle cx="35" cy="22" r="9" />
          <path d="M26 22 L18 22 L20 28" />
          <path d="M44 22 L52 22 L50 28" />
        </>
      ) : (
        <>
          <path d="M10 50 Q20 10 35 30 Q50 50 60 14" />
          <circle cx="35" cy="30" r="3" />
        </>
      )}
    </svg>
  );
}

/* ============================================================
   Newsletter ribbon — a closing CTA strip
   ============================================================ */

function NewsletterRibbon() {
  return (
    <motion.section
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.4 }}
      transition={{ duration: 0.5 }}
      className="mt-16 overflow-hidden rounded-3xl border border-border bg-card p-6 sm:p-10"
    >
      <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
        <div className="max-w-xl">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.3em] text-accent">
            Stay in the loop
          </p>
          <h3 className="mt-2 font-display text-4xl leading-[0.9] sm:text-5xl">
            ONE EMAIL.<br />NO SPAM.
          </h3>
          <p className="mt-3 max-w-md text-sm text-muted-foreground">
            Monthly drop with new posts, event recaps and the occasional
            unhinged engineering rant from the branch.
          </p>
        </div>

        <form
          onSubmit={(e) => e.preventDefault()}
          className="flex w-full max-w-md flex-col gap-3 sm:flex-row"
        >
          <input
            type="email"
            required
            placeholder="you@sahrdaya.ac.in"
            className="h-12 flex-1 rounded-full border border-border bg-background px-5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
          <button
            type="submit"
            className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-accent px-6 text-xs font-bold uppercase tracking-[0.18em] text-accent-foreground transition-transform hover:scale-[1.02] active:scale-95"
          >
            Subscribe
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </form>
      </div>
    </motion.section>
  );
}
