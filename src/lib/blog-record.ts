import { getExpand, getField } from "@/lib/safe-get";
import { buildFileUrl } from "@/lib/pb";
import { sanitizeBlogCoverUrl, sanitizeBlogHtml } from "@/lib/blog-content";

export function mapBlogRecord(raw: Record<string, unknown>) {
  const expand = getExpand(raw);
  const authorRaw = expand?.relation;
  const societyRaw = expand?.society;
  const eventRaw = expand?.event;

  return {
    id: getField(raw, "id", ""),
    createdAt: getField(raw, "created", ""),
    updatedAt: getField(raw, "updated", ""),
    title: getField(raw, "title", ""),
    slug: getField(raw, "slug", ""),
    excerpt: getField(raw, "excerpt", ""),
    content: sanitizeBlogHtml(getField(raw, "content", "")),
    coverUrl: sanitizeBlogCoverUrl(getField(raw, "cover_url", "")),
    readMinutes: Number(getField(raw, "read_minutes", 0)) || 1,
    topicLabel: getField(raw, "topic_label", ""),
    category: getField(raw, "category", ""),
    publishedAt: getField(raw, "published_at", ""),
    published: !!getField(raw, "published", false),
    author: authorRaw
      ? {
          id: getField(authorRaw, "id", ""),
          name: getField(authorRaw, "name", ""),
          role: getField(authorRaw, "role", ""),
          photoUrl: getField(authorRaw, "avatar", "")
            ? buildFileUrl("users", getField(authorRaw, "id", ""), getField(authorRaw, "avatar", ""))
            : undefined,
        }
      : undefined,
    societyId: getField(raw, "society", ""),
    eventId: getField(raw, "event", ""),
    society: societyRaw
      ? {
          id: getField(societyRaw, "id", ""),
          name: getField(societyRaw, "name", ""),
          slug: getField(societyRaw, "slug", ""),
          logoUrl: getField(societyRaw, "logo", "")
            ? buildFileUrl("societies", getField(societyRaw, "id", ""), getField(societyRaw, "logo", ""))
            : undefined,
        }
      : undefined,
    event: eventRaw
      ? { id: getField(eventRaw, "id", ""), title: getField(eventRaw, "title", ""), slug: getField(eventRaw, "slug", "") }
      : undefined,
  };
}

/**
 * Map a SQLite `BlogRow` (see `src/server/public/repo.server.ts`) to the public
 * blog shape.
 *
 * Kept separate from `mapBlogRecord`, which reads PocketBase's `expand.*`
 * structure and is still used by the admin client until phase 4.
 */
export function mapBlogRow(row: {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string | null;
  cover_url: string | null;
  read_minutes: number | null;
  topic_label: string | null;
  published_at: string | null;
  published: number;
  category: string | null;
  society_id: string | null;
  event_id: string | null;
  created_at: string;
  updated_at: string;
  society_row_id: string | null;
  society_name: string | null;
  society_slug: string | null;
  society_logo: string | null;
  event_row_id: string | null;
  event_title: string | null;
  event_slug: string | null;
}) {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    title: row.title,
    slug: row.slug,
    excerpt: row.excerpt ?? "",
    content: sanitizeBlogHtml(row.content ?? ""),
    coverUrl: sanitizeBlogCoverUrl(row.cover_url ?? ""),
    readMinutes: Number(row.read_minutes) || 1,
    topicLabel: row.topic_label ?? "",
    category: row.category ?? "",
    publishedAt: row.published_at ?? "",
    published: row.published === 1,
    // Always undefined on the public path: PocketBase's users rule hides the
    // author from anonymous readers, and the page falls back to "IEEE Sahrdaya".
    author: undefined,
    societyId: row.society_id ?? "",
    eventId: row.event_id ?? "",
    society:
      row.society_row_id && row.society_name
        ? {
            id: row.society_row_id,
            name: row.society_name,
            slug: row.society_slug ?? "",
            logoUrl: row.society_logo
              ? buildFileUrl("societies", row.society_row_id, row.society_logo)
              : undefined,
          }
        : undefined,
    event:
      row.event_row_id && row.event_title
        ? { id: row.event_row_id, title: row.event_title, slug: row.event_slug ?? "" }
        : undefined,
  };
}
