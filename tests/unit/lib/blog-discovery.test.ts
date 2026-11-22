import { describe, expect, it } from "vitest";
import { blogStoryFilters, filterBlogStories } from "@/lib/blog-discovery";
import type { BlogPost } from "@/types";

const posts: BlogPost[] = [
  { id: "featured", title: "Hardware security", slug: "hardware", isFeatured: true, category: "Event", topicLabel: "Security", author: { name: "Writer One" } },
  { id: "other", title: "Building robots", slug: "robots", category: "Society", topicLabel: "Robotics" },
];

describe("blog discovery", () => {
  it("searches featured stories and authors alongside all other posts", () => {
    expect(filterBlogStories(posts, " HARDWARE ", "All").map(p => p.id)).toEqual(["featured"]);
    expect(filterBlogStories(posts, "writer one", "Security").map(p => p.id)).toEqual(["featured"]);
    expect(filterBlogStories(posts, "hardware", "Robotics")).toEqual([]);
    expect(filterBlogStories(posts, "", "All")).toEqual(posts);
  });
  it("does not hide less common topics or double-count matching category/topic labels", () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ id: String(i), title: "Story", slug: String(i), category: "Repeated", topicLabel: `Topic ${i}` }));
    expect(blogStoryFilters(many)).toHaveLength(12);
    expect(blogStoryFilters(many)).toContain("Topic 9");
    const repeated = [
      ...Array.from({ length: 2 }, (_, i) => ({ id: String(i), title: "Story", slug: String(i), category: "Security", topicLabel: "Security" })),
      ...Array.from({ length: 3 }, (_, i) => ({ id: `r${i}`, title: "Story", slug: `r${i}`, category: "Robotics" })),
    ];
    expect(blogStoryFilters(repeated)).toEqual(["All", "Robotics", "Security"]);
    expect(blogStoryFilters([])).toEqual(["All"]);
  });
});
