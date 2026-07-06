import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { createPB } from "@/lib/pb.server";
import { authenticateAdmin } from "@/lib/admin-middleware";
import { getField, getExpand } from "@/lib/safe-get";
import { buildFileUrl } from "@/lib/pb";
import { z } from "zod";

function getPB() {
  const cookie = getRequestHeader("cookie") || "";
  return createPB(cookie);
}

// Map PocketBase record to BlogPost interface
function mapBlog(raw: Record<string, unknown>) {
  const expand = getExpand(raw);
  const authorRaw = expand?.relation; // the relation field is named "relation" in PB
  
  let author: any = undefined;
  if (authorRaw) {
    author = {
      id: getField(authorRaw, 'id', ''),
      name: getField(authorRaw, 'name', ''),
      role: getField(authorRaw, 'role', ''),
      photoUrl: getField(authorRaw, 'avatar', '')
        ? buildFileUrl("users", getField(authorRaw, 'id', ''), getField(authorRaw, 'avatar', ''))
        : undefined,
    };
  }

  const societyRaw = expand?.society;
  let society: any = undefined;
  if (societyRaw) {
    society = {
      id: getField(societyRaw, 'id', ''),
      name: getField(societyRaw, 'name', ''),
      slug: getField(societyRaw, 'slug', ''),
      logoUrl: getField(societyRaw, 'logo', '') 
        ? buildFileUrl("societies", getField(societyRaw, 'id', ''), getField(societyRaw, 'logo', '')) 
        : undefined,
    };
  }

  const eventRaw = expand?.event;
  let event: any = undefined;
  if (eventRaw) {
    event = {
      id: getField(eventRaw, 'id', ''),
      title: getField(eventRaw, 'title', ''),
    };
  }

  return {
    id: getField(raw, 'id', ''),
    createdAt: getField(raw, 'created', ''),
    title: getField(raw, 'title', ''),
    slug: getField(raw, 'slug', ''),
    excerpt: getField(raw, 'excerpt', ''),
    content: getField(raw, 'content', ''),
    coverUrl: getField(raw, 'cover_url', ''), // text URL field
    readMinutes: Number(getField(raw, 'read_minutes', 0)),
    topicLabel: getField(raw, 'topic_label', ''),
    category: getField(raw, 'category', ''),
    publishedAt: getField(raw, 'published_at', ''),
    published: getField(raw, 'published', false),
    author,
    societyId: getField(raw, 'society', ''),
    eventId: getField(raw, 'event', ''),
    society,
    event,
  };
}

export const getPublishedBlogs = createServerFn({ method: "GET" })
  .handler(async () => {
    try {
      const pb = getPB();
      const result = await pb.collection("blogs").getList(1, 50, {
        filter: "published = true",
        sort: "-published_at",
        expand: "relation,society,event",
      });
      return (result.items || []).map(mapBlog);
    } catch (err) {
      console.error("Failed to fetch published blogs:", err);
      return [];
    }
  });

export const getBlogBySlug = createServerFn({ method: "GET" })
  .validator((slug: string) => slug)
  .handler(async ({ data: slug }) => {
    try {
      const pb = getPB();
      const result = await pb.collection("blogs").getFirstListItem(`slug = "${slug}" && published = true`, {
        expand: "relation,society,event",
      });
      return mapBlog(result);
    } catch (err) {
      console.error(`Failed to fetch blog by slug ${slug}:`, err);
      return null;
    }
  });

export const getAllBlogsAdmin = createServerFn({ method: "GET" })
  .handler(async () => {
    try {
      const ctx = await authenticateAdmin();
      // Admins (and chairs) can see all blogs
      const result = await ctx.pb.collection("blogs").getList(1, 100, {
        expand: "relation,society,event", // The relation field in DB + society + event
      });
      return (result.items || []).map(mapBlog);
    } catch (err) {
      console.error("Failed to fetch admin blogs:", err);
      throw new Error("Unauthorized or failed to fetch");
    }
  });

const BlogCreateSchema = z.object({
  title: z.string().min(1),
  slug: z.string().min(1),
  excerpt: z.string().optional(),
  content: z.string().optional(),
  topicLabel: z.string().optional(),
  category: z.enum(["IEEE", "Society", "Event"]).optional(),
  coverUrl: z.string().optional(),
  readMinutes: z.number().optional(),
  published: z.boolean().optional(),
  published_at: z.string().optional(),
  author: z.string().optional(), // ID of the author
  societyId: z.string().optional(),
  eventId: z.string().optional(),
});

