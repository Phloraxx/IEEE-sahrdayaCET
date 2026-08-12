export interface RegistrationProfileMemory {
  name: string;
  phone: string;
  college: string;
  branch: string;
  semester: string;
  isIeeeMember: boolean;
  ieeeMembershipId: string;
}

export interface RegistrationDraftMemory extends RegistrationProfileMemory {
  customFields: Record<string, string>;
  updatedAt: number;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const EMPTY_REGISTRATION_PROFILE: RegistrationProfileMemory = {
  name: "",
  phone: "",
  college: "",
  branch: "",
  semester: "",
  isIeeeMember: false,
  ieeeMembershipId: "",
};

const DRAFT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function storageOrNull(storage?: StorageLike): StorageLike | null {
  if (storage) return storage;
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.slice(0, 500) : "";
}

function normalizeProfile(value: unknown): RegistrationProfileMemory {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    name: cleanString(raw.name),
    phone: cleanString(raw.phone),
    college: cleanString(raw.college),
    branch: cleanString(raw.branch),
    semester: cleanString(raw.semester),
    isIeeeMember: raw.isIeeeMember === true,
    ieeeMembershipId: cleanString(raw.ieeeMembershipId),
  };
}

export function registrationProfileKey(userId: string): string {
  return `ieee:registration-profile:v1:${userId}`;
}

export function registrationDraftKey(userId: string, eventId: string): string {
  return `ieee:registration-draft:v1:${userId}:${eventId}`;
}

function readJson(key: string, storage?: StorageLike): unknown {
  const target = storageOrNull(storage);
  if (!target) return null;
  try {
    const value = target.getItem(key);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

export function loadRegistrationProfile(userId: string, storage?: StorageLike): RegistrationProfileMemory {
  if (!userId) return { ...EMPTY_REGISTRATION_PROFILE };
  return normalizeProfile(readJson(registrationProfileKey(userId), storage));
}

export function saveRegistrationProfile(
  userId: string,
  profile: RegistrationProfileMemory,
  storage?: StorageLike,
): void {
  const target = storageOrNull(storage);
  if (!target || !userId) return;
  try {
    target.setItem(registrationProfileKey(userId), JSON.stringify(normalizeProfile(profile)));
  } catch {
    // Registration must continue even when storage is unavailable/full.
  }
}

export function loadRegistrationDraft(
  userId: string,
  eventId: string,
  storage?: StorageLike,
): RegistrationDraftMemory | null {
  if (!userId || !eventId) return null;
  const raw = readJson(registrationDraftKey(userId, eventId), storage);
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const updatedAt = Number(record.updatedAt) || 0;
  if (!updatedAt || Date.now() - updatedAt > DRAFT_MAX_AGE_MS) {
    clearRegistrationDraft(userId, eventId, storage);
    return null;
  }
  const customRaw = record.customFields && typeof record.customFields === "object"
    ? record.customFields as Record<string, unknown>
    : {};
  const customFields: Record<string, string> = {};
  for (const [key, value] of Object.entries(customRaw)) {
    if (typeof value === "string") customFields[String(key).slice(0, 200)] = value.slice(0, 2000);
  }
  return { ...normalizeProfile(record), customFields, updatedAt };
}

export function saveRegistrationDraft(
  userId: string,
  eventId: string,
  draft: Omit<RegistrationDraftMemory, "updatedAt">,
  storage?: StorageLike,
): void {
  const target = storageOrNull(storage);
  if (!target || !userId || !eventId) return;
  const profile = normalizeProfile(draft);
  const customFields: Record<string, string> = {};
  for (const [key, value] of Object.entries(draft.customFields || {})) {
    if (typeof value === "string") customFields[String(key).slice(0, 200)] = value.slice(0, 2000);
  }
  try {
    target.setItem(
      registrationDraftKey(userId, eventId),
      JSON.stringify({ ...profile, customFields, updatedAt: Date.now() }),
    );
  } catch {
    // Best-effort convenience only.
  }
}

export function clearRegistrationDraft(userId: string, eventId: string, storage?: StorageLike): void {
  const target = storageOrNull(storage);
  if (!target || !userId || !eventId) return;
  try {
    target.removeItem(registrationDraftKey(userId, eventId));
  } catch {
    // Best-effort convenience only.
  }
}
