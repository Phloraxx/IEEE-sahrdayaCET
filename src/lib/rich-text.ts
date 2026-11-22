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
 * The page title owns the single h1; legacy article h1 elements are rendered
 * as h2 sections to preserve hierarchy without changing stored records.
 */
export function sanitizeRichHtml(value: string | null | undefined): string {
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
      h1: () => ({ tagName: "h2", attribs: {} }),
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

/** Flatten stored rich-text HTML into one line of plain text (meta descriptions, cards). */
export function htmlToPlainText(value: string | null | undefined): string {
  if (!value) return "";
  // Block boundaries become spaces first, so "<p>a</p><p>b</p>" reads "a b"
  // rather than "ab" in a meta description.
  const spaced = value.replace(/<\/(p|div|li|h[1-6]|blockquote|pre|tr|td|th)>/gi, " ");
  return sanitizeHtml(spaced, { allowedTags: [], allowedAttributes: {} })
    .replace(/\s+/g, " ")
    .trim();
}
