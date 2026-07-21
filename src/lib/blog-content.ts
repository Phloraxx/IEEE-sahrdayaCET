import sanitizeHtml from "sanitize-html";

const ALLOWED_TAGS = [
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "s",
  "strike",
  "h1",
  "h2",
  "h3",
  "ul",
  "ol",
  "li",
  "blockquote",
  "pre",
  "code",
  "hr",
  "a",
];

/**
 * Sanitize rich-text HTML before it is stored or rendered.
 * The allow-list mirrors the formatting exposed by the TipTap editor and
 * preserves legacy h1 headings already present in live blog records.
 */
export function sanitizeBlogHtml(value: string | null | undefined): string {
  if (!value) return "";

  return sanitizeHtml(value, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      a: ["href", "target", "rel"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowProtocolRelative: false,
    disallowedTagsMode: "discard",
    transformTags: {
      a: (_tagName, attribs) => ({
        tagName: "a",
        attribs: {
          ...attribs,
          rel: "noopener noreferrer",
          ...(attribs.target === "_blank" ? { target: "_blank" } : {}),
        },
      }),
    },
  });
}

export function blogHtmlToPlainText(value: string | null | undefined): string {
  if (!value) return "";
  return sanitizeHtml(value, { allowedTags: [], allowedAttributes: {} })
    .replace(/\s+/g, " ")
    .trim();
}

export function hasReadableBlogContent(value: string | null | undefined): boolean {
  return blogHtmlToPlainText(value).length > 0;
}

export function estimateBlogReadMinutes(value: string | null | undefined): number {
  const words = blogHtmlToPlainText(value)
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
}

export function normalizeBlogSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

interface ResolvePublishedAtInput {
  nextPublished?: boolean;
  existingPublished?: boolean;
  existingPublishedAt?: string;
  submittedPublishedAt?: string;
  now?: Date;
}

/** Keep the original publication date stable across ordinary edits. */
export function resolveBlogPublishedAt({
  nextPublished,
  existingPublished = false,
  existingPublishedAt = "",
  submittedPublishedAt,
  now = new Date(),
}: ResolvePublishedAtInput): string | undefined {
  if (submittedPublishedAt !== undefined) return submittedPublishedAt;
  if (existingPublishedAt) return existingPublishedAt;
  if (nextPublished === true && existingPublished === false) {
    return now.toISOString().replace("T", " ");
  }
  return undefined;
}
