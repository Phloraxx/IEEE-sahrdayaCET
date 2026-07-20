"use client";

import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Clock,
  Search,
  Sparkles,
} from "lucide-react";
import { motion } from "framer-motion";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import type { BlogPost } from "@/types";
import { cn } from "@/lib/utils";

const CATEGORY_OPTIONS = ["All", "IEEE", "Society", "Event"] as const;

type CategoryFilter = (typeof CATEGORY_OPTIONS)[number];

function formatDate(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function authorName(post: BlogPost) {
  return typeof post.author === "string"
    ? post.author
    : post.author?.name || "IEEE Sahrdaya";
}

function BlogImage({ post, className }: { post: BlogPost; className?: string }) {
  if (post.coverUrl) {
    return (
      <img
        src={post.coverUrl}
        alt=""
        loading="lazy"
        className={cn("h-full w-full object-cover", className)}
      />
    );
  }

  return (
    <div
      className={cn(
        "flex h-full w-full items-center justify-center bg-linear-to-br from-ieee-blue/20 via-sky-100 to-background text-ieee-blue",
        className,
      )}
    >
      <span className="font-pixel text-2xl sm:text-3xl">IEEE</span>
    </div>
  );
}

function Meta({ post, light = false }: { post: BlogPost; light?: boolean }) {
  const date = formatDate(post.publishedAt);
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-medium",
        light ? "text-white/75" : "text-muted-foreground",
      )}
    >
      {date ? <span>{date}</span> : null}
      <span className="inline-flex items-center gap-1">
        <Clock className="h-3 w-3" /> {post.readMinutes || 1} min read
      </span>
      <span>{authorName(post)}</span>
    </div>
  );
}

function FeaturedStory({ post }: { post: BlogPost }) {
  return (
    <Link
      to="/blog/$slug/"
      params={{ slug: post.slug }}
      className="group relative min-h-[440px] overflow-hidden rounded-[2rem] bg-slate-900 shadow-2xl shadow-slate-900/10 sm:min-h-[520px]"
    >
      <BlogImage
        post={post}
        className="absolute inset-0 transition duration-700 group-hover:scale-[1.04]"
      />
      <div className="absolute inset-0 bg-linear-to-t from-black via-black/35 to-black/5" />
      <div className="absolute inset-x-0 bottom-0 p-6 sm:p-9">
        <div className="mb-4 flex items-center justify-between gap-4">
          <span className="rounded-full bg-white/15 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-white backdrop-blur-md ring-1 ring-white/20">
            {post.topicLabel || post.category || "Featured"}
          </span>
          <span className="grid h-11 w-11 place-items-center rounded-full bg-white text-slate-950 transition group-hover:scale-110">
            <ArrowUpRight className="h-5 w-5" />
          </span>
        </div>
        <h2 className="max-w-3xl text-balance text-3xl font-black leading-[1.02] text-white sm:text-5xl">
          {post.title}
        </h2>
        {post.excerpt ? (
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/80 sm:text-base">
            {post.excerpt}
          </p>
        ) : null}
        <div className="mt-5">
          <Meta post={post} light />
        </div>
      </div>
    </Link>
  );
}

function CompactStory({ post }: { post: BlogPost }) {
  return (
    <Link
      to="/blog/$slug/"
      params={{ slug: post.slug }}
      className="group grid grid-cols-[112px_1fr] gap-4 rounded-2xl border border-border bg-card p-3 transition hover:border-ieee-blue/30 hover:shadow-lg sm:grid-cols-[140px_1fr]"
    >
      <div className="aspect-square overflow-hidden rounded-xl bg-muted">
        <BlogImage post={post} className="transition duration-500 group-hover:scale-105" />
      </div>
      <div className="min-w-0 py-1">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ieee-blue">
          {post.topicLabel || post.category || "Story"}
        </p>
        <h3 className="mt-2 line-clamp-2 text-lg font-bold leading-tight text-foreground transition-colors group-hover:text-ieee-blue">
          {post.title}
        </h3>
        <div className="mt-3">
          <Meta post={post} />
        </div>
      </div>
    </Link>
  );
}

function StoryCard({ post }: { post: BlogPost }) {
  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="group overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition hover:-translate-y-1 hover:shadow-xl"
    >
      <Link to="/blog/$slug/" params={{ slug: post.slug }} className="block">
        <div className="aspect-[16/10] overflow-hidden bg-muted">
          <BlogImage post={post} className="transition duration-500 group-hover:scale-105" />
        </div>
        <div className="p-5">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-ieee-blue">
              {post.topicLabel || post.category || "Story"}
            </span>
            <ArrowUpRight className="h-4 w-4 text-muted-foreground transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-ieee-blue" />
          </div>
          <h3 className="mt-3 line-clamp-2 text-xl font-bold leading-tight text-foreground">
            {post.title}
          </h3>
          {post.excerpt ? (
            <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-muted-foreground">
              {post.excerpt}
            </p>
          ) : null}
          <div className="mt-5 border-t border-border pt-4">
            <Meta post={post} />
          </div>
        </div>
      </Link>
    </motion.article>
  );
}

