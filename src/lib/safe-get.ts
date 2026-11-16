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

/** Read a finite numeric field while distinguishing a missing value from 0. */
export function getNumberField(obj: unknown, key: string, fallback: number): number {
  const value = getField<unknown>(obj, key, undefined);
  if (value == null || value === '') return fallback;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

/**
 * Extracts expand data from a PocketBase record.
 */
/**
 * The `expand` map of a PocketBase-shaped payload.
 *
 * Typed as a record of records so `expand.society.name` reads without a cast at
 * every call site; each value is itself untyped.
 */
export function getExpand(
  obj: unknown,
): Record<string, Record<string, unknown>> | undefined {
  if (obj && typeof obj === 'object' && 'expand' in obj) {
    return (obj as { expand?: Record<string, Record<string, unknown>> }).expand;
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
