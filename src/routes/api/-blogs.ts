import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { createPB } from "@/lib/pb.server";
import { authenticateAdmin, type AdminContext } from "@/lib/admin-middleware";
import { requireRole } from "@/lib/auth";
import { getField, getExpand } from "@/lib/safe-get";
import { buildFileUrl, escapeFilterValue } from "@/lib/pb";
import {
  estimateBlogReadMinutes,
  hasReadableBlogContent,
  normalizeBlogSlug,
  resolveBlogPublishedAt,
  sanitizeBlogHtml,
} from "@/lib/blog-content";
import { z } from "zod";

function getPB() {
  const cookie = getRequestHeader("cookie") || "";
  return createPB(cookie);
}

async function requireBlogEditor(ctx: AdminContext) {
  await requireRole(["admin", "content"], ctx.pb);
}

function assertPublishableContent(content: string) {
  if (!hasReadableBlogContent(content)) {
    throw new Error("Add article content before publishing this post");
  }
}

async function assertUniqueBlogSlug(
  pb: AdminContext["pb"],
  slug: string,
  excludedId?: string,
) {
  const filter = [
    `slug = ${escapeFilterValue(slug)}`,
    excludedId ? `id != ${escapeFilterValue(excludedId)}` : "",
  ]
    .filter(Boolean)
    .join(" && ");

  const result = await pb.collection("blogs").getList(1, 1, {
    filter,
    fields: "id",
    skipTotal: true,
  });

  if (result.items.length > 0) {
    throw new Error("A blog post with this slug already exists");
  }
}

export const checkBlogEditorAccess = createServerFn().handler(async () => {
  const pb = getPB();
  await requireRole(["admin", "content"], pb);
  return { ok: true };
});

export function mapBlog(raw: Record<string, unknown>) {
  const expand = getExpand(raw);
  const authorRaw = expand?.relation;

  let author:
    | { id: string; name: string; role: string; photoUrl?: string }
    | undefined;
  if (authorRaw) {
    author = {
      id: getField(authorRaw, "id", ""),
      name: getField(authorRaw, "name", ""),
      role: getField(authorRaw, "role", ""),
      photoUrl: getField(authorRaw, "avatar", "")
        ? buildFileUrl(
            "users",
            getField(authorRaw, "id", ""),
            getField(authorRaw, "avatar", ""),
          )
        : undefined,
    };
  }

  const societyRaw = expand?.society;
  let society:
    | { id: string; name: string; slug: string; logoUrl?: string }
    | undefined;
  if (societyRaw) {
    society = {
      id: getField(societyRaw, "id", ""),
      name: getField(societyRaw, "name", ""),
      slug: getField(societyRaw, "slug", ""),
      logoUrl: getField(societyRaw, "logo", "")
        ? buildFileUrl(
            "societies",
            getField(societyRaw, "id", ""),
            getField(societyRaw, "logo", ""),
          )
        : undefined,
    };
  }

  const eventRaw = expand?.event;
  const event = eventRaw
    ? {
        id: getField(eventRaw, "id", ""),
        title: getField(eventRaw, "title", ""),
      }
    : undefined;

  return {
    id: getField(raw, "id", ""),
    createdAt: getField(raw, "created", ""),
    updatedAt: getField(raw, "updated", ""),
    title: getField(raw, "title", ""),
    slug: getField(raw, "slug", ""),
    excerpt: getField(raw, "excerpt", ""),
    content: sanitizeBlogHtml(getField(raw, "content", "")),
    coverUrl: getField(raw, "cover_url", ""),
    readMinutes: Number(getField(raw, "read_minutes", 0)) || 1,
    topicLabel: getField(raw, "topic_label", ""),
    category: getField(raw, "category", ""),
    publishedAt: getField(raw, "published_at", ""),
    published: !!getField(raw, "published", false),
    author,
    societyId: getField(raw, "society", ""),
    eventId: getField(raw, "event", ""),
    society,
    event,
  };
}

export const getPublishedBlogs = createServerFn({ method: "GET" }).handler(
  async () => {
    try {
      const pb = getPB();
      const records = await pb.collection("blogs").getFullList({
        batch: 100,
        filter: "published = true",
        sort: "-published_at",
        expand: "relation,society,event",
      });
      return records.map(mapBlog);
    } catch (err) {
      console.error("Failed to fetch published blogs:", err);
      return [];
    }
  },
);

export const getBlogBySlug = createServerFn({ method: "GET" })
  .validator((slug: string) => slug)
  .handler(async ({ data: slug }) => {
    try {
      const pb = getPB();
      const result = await pb.collection("blogs").getFirstListItem(
        `slug = ${escapeFilterValue(slug)} && published = true`,
        { expand: "relation,society,event" },
      );
      return mapBlog(result);
    } catch (err) {
      console.error(`Failed to fetch blog by slug ${slug}:`, err);
      return null;
    }
  });

export const getAllBlogsAdmin = createServerFn({ method: "GET" }).handler(
  async () => {
    const ctx = await authenticateAdmin();
    await requireBlogEditor(ctx);
    const records = await ctx.pb.collection("blogs").getFullList({
      batch: 100,
      sort: "-updated",
      expand: "relation,society,event",
    });
    return records.map(mapBlog);
  },
);

const OptionalUrlSchema = z.union([z.literal(""), z.string().trim().url()]);

