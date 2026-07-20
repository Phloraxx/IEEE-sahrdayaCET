declare module "sanitize-html" {
  interface Attributes {
    [key: string]: string;
  }

  interface TransformTagResult {
    tagName: string;
    attribs: Attributes;
  }

  interface Options {
    allowedTags?: string[];
    allowedAttributes?: Record<string, string[]>;
    allowedSchemes?: string[];
    allowProtocolRelative?: boolean;
    disallowedTagsMode?: "discard" | "escape" | "recursiveEscape";
    transformTags?: Record<
      string,
      (tagName: string, attribs: Attributes) => TransformTagResult
    >;
  }

  export default function sanitizeHtml(dirty: string, options?: Options): string;
}
