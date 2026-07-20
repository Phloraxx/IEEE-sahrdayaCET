import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Clock } from "lucide-react";

export interface RelatedBlogSummary {
  id: string;
  title: string;
  slug: string;
  excerpt?: string;
  coverUrl?: string;
  topicLabel?: string;
  category?: string;
  publishedAt?: string;
  readMinutes?: number;
}

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

export function RelatedBlogCards({
  blogs,
  compact = false,
}: {
  blogs: RelatedBlogSummary[];
  compact?: boolean;
}) {
  return (
    <div className={`grid gap-4 ${compact ? "sm:grid-cols-2" : "md:grid-cols-3"}`}>
      {blogs.map((blog) => (
        <Link
          key={blog.id}
          to="/blog/$slug/"
          params={{ slug: blog.slug }}
          className="group overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
        >
          <div className={`${compact ? "aspect-[16/8]" : "aspect-[16/9]"} overflow-hidden bg-muted`}>
            {blog.coverUrl ? (
              <img
                src={blog.coverUrl}
                alt=""
                loading="lazy"
                className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
              />
            ) : (
              <div className="flex h-full items-center justify-center bg-linear-to-br from-ieee-blue/15 via-sky-100 to-background text-ieee-blue">
                <span className="font-pixel text-xl">IEEE</span>
              </div>
            )}
          </div>
          <div className="p-4">
            <div className="mb-2 flex items-center justify-between gap-3 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
              <span>{blog.topicLabel || blog.category || "Story"}</span>
              <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </div>
            <h3 className="line-clamp-2 text-base font-bold leading-tight text-foreground">
              {blog.title}
            </h3>
            {blog.excerpt ? (
              <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                {blog.excerpt}
              </p>
            ) : null}
            <div className="mt-4 flex items-center gap-3 text-xs text-muted-foreground">
              {formatDate(blog.publishedAt) ? <span>{formatDate(blog.publishedAt)}</span> : null}
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" /> {blog.readMinutes || 1} min
              </span>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
