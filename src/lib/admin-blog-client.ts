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
import { getWorkspaceMe } from "@/lib/data/workspace.client";
import type { WorkspaceMe } from "@/lib/workspace-permissions";

async function requireEditorRole() {
  const pb = getPbClient();
  if (!pb.authStore.isValid) throw new Error("Blog editor access required");
  const workspace = await getWorkspaceMe();
  if (!workspace.capabilities.includes("content.manage")) throw new Error("Blog editor access required");
  return { pb, workspace };
}

function contentScopeFilter(workspace: WorkspaceMe): string {
  if (workspace.branchCapabilities.includes("content.manage")) return "";
  const societyRoles = new Set(["society_chair", "society_vice_chair", "society_secretary", "society_content"]);
  const eventRoles = new Set(["event_lead", "event_content"]);
  const societyIds = Array.from(new Set(workspace.assignments.filter((a) => a.active && a.scopeType === "society" && societyRoles.has(a.roleCode)).map((a) => a.societyId).filter(Boolean)));
  const eventIds = Array.from(new Set(workspace.assignments.filter((a) => a.active && a.scopeType === "event" && eventRoles.has(a.roleCode)).map((a) => a.eventId).filter(Boolean)));
  const clauses = [
    ...societyIds.map((id) => `society = ${escapeFilterValue(id)}`),
    ...eventIds.map((id) => `event = ${escapeFilterValue(id)}`),
  ];
  return clauses.length ? `(${clauses.join(" || ")})` : 'id = ""';
}

async function assertUniqueSlug(slug: string, excludedId?: string) {
  const { pb } = await requireEditorRole();
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
  const { pb, workspace } = await requireEditorRole();
  const scope = contentScopeFilter(workspace);
  const records = await pb.collection("blogs").getFullList({
    batch: 100,
    sort: "-updated,-published_at,-id",
    filter: scope || undefined,
    expand: "relation,society,event",
  });
  return records.map(mapBlogRecord);
}

export async function listSocietiesForBlog() {
  const { pb, workspace } = await requireEditorRole();
  const managed = workspace.branchCapabilities.includes("content.manage") ? [] : Array.from(new Set(workspace.assignments.filter((a) => a.active && a.scopeType === "society" && ["society_chair", "society_vice_chair", "society_secretary", "society_content"].includes(a.roleCode)).map((a) => a.societyId).filter(Boolean)));
  const filter = workspace.branchCapabilities.includes("content.manage") ? undefined : (managed.length ? managed.map((id) => `id = ${escapeFilterValue(id)}`).join(" || ") : 'id = ""');
  const records = await pb.collection("societies").getFullList({ sort: "name", fields: "id,name", filter });
  return records.map((record) => ({ id: record.id, name: String(record.name || "") }));
}

export async function listEventsForBlog() {
  const { pb, workspace } = await requireEditorRole();
  const scope = contentScopeFilter(workspace);
  const records = await pb.collection("events").getFullList({ sort: "-date", fields: "id,title", filter: scope || undefined });
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
  const { pb } = await requireEditorRole();
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
  const { pb } = await requireEditorRole();
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
  const { pb } = await requireEditorRole();
  await pb.collection("blogs").delete(id);
}
