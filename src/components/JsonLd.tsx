export default function JsonLd({ schema }: { schema: Record<string, unknown> }) {
  // Sanitize the JSON string to prevent XSS in <script> tags
  // We escape <, >, and & characters to their Unicode escape sequences
  const jsonString = JSON.stringify(schema)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: jsonString }}
    />
  );
}
