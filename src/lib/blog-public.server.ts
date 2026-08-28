import { createPublicPB } from "@/lib/pb.server";
import { escapeFilterValue } from "@/lib/pb";
import { mapBlogRecord } from "@/lib/blog-record";

export async function getPublishedBlogs() {
  const pb = createPublicPB();
  const records = await pb.collection("blogs").getFullList({
    batch: 100,
    filter: "published = true",
    sort: "-published_at",
    expand: "relation,society,event",
  });
  return records.map(mapBlogRecord);
}

export async function getLatestPublishedBlogs(limit = 3) {
  const pb = createPublicPB();
  const perPage = Math.min(6, Math.max(1, Math.floor(limit)));
  const result = await pb.collection("blogs").getList(1, perPage, {
    filter: "published = true",
    sort: "-published_at",
    expand: "relation,society,event",
    skipTotal: true,
  });
  return result.items.map(mapBlogRecord);
}

export async function getBlogBySlug(slug: string) {
  const pb = createPublicPB();
  try {
    const record = await pb.collection("blogs").getFirstListItem(
      `slug = ${escapeFilterValue(slug)} && published = true`,
      { expand: "relation,society,event" },
    );
    return mapBlogRecord(record);
  } catch {
    return null;
  }
}
