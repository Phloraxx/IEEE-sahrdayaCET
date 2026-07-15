/**
 * Type-safe field accessor for PocketBase response objects.
 * Avoids `as Record<string, unknown>` casts throughout the codebase.
 */
export function getField<T = string>(obj: unknown, key: string, fallback: T): T {
  if (obj && typeof obj === 'object' && key in obj) {
    return (obj as Record<string, unknown>)[key] as T;
  }
  return fallback;
}

/**
 * Extracts expand data from a PocketBase record.
 */
export function getExpand<T = unknown>(obj: unknown): Record<string, T> | undefined {
  if (obj && typeof obj === 'object' && 'expand' in obj) {
    return (obj as { expand?: Record<string, T> }).expand;
  }
  return undefined;
}

/**
 * Extracts a clean text bio if it is a JSON object.
 */
export function getBioText(bio: string | undefined | null): string {
  if (!bio) return "";
  const trimmed = bio.trim();
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed.isCustom && parsed.about && typeof parsed.about.intro === "string") {
        return parsed.about.intro;
      }
      if (parsed.about && typeof parsed.about === "string") {
        return parsed.about;
      }
    } catch {
      // Ignore parse errors, return raw
    }
  }
  return bio;
}
