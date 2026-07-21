import { createFileRoute } from "@tanstack/react-router";
import { createPublicPB } from "@/lib/pb.server";
import { escapeFilterValue } from "@/lib/pb";
import { getField } from "@/lib/safe-get";

function mapSummary(raw: Record<string, unknown>) {
  return {
    id: getField(raw, "id", ""),
    title: getField(raw, "title", ""),
    slug: getField(raw, "slug", ""),
    excerpt: getField(raw, "excerpt", ""),
    coverUrl: getField(raw, "cover_url", ""),
    topicLabel: getField(raw, "topic_label", ""),
    category: getField(raw, "category", ""),
    publishedAt: getField(raw, "published_at", ""),
    readMinutes: Number(getField(raw, "read_minutes", 0)) || 1,
  };
}

export const Route = createFileRoute("/api/blogs/related")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const societySlug = url.searchParams.get("societySlug")?.trim() || "";
        const eventId = url.searchParams.get("eventId")?.trim() || "";
        const requestedLimit = Number(url.searchParams.get("limit") || 3);
        const limit = Math.min(6, Math.max(1, Number.isFinite(requestedLimit) ? requestedLimit : 3));
        const pb = createPublicPB();

        let relationFilter = "";
        if (eventId) {
          relationFilter = `event = ${escapeFilterValue(eventId)}`;
        } else if (societySlug) {
          const society = await pb
            .collection("societies")
            .getFirstListItem(`slug = ${escapeFilterValue(societySlug.toLowerCase())}`, {
              fields: "id",
            })
            .catch(() => null);
          if (!society) {
            return Response.json({ items: [] }, { status: 200 });
          }
          relationFilter = `society = ${escapeFilterValue(society.id)}`;
        }

        const filter = relationFilter
          ? `published = true && ${relationFilter}`
          : "published = true";

        const result = await pb.collection("blogs").getList(1, limit, {
          filter,
          sort: "-published_at,-created",
          fields:
            "id,title,slug,excerpt,cover_url,topic_label,category,published_at,read_minutes",
          skipTotal: true,
        });

        return Response.json(
          { items: result.items.map((item) => mapSummary(item)) },
          {
            headers: {
              "Cache-Control": "no-cache, must-revalidate",
            },
          },
        );
      },
    },
  },
});