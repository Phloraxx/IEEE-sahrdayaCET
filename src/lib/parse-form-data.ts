/**
 * Parses a Request body into a plain record, handling both
 * `multipart/form-data` (with File objects preserved) and JSON.
 *
 * JSON-stringified values in form-data fields are automatically parsed.
 */
export async function parseFormData(
  req: Request,
): Promise<Record<string, unknown>> {
  const contentType = req.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    const body: Record<string, unknown> = {};
    for (const [key, value] of formData.entries()) {
      if (value instanceof File) {
        body[key] = value;
      } else {
        try {
          body[key] = JSON.parse(value as string);
        } catch {
          body[key] = value;
        }
      }
    }
    return body;
  }

  try {
    return (await req.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}
