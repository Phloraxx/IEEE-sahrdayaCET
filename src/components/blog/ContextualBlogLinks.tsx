"use client";

import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router";
import { ArrowRight } from "lucide-react";
import {
  RelatedBlogCards,
  type RelatedBlogSummary,
} from "@/components/blog/RelatedBlogCards";

function getContext(pathname: string) {
  if (pathname === "/") {
    return {
      title: "Latest from the blog",
      eyebrow: "Stories from the branch",
      description:
        "Fresh recaps, technical writing and community stories from IEEE Sahrdaya.",
      query: "limit=3",
    };
  }

  const match = pathname.match(/^\/societies\/([^/]+)\/?$/i);
  if (match?.[1]) {
    return {
      title: "Stories from this society",
      eyebrow: "Read more",
      description:
        "Articles, recaps and updates connected to this IEEE Sahrdaya society.",
      query: `societySlug=${encodeURIComponent(match[1])}&limit=3`,
    };
  }

  return null;
}

export function ContextualBlogLinks() {
  const location = useLocation();
  const context = useMemo(() => getContext(location.pathname), [location.pathname]);
  const [blogs, setBlogs] = useState<RelatedBlogSummary[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!context) {
      setBlogs([]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    let active = true;
    setBlogs([]);
    setLoading(true);

    fetch(`/api/blogs/related?${context.query}`, {
      signal: controller.signal,
      credentials: "same-origin",
    })
      .then((response) => (response.ok ? response.json() : { items: [] }))
      .then((data) => {
        if (active) setBlogs(Array.isArray(data.items) ? data.items : []);
      })
      .catch((error) => {
        if (active && error?.name !== "AbortError") setBlogs([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [context]);

  if (!context || (!loading && blogs.length === 0)) return null;

  return (
    <section className="relative z-20 border-t border-border bg-background px-4 py-16 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.28em] text-ieee-blue">
              {context.eyebrow}
            </p>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-foreground sm:text-4xl">
              {context.title}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              {context.description}
            </p>
          </div>
          <Link
            to="/blog/"
            className="inline-flex items-center gap-2 self-start rounded-full border border-border bg-card px-4 py-2 text-xs font-bold uppercase tracking-[0.15em] text-foreground transition hover:border-ieee-blue/40 hover:text-ieee-blue sm:self-auto"
          >
            View all stories <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {loading && blogs.length === 0 ? (
          <div className="grid gap-4 md:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                key={index}
                className="h-64 animate-pulse rounded-2xl border border-border bg-muted"
              />
            ))}
          </div>
        ) : (
          <RelatedBlogCards blogs={blogs} />
        )}
      </div>
    </section>
  );
}
