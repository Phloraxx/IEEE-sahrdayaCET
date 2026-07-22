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
      ? { id: getField(eventRaw, "id", ""), title: getField(eventRaw, "title", "") }
      : undefined,
  };
}