const BlogCreateSchema = z.object({
  title: z.string().trim().min(1),
  slug: z.string().trim().min(1),
  excerpt: z.string().optional(),
  content: z.string().optional(),
  topicLabel: z.string().optional(),
  category: z.enum(["IEEE", "Society", "Event"]).optional(),
  coverUrl: OptionalUrlSchema.optional(),
  readMinutes: z.number().int().min(1).max(240).optional(),
  published: z.boolean().optional(),
  societyId: z.string().optional(),
  eventId: z.string().optional(),
});

export const createBlog = createServerFn({ method: "POST" })
  .validator(BlogCreateSchema)
  .handler(async ({ data }) => {
    const ctx = await authenticateAdmin();
    await requireBlogEditor(ctx);

    const content = sanitizeBlogHtml(data.content);
    const published = data.published ?? false;
    if (published) assertPublishableContent(content);

    const slug = normalizeBlogSlug(data.slug) || normalizeBlogSlug(data.title);
    if (!slug) throw new Error("Blog slug must contain at least one letter or number");
    await assertUniqueBlogSlug(ctx.pb, slug);

    const publishedAt = resolveBlogPublishedAt({ nextPublished: published });

    const dbData: Record<string, unknown> = {
      title: data.title.trim(),
      slug,
      excerpt: data.excerpt?.trim() || "",
      content,
      topic_label: data.topicLabel?.trim() || "",
      category: data.category,
      cover_url: data.coverUrl?.trim() || "",
      read_minutes: data.readMinutes ?? estimateBlogReadMinutes(content),
      published,
      relation: ctx.userId,
      society: data.societyId || null,
      event: data.eventId || null,
    };
    if (publishedAt !== undefined) dbData.published_at = publishedAt;

    const record = await ctx.pb.collection("blogs").create(dbData);
    return mapBlog(record);
  });

const BlogUpdateSchema = BlogCreateSchema.partial().extend({
  id: z.string().min(1),
});

export const updateBlog = createServerFn({ method: "POST" })
  .validator(BlogUpdateSchema)
  .handler(async ({ data }) => {
    const ctx = await authenticateAdmin();
    await requireBlogEditor(ctx);
    const { id, ...updateData } = data;
    const existing = await ctx.pb.collection("blogs").getOne(id);
    const existingPublished = !!getField(existing, "published", false);
    const existingContent = sanitizeBlogHtml(getField(existing, "content", ""));

    const dbData: Record<string, unknown> = {};
    if (updateData.title !== undefined) dbData.title = updateData.title.trim();
    if (updateData.slug !== undefined) {
      const slug = normalizeBlogSlug(updateData.slug);
      if (!slug) throw new Error("Blog slug must contain at least one letter or number");
      await assertUniqueBlogSlug(ctx.pb, slug, id);
      dbData.slug = slug;
    }
    if (updateData.excerpt !== undefined) {
      dbData.excerpt = updateData.excerpt.trim();
    }

    let effectiveContent = existingContent;
    if (updateData.content !== undefined) {
      effectiveContent = sanitizeBlogHtml(updateData.content);
      dbData.content = effectiveContent;
      if (updateData.readMinutes === undefined) {
        dbData.read_minutes = estimateBlogReadMinutes(effectiveContent);
      }
    }
    if (updateData.topicLabel !== undefined) {
      dbData.topic_label = updateData.topicLabel.trim();
    }
    if (updateData.category !== undefined) dbData.category = updateData.category;
    if (updateData.coverUrl !== undefined) {
      dbData.cover_url = updateData.coverUrl.trim();
    }
    if (updateData.readMinutes !== undefined) {
      dbData.read_minutes = updateData.readMinutes;
    }
    if (updateData.published !== undefined) dbData.published = updateData.published;
    if (updateData.societyId !== undefined) {
      dbData.society = updateData.societyId || null;
    }
    if (updateData.eventId !== undefined) {
      dbData.event = updateData.eventId || null;
    }

    const effectivePublished = updateData.published ?? existingPublished;
    if (effectivePublished) assertPublishableContent(effectiveContent);

    const publishedAt = resolveBlogPublishedAt({
      nextPublished: updateData.published,
      existingPublished,
      existingPublishedAt: getField(existing, "published_at", ""),
    });
    if (publishedAt !== undefined) dbData.published_at = publishedAt;

    const record = await ctx.pb.collection("blogs").update(id, dbData);
    return mapBlog(record);
  });

export const deleteBlog = createServerFn({ method: "POST" })
  .validator((id: string) => id)
  .handler(async ({ data: id }) => {
    const ctx = await authenticateAdmin();
    await requireBlogEditor(ctx);
    await ctx.pb.collection("blogs").delete(id);
    return { success: true };
  });

export const getSocietiesForSelect = createServerFn({ method: "GET" }).handler(
  async () => {
    const ctx = await authenticateAdmin();
    await requireBlogEditor(ctx);
    const records = await ctx.pb.collection("societies").getFullList({
      batch: 100,
      sort: "name",
      fields: "id,name",
    });
    return records.map((s: Record<string, unknown>) => ({
      id: getField(s, "id", ""),
      name: getField(s, "name", ""),
    }));
  },
);

export const getEventsForSelect = createServerFn({ method: "GET" }).handler(
  async () => {
    const ctx = await authenticateAdmin();
    await requireBlogEditor(ctx);
    const records = await ctx.pb.collection("events").getFullList({
      batch: 100,
      sort: "-date",
      fields: "id,title",
    });
    return records.map((e: Record<string, unknown>) => ({
      id: getField(e, "id", ""),
      title: getField(e, "title", ""),
    }));
  },
);
