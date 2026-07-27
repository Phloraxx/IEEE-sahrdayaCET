import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, ArrowUpRight, Clock, Search } from "lucide-react";
import { Link } from "react-router";

import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import type { BlogPost, BlogTopic } from "@/types";
import { cn } from "@/lib/utils";
import { formatDateShort } from "@/lib/dates";

export default function BlogClient({ blogs = [] }: { blogs?: BlogPost[] }) {
  const [hovered, setHovered] = useState<string | null>(null);

  const featured = useMemo(() => {
    const ieee = blogs.filter((blog) => blog.category === "IEEE");
    const fallback = blogs.filter((blog) => blog.category !== "IEEE");
    return [...ieee, ...fallback].slice(0, 3);
  }, [blogs]);

  const sidebar = useMemo(() => {
    const featuredIds = new Set(featured.map((post) => post.id));
    const society = blogs.filter(
      (blog) => blog.category === "Society" && !featuredIds.has(blog.id),
    );
    const fallback = blogs.filter(
      (blog) => !featuredIds.has(blog.id) && !society.some((post) => post.id === blog.id),
    );
    return [...society, ...fallback].slice(0, 4);
  }, [blogs, featured]);

  const dynamicTopics = useMemo(() => {
    // Group all blogs by topicLabel
    const counts: Record<string, BlogPost[]> = {};
    for (const b of blogs) {
      if (!b.topicLabel) continue;
      const label = b.topicLabel;
      if (!counts[label]) counts[label] = [];
      counts[label]!.push(b);
    }

    // Sort by number of posts descending
    const sortedLabels = Object.keys(counts).sort(
      (a, b) => (counts[b]?.length ?? 0) - (counts[a]?.length ?? 0)
    );

    // Take top 3 topics
    const top3 = sortedLabels.slice(0, 3);
    const tones: ("cream" | "lavender" | "dark")[] = ["cream", "lavender", "dark"];

    return top3.map((label, idx) => ({
      key: label,
      label: label,
      tone: tones[idx],
      posts: (counts[label] ?? []).slice(0, 3), // max 3 posts per card
    })) as BlogTopic[];
  }, [blogs]);

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
        <div className="mb-6 flex items-end justify-between" id="topics">
          <h2 className="text-xs font-extrabold uppercase tracking-[0.22em] text-accent">
            Browse topics
          </h2>
        </div>

        {/* ── Topic cards row ──────────────────────────────────── */}
        <section className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {dynamicTopics.length > 0 ? (
            dynamicTopics.map((topic, i) => (
              <TopicCard key={topic.key} topic={topic} index={i} />
            ))
          ) : (
            <p className="text-sm text-muted-foreground col-span-full">No topics found yet.</p>
          )}
        </section>

        {/* ── Complete archive: preserve the editorial shell while making every story discoverable ── */}
        <CompleteArchive blogs={blogs} />
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
                  className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground"
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

function PixelGrid({ grid, size }: { grid: string[][]; size: number }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${grid[0]?.length ?? 0}, ${size}px)`,
        gap: 0,
        lineHeight: 0,
      }}
    >
      {grid.flat().map((color, i) => (
        <div
          key={i}
          style={{
            width: size,
            height: size,
            backgroundColor: color,
            imageRendering: "pixelated",
          }}
        />
      ))}
    </div>
  );
}

const HEAD: string[][] = [
  ['#00629B','#00629B','#00629B','#00629B','#00629B','#00629B','#00629B','#00629B'],
  ['#00629B','#0099D6','#0099D6','#0099D6','#0099D6','#0099D6','#0099D6','#00629B'],
  ['#00629B','#f5d5b8','#f5d5b8','#f5d5b8','#f5d5b8','#f5d5b8','#f5d5b8','#00629B'],
  ['#f5d5b8','#f5d5b8','#ffffff','#0099D6','#0099D6','#ffffff','#f5d5b8','#f5d5b8'],
  ['#f5d5b8','#f5d5b8','#f5d5b8','#e8c4a0','#e8c4a0','#f5d5b8','#f5d5b8','#f5d5b8'],
  ['#f5d5b8','#f5d5b8','#f5d5b8','#f5d5b8','#f5d5b8','#f5d5b8','#f5d5b8','#f5d5b8'],
  ['#f5d5b8','#e8c4a0','#e8c4a0','#e8c4a0','#e8c4a0','#e8c4a0','#e8c4a0','#f5d5b8'],
  ['transparent','#f5d5b8','#f5d5b8','#f5d5b8','#f5d5b8','#f5d5b8','#f5d5b8','transparent'],
];

/* Split body — column 0 = left arm, cols 1-6 = torso, col 7 = right arm */
const BODY_LEFT_COL: string[][] = [
  ['transparent'],['transparent'],['#f5d5b8'],['#f5d5b8'],
  ['transparent'],['transparent'],['transparent'],['transparent'],
];
const BODY_CENTER: string[][] = [
  ['#004a7c','#00629B','#00629B','#00629B','#00629B','#004a7c'],
  ['#004a7c','#00629B','#ffffff','#ffffff','#00629B','#004a7c'],
  ['#004a7c','#00629B','#00629B','#00629B','#00629B','#004a7c'],
  ['#004a7c','#004a7c','#0099D6','#0099D6','#004a7c','#004a7c'],
  ['#004a7c','#004a7c','#00629B','#00629B','#004a7c','#004a7c'],
  ['#2c3e50','#2c3e50','#2c3e50','#2c3e50','#2c3e50','#2c3e50'],
  ['#2c3e50','#2c3e50','transparent','transparent','#2c3e50','#2c3e50'],
  ['#1a252f','#1a252f','transparent','transparent','#1a252f','#1a252f'],
];
const BODY_RIGHT_COL: string[][] = [
  ['transparent'],['transparent'],['#f5d5b8'],['#f5d5b8'],
  ['transparent'],['transparent'],['transparent'],['transparent'],
];

function MascotScribble() {
  return (
    <div className="hidden sm:block">
      {/* Head — full 8 columns */}
      <PixelGrid grid={HEAD} size={4} />
      {/* Body — left arm + torso stacked, right arm animated separately */}
      <div style={{ display: "flex" }}>
        <PixelGrid grid={BODY_LEFT_COL} size={4} />
        <PixelGrid grid={BODY_CENTER} size={4} />
        <motion.div
          animate={{ rotate: [0, 0, -24, -12, -24, -12, -24, 0, 0] }}
          transition={{
            duration: 10,
            repeat: Infinity,
            ease: "easeInOut",
            times: [0, 0.15, 0.3, 0.4, 0.5, 0.6, 0.7, 0.85, 1],
          }}
          style={{ transformOrigin: "2px 10px" }}
        >
          <PixelGrid grid={BODY_RIGHT_COL} size={4} />
        </motion.div>
      </div>
    </div>
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
            to={`/blog/${post.slug }`}
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
                  to={`/blog/${p.slug }`}
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

      <button
        type="button"
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        className="mt-6 inline-flex items-center justify-center gap-2 self-start rounded-full bg-foreground px-5 py-2.5 text-xs font-bold uppercase tracking-[0.18em] text-background transition-transform hover:scale-[1.02] active:scale-95"
      >
        Back to top
        <ArrowRight className="h-3.5 w-3.5 -rotate-90" />
      </button>
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
                to={`/blog/${p.slug }`}
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

const ARCHIVE_CATEGORIES = ["All", "IEEE", "Society", "Event"] as const;
type ArchiveCategory = (typeof ARCHIVE_CATEGORIES)[number];

function formatArchiveDate(value?: string) {
  return value ? formatDateShort(value) : "";
}

function CompleteArchive({ blogs }: { blogs: BlogPost[] }) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<ArchiveCategory>("All");
  const [topic, setTopic] = useState("All topics");

  const topics = useMemo(
    () => [
      "All topics",
      ...Array.from(
        new Set(
          blogs
            .map((blog) => blog.topicLabel?.trim())
            .filter((label): label is string => Boolean(label)),
        ),
      ).sort((a, b) => a.localeCompare(b)),
    ],
    [blogs],
  );

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return blogs.filter((blog) => {
      const author =
        typeof blog.author === "string" ? blog.author : blog.author?.name || "IEEE Sahrdaya";
      const matchesCategory = category === "All" || blog.category === category;
      const matchesTopic = topic === "All topics" || blog.topicLabel === topic;
      const matchesSearch =
        !needle ||
        [blog.title, blog.excerpt, blog.topicLabel, blog.category, author]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(needle));
      return matchesCategory && matchesTopic && matchesSearch;
    });
  }, [blogs, category, search, topic]);

  if (blogs.length === 0) return null;

  return (
    <section id="all-stories" className="mt-16 border-t border-border pt-10">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[0.28em] text-accent">
            Complete archive
          </p>
          <h2 className="mt-2 font-display text-4xl tracking-tight text-foreground sm:text-5xl">
            All Stories
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Featured placement can change, but every published IEEE Sahrdaya story stays available here.
          </p>
        </div>
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          {filtered.length} of {blogs.length} {blogs.length === 1 ? "story" : "stories"}
        </div>
      </div>

      <div className="mt-7 grid gap-3 border-y border-border/70 py-5 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-center">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search title, topic or author"
            aria-label="Search blog stories"
            className="h-11 w-full rounded-full border border-border bg-background/80 pl-11 pr-4 text-sm outline-none transition focus:border-accent/50 focus:ring-4 focus:ring-accent/10"
          />
        </label>

        <div className="flex flex-wrap gap-2">
          {ARCHIVE_CATEGORIES.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setCategory(option)}
              aria-pressed={category === option}
              className={cn(
                "rounded-full px-4 py-2 text-[10px] font-extrabold uppercase tracking-[0.16em] transition",
                category === option
                  ? "bg-foreground text-background"
                  : "border border-border bg-background/70 text-muted-foreground hover:text-foreground",
              )}
            >
              {option}
            </button>
          ))}
        </div>

        <select
          value={topic}
          onChange={(event) => setTopic(event.target.value)}
          aria-label="Filter blog stories by topic"
          className="h-10 rounded-full border border-border bg-background/80 px-4 text-[10px] font-extrabold uppercase tracking-[0.14em] text-foreground outline-none focus:border-accent/50"
        >
          {topics.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>

      {filtered.length > 0 ? (
        <div className="mt-8 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((post, index) => (
            <ArchiveStoryCard key={post.id} post={post} index={index} />
          ))}
        </div>
      ) : (
        <div className="mt-8 rounded-2xl border border-dashed border-border px-6 py-16 text-center">
          <p className="font-display text-2xl text-foreground">No matching stories</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Try another search term, category, or topic.
          </p>
        </div>
      )}
    </section>
  );
}

function ArchiveStoryCard({ post, index }: { post: BlogPost; index: number }) {
  const author =
    typeof post.author === "string" ? post.author : post.author?.name || "IEEE Sahrdaya";
  const published = formatArchiveDate(post.publishedAt);

  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: Math.min(index, 6) * 0.04 }}
      className="group"
    >
      <Link to={`/blog/${post.slug}`} className="block">
        <div className="relative aspect-[16/10] overflow-hidden rounded-2xl border border-border bg-muted shadow-sm">
          {post.coverUrl ? (
            <img
              src={post.coverUrl}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
            />
          ) : (
            <div className="grid h-full place-items-center bg-accent/10 font-pixel text-2xl text-accent">
              IEEE
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/60 to-transparent" />
          <span className="absolute bottom-3 left-3 rounded-full bg-background/90 px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-[0.16em] text-foreground backdrop-blur-sm">
            {post.topicLabel || post.category || "Story"}
          </span>
        </div>

        <div className="pt-4">
          <div className="flex items-start justify-between gap-4">
            <h3 className="text-balance text-xl font-extrabold leading-tight text-foreground transition-colors group-hover:text-accent">
              {post.title}
            </h3>
            <ArrowUpRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-accent" />
          </div>
          {post.excerpt ? (
            <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
              {post.excerpt}
            </p>
          ) : null}
          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border/70 pt-3 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
            <span className="text-foreground/80">{author}</span>
            {published ? <span>{published}</span> : null}
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" /> {post.readMinutes || 1} min
            </span>
          </div>
        </div>
      </Link>
    </motion.article>
  );
}
