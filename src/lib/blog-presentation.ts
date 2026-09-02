import type { BlogPost } from "@/types";

type BlogPresentationInput = Pick<BlogPost, "title" | "topicLabel" | "category">;

export function getBlogContentType(post: BlogPresentationInput): string {
  const source = `${post.topicLabel || ""} ${post.category || ""} ${post.title}`.toLowerCase();
  if (source.includes("event") || source.includes("recap")) return "EVENT LOG";
  if (source.includes("project")) return "PROJECT FILE";
  if (source.includes("technical") || source.includes("tech")) return "TECH NOTE";
  if (source.includes("member") || source.includes("people")) return "PEOPLE";
  if (source.includes("ieee") || source.includes("history")) return "EXPLAINER";
  return "BRANCH NOTE";
}