export const createBlog = createServerFn({ method: "POST" })
  .validator(BlogCreateSchema)
  .handler(async ({ data }) => {
    const ctx = await authenticateAdmin();
    
    // Map camelCase UI fields to snake_case DB fields
    const dbData: any = {
      title: data.title,
      slug: data.slug,
      excerpt: data.excerpt,
      content: data.content,
      topic_label: data.topicLabel,
      category: data.category,
      cover_url: data.coverUrl,
      read_minutes: data.readMinutes,
      published: data.published,
      published_at: data.published_at,
      relation: data.author || ctx.userId, // use "relation" field
      society: data.societyId || null,
      event: data.eventId || null,
    };

    if (dbData.published && !dbData.published_at) {
      // Use PB's expected UTC date format "YYYY-MM-DD HH:mm:ss.SSSZ"
      dbData.published_at = new Date().toISOString().replace('T', ' ');
    }
    
    const record = await ctx.pb.collection("blogs").create(dbData);
    return mapBlog(record);
  });

const BlogUpdateSchema = BlogCreateSchema.partial().extend({
  id: z.string(),
});

export const updateBlog = createServerFn({ method: "POST" })
  .validator(BlogUpdateSchema)
  .handler(async ({ data }) => {
    const ctx = await authenticateAdmin();
    const { id, ...updateData } = data;
    
    // Map camelCase UI fields to snake_case DB fields dynamically
    const dbData: any = {};
    if (updateData.title !== undefined) dbData.title = updateData.title;
    if (updateData.slug !== undefined) dbData.slug = updateData.slug;
    if (updateData.excerpt !== undefined) dbData.excerpt = updateData.excerpt;
    if (updateData.content !== undefined) dbData.content = updateData.content;
    if (updateData.topicLabel !== undefined) dbData.topic_label = updateData.topicLabel;
    if (updateData.category !== undefined) dbData.category = updateData.category;
    if (updateData.coverUrl !== undefined) dbData.cover_url = updateData.coverUrl;
    if (updateData.readMinutes !== undefined) dbData.read_minutes = updateData.readMinutes;
    if (updateData.published !== undefined) dbData.published = updateData.published;
    if (updateData.published_at !== undefined) dbData.published_at = updateData.published_at;
    if (updateData.author !== undefined) dbData.relation = updateData.author;
    if (updateData.societyId !== undefined) dbData.society = updateData.societyId || null;
    if (updateData.eventId !== undefined) dbData.event = updateData.eventId || null;
    
    // Auto-set published_at if publishing for the first time
    if (dbData.published === true && !dbData.published_at) {
      // Check if it already had one in the DB (only overwrite if we need to, but it's simpler to just let PB keep it or we can fetch first)
      // Since we don't fetch first, let's just set it to now if they check the box and didn't provide a date.
      dbData.published_at = new Date().toISOString().replace('T', ' ');
    }
    
    const record = await ctx.pb.collection("blogs").update(id, dbData);
    return mapBlog(record);
  });

export const deleteBlog = createServerFn({ method: "POST" })
  .validator((id: string) => id)
  .handler(async ({ data: id }) => {
    const ctx = await authenticateAdmin();
    await ctx.pb.collection("blogs").delete(id);
    return { success: true };
  });

export const getSocietiesForSelect = createServerFn({ method: "GET" })
  .handler(async () => {
    try {
      const ctx = await authenticateAdmin();
      const result = await ctx.pb.collection("societies").getList(1, 100, {
        sort: "name",
        fields: "id,name",
      });
      return result.items.map((s: any) => ({ id: s.id, name: s.name }));
    } catch (err) {
      console.error("Failed to fetch societies:", err);
      return [];
    }
  });

export const getEventsForSelect = createServerFn({ method: "GET" })
  .handler(async () => {
    try {
      const ctx = await authenticateAdmin();
      const result = await ctx.pb.collection("events").getList(1, 100, {
        sort: "-date",
        fields: "id,title",
      });
      return result.items.map((e: any) => ({ id: e.id, title: e.title }));
    } catch (err) {
      console.error("Failed to fetch events:", err);
      return [];
    }
  });
