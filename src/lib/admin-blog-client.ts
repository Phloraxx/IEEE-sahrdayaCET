import type { BlogFormValues } from "@/components/admin/blog-form";
import { getPbClient } from "@/lib/pb-client";
import { escapeFilterValue } from "@/lib/pb";
import { mapBlogRecord } from "@/lib/blog-record";
import {
  estimateBlogReadMinutes,
  hasReadableBlogContent,
  normalizeBlogSlug,
  resolveBlogPublishedAt,
  sanitizeBlogCoverUrl,
  sanitizeBlogHtml,
} from "@/lib/blog-content";
import { getField } from "@/lib/safe-get";

function requireEditorRole() {
  const pb = getPbClient();
  const role = String(pb.authStore.record?.role || "");
  if (!pb.authStore.isValid || (role !== "admin" && role !== "content")) {
    throw new Error("Blog editor access required");
  }
  return pb;
}

async function assertUniqueSlug(slug: string, excludedId?: string) {
  const pb = requireEditorRole();
  const clauses = [`slug = ${escapeFilterValue(slug)}`];
  if (excludedId) clauses.push(`id != ${escapeFilterValue(excludedId)}`);
  const result = await pb.collection("blogs").getList(1, 1, {
    filter: clauses.join(" && "),
    fields: "id",
    skipTotal: true,
  });
  if (result.items.length) throw new Error("A blog post with this slug already exists");
}

export async function listAdminBlogs() {
  const pb = requireEditorRole();
  const records = await pb.collection("blogs").getFullList({
    batch: 100,
    sort: "-updated",
    expand: "relation,society,event",
  });
  return records.map(mapBlogRecord);
}

export async function listSocietiesForBlog() {
  const pb = requireEditorRole();
  const records = await pb.collection("societies").getFullList({ sort: "name", fields: "id,name" });
  return records.map((record) => ({ id: record.id, name: String(record.name || "") }));
}

export async function listEventsForBlog() {
  const pb = requireEditorRole();
  const records = await pb.collection("events").getFullList({ sort: "-date", fields: "id,title" });
  return records.map((record) => ({ id: record.id, title: String(record.title || "") }));
}

function prepareCommon(data: Partial<BlogFormValues>) {
  const dbData: Record<string, unknown> = {};
  if (data.title !== undefined) dbData.title = data.title.trim();
  if (data.excerpt !== undefined) dbData.excerpt = data.excerpt.trim();
  if (data.content !== undefined) {
    const content = sanitizeBlogHtml(data.content);
    dbData.content = content;
    if (data.readMinutes === undefined) dbData.read_minutes = estimateBlogReadMinutes(content);
  }
  if (data.topicLabel !== undefined) dbData.topic_label = data.topicLabel.trim();
  if (data.category !== undefined) dbData.category = data.category;
  if (data.coverUrl !== undefined) dbData.cover_url = sanitizeBlogCoverUrl(data.coverUrl);
  if (data.readMinutes !== undefined) dbData.read_minutes = data.readMinutes;
  if (data.published !== undefined) dbData.published = data.published;
  if (data.societyId !== undefined) dbData.society = data.societyId || null;
  if (data.eventId !== undefined) dbData.event = data.eventId || null;
  return dbData;
}

export async function createAdminBlog(data: BlogFormValues) {
  const pb = requireEditorRole();
  const content = sanitizeBlogHtml(data.content || "");
  if (data.published && !hasReadableBlogContent(content)) {
    throw new Error("Add article content before publishing this post");
  }
  const slug = normalizeBlogSlug(data.slug || data.title);
  if (!slug) throw new Error("Blog slug must contain at least one letter or number");
  await assertUniqueSlug(slug);

  const dbData = prepareCommon({ ...data, content });
  dbData.slug = slug;
  dbData.relation = pb.authStore.record?.id;
  const publishedAt = resolveBlogPublishedAt({ nextPublished: data.published });
  if (publishedAt !== undefined) dbData.published_at = publishedAt;

  const record = await pb.collection("blogs").create(dbData, { expand: "relation,society,event" });
  return mapBlogRecord(record);
}

export async function updateAdminBlog(id: string, data: Partial<BlogFormValues>) {
  const pb = requireEditorRole();
  const existing = await pb.collection("blogs").getOne(id);
  const existingPublished = !!getField(existing, "published", false);
  const existingContent = sanitizeBlogHtml(getField(existing, "content", ""));

  const dbData = prepareCommon(data);
  if (data.slug !== undefined) {
    const slug = normalizeBlogSlug(data.slug);
    if (!slug) throw new Error("Blog slug must contain at least one letter or number");
    await assertUniqueSlug(slug, id);
    dbData.slug = slug;
  }

  const effectiveContent = data.content !== undefined ? sanitizeBlogHtml(data.content) : existingContent;
  const effectivePublished = data.published ?? existingPublished;
  if (effectivePublished && !hasReadableBlogContent(effectiveContent)) {
    throw new Error("Add article content before publishing this post");
  }

  const publishedAt = resolveBlogPublishedAt({
    nextPublished: data.published,
    existingPublished,
    existingPublishedAt: getField(existing, "published_at", ""),
  });
  if (publishedAt !== undefined) dbData.published_at = publishedAt;

  const record = await pb.collection("blogs").update(id, dbData, { expand: "relation,society,event" });
  return mapBlogRecord(record);
}

export async function deleteAdminBlog(id: string) {
  const pb = requireEditorRole();
  await pb.collection("blogs").delete(id);
}
