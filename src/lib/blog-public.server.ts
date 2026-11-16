import { publicDataUnavailable } from "@/server/public/errors.server";
import {
  getPublishedBlogBySlug,
  listPublishedBlogs,
  listPublishedBlogsForSociety,
} from "@/server/public/repo.server";
import { mapBlogRow } from "@/lib/blog-record";

export async function getPublishedBlogs() {
  const rows = await listPublishedBlogs();
  return rows.map(mapBlogRow);
}

export async function getLatestPublishedBlogs(limit = 3) {
  const perPage = Math.min(6, Math.max(1, Math.floor(limit)));
  const rows = await listPublishedBlogs(perPage);
  return rows.map(mapBlogRow);
}

export async function getLatestPublishedBlogsForSociety(societyId: string, limit = 3) {
  const perPage = Math.min(6, Math.max(1, Math.floor(limit)));
  const rows = await listPublishedBlogsForSociety(societyId, perPage);
  return rows.map(mapBlogRow);
}

export async function getBlogBySlug(slug: string) {
  try {
    const row = await getPublishedBlogBySlug(slug);
    return row ? mapBlogRow(row) : null;
  } catch (error) {
    publicDataUnavailable("getBlogBySlug", error);
  }
}
