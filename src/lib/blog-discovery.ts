import type { BlogPost } from "@/types";

export function blogStoryFilters(posts: BlogPost[]) {
  const counts = new Map<string, number>();
  for (const post of posts) {
    for (const label of new Set([post.category, post.topicLabel].filter(Boolean))) {
      counts.set(label!, (counts.get(label!) || 0) + 1);
    }
  }
  return ["All", ...Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([label]) => label)];
}

export function filterBlogStories(posts: BlogPost[], query: string, topic: string) {
  const needle = query.trim().toLowerCase();
  return posts.filter(post => {
    if (topic !== "All" && post.category !== topic && post.topicLabel !== topic) return false;
    const author = typeof post.author === "string" ? post.author : post.author?.name || "IEEE Sahrdaya";
    return !needle || [post.title, post.excerpt, post.topicLabel, post.category, author].filter(Boolean).join(" ").toLowerCase().includes(needle);
  });
}