export default function BlogClientV2({ blogs = [] }: { blogs?: BlogPost[] }) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<CategoryFilter>("All");
  const [topic, setTopic] = useState("All topics");

  const topics = useMemo(
    () => [
      "All topics",
      ...Array.from(
        new Set(blogs.map((blog) => blog.topicLabel?.trim()).filter(Boolean) as string[]),
      ).sort((a, b) => a.localeCompare(b)),
    ],
    [blogs],
  );

  const featured = useMemo(
    () => blogs.find((blog) => blog.category === "IEEE") || blogs[0] || null,
    [blogs],
  );

  const secondary = useMemo(
    () => blogs.filter((blog) => blog.id !== featured?.id).slice(0, 2),
    [blogs, featured],
  );

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return blogs.filter((blog) => {
      const matchesCategory = category === "All" || blog.category === category;
      const matchesTopic = topic === "All topics" || blog.topicLabel === topic;
      const matchesSearch =
        !needle ||
        [blog.title, blog.excerpt, blog.topicLabel, blog.category, authorName(blog)]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(needle));
      return matchesCategory && matchesTopic && matchesSearch;
    });
  }, [blogs, category, search, topic]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />
      <main className="mx-auto w-full max-w-[1400px] px-4 pb-24 pt-28 sm:px-6 lg:px-10">
        <section className="border-b border-border pb-10">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-4xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-ieee-blue/15 bg-ieee-blue/5 px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.24em] text-ieee-blue">
                <Sparkles className="h-3.5 w-3.5" /> IEEE Sahrdaya Editorial
              </div>
              <h1 className="mt-5 text-balance font-display text-6xl leading-[0.86] tracking-tight sm:text-8xl lg:text-[9rem]">
                THE BLOG
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                Event recaps, technical deep-dives and stories from the people building the IEEE Sahrdaya community.
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-card px-5 py-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                Published archive
              </p>
              <p className="mt-1 text-3xl font-black text-foreground">{blogs.length}</p>
              <p className="text-xs text-muted-foreground">{blogs.length === 1 ? "story" : "stories"} available</p>
            </div>
          </div>
        </section>

        {featured ? (
          <section className="grid gap-5 py-10 lg:grid-cols-[minmax(0,2fr)_minmax(320px,0.8fr)]">
            <FeaturedStory post={featured} />
            <div className="flex flex-col gap-5">
              {secondary.map((post) => (
                <CompactStory key={post.id} post={post} />
              ))}
              <div className="flex flex-1 flex-col justify-between rounded-2xl border border-dashed border-border bg-muted/30 p-6">
                <BookOpen className="h-7 w-7 text-ieee-blue" />
                <div className="mt-8">
                  <h3 className="text-xl font-bold">Everything stays discoverable.</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    Featured placement changes, but every published story remains in the complete archive below.
                  </p>
                </div>
              </div>
            </div>
          </section>
        ) : (
          <section className="py-24 text-center">
            <BookOpen className="mx-auto h-10 w-10 text-muted-foreground" />
            <h2 className="mt-4 text-2xl font-bold">No published stories yet</h2>
            <p className="mt-2 text-sm text-muted-foreground">Published posts will appear here automatically.</p>
          </section>
        )}

        {blogs.length > 0 && (
          <section id="all-stories" className="border-t border-border pt-10">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-[0.26em] text-ieee-blue">Browse the archive</p>
                <h2 className="mt-2 text-4xl font-black tracking-tight">All stories</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Search or filter without losing access to older published posts.
                </p>
              </div>
              <div className="relative w-full max-w-md">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search title, topic or author"
                  className="h-12 w-full rounded-full border border-border bg-card pl-11 pr-4 text-sm outline-none transition focus:border-ieee-blue/40 focus:ring-4 focus:ring-ieee-blue/10"
                />
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-4 border-y border-border py-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap gap-2">
                {CATEGORY_OPTIONS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setCategory(option)}
                    className={cn(
                      "rounded-full px-4 py-2 text-xs font-bold transition",
                      category === option
                        ? "bg-foreground text-background"
                        : "border border-border bg-card text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {option}
                  </button>
                ))}
              </div>
              <select
                value={topic}
                onChange={(event) => setTopic(event.target.value)}
                className="h-10 rounded-full border border-border bg-card px-4 text-xs font-bold text-foreground outline-none focus:border-ieee-blue/40"
                aria-label="Filter by topic"
              >
                {topics.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-5 flex items-center justify-between text-xs text-muted-foreground">
              <span>{filtered.length} {filtered.length === 1 ? "story" : "stories"}</span>
              {(search || category !== "All" || topic !== "All topics") && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch("");
                    setCategory("All");
                    setTopic("All topics");
                  }}
                  className="font-bold text-ieee-blue hover:underline"
                >
                  Clear filters
                </button>
              )}
            </div>

            {filtered.length > 0 ? (
              <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {filtered.map((post) => (
                  <StoryCard key={post.id} post={post} />
                ))}
              </div>
            ) : (
              <div className="mt-8 rounded-3xl border border-dashed border-border bg-muted/30 px-6 py-16 text-center">
                <Search className="mx-auto h-8 w-8 text-muted-foreground" />
                <h3 className="mt-4 text-xl font-bold">No matching stories</h3>
                <p className="mt-2 text-sm text-muted-foreground">Try a broader search or clear your filters.</p>
              </div>
            )}
          </section>
        )}

        <section className="mt-16 overflow-hidden rounded-[2rem] bg-slate-950 px-6 py-10 text-white sm:px-10 sm:py-12">
          <div className="flex flex-col gap-8 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.26em] text-sky-300">Keep exploring</p>
              <h2 className="mt-3 max-w-xl text-3xl font-black tracking-tight sm:text-4xl">Read the story. Then join the next one.</h2>
              <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/65">Discover upcoming workshops, competitions and community events happening across IEEE Sahrdaya.</p>
            </div>
            <Link
              to="/events"
              className="inline-flex h-12 items-center justify-center gap-2 self-start rounded-full bg-white px-6 text-xs font-bold uppercase tracking-[0.16em] text-slate-950 transition hover:scale-[1.02] md:self-auto"
            >
              Explore events <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
