import { describe, expect, it, vi } from "vitest";
import {
  clearRegistrationDraft,
  loadRegistrationDraft,
  loadRegistrationProfile,
  registrationDraftKey,
  registrationProfileKey,
  saveRegistrationDraft,
  saveRegistrationProfile,
} from "@/lib/registration-memory";

class MemoryStorage {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

const profile = {
  name: "Sourav",
  phone: "+91 9000000000",
  college: "Sahrdaya",
  branch: "CSE",
  semester: "S8",
  isIeeeMember: true,
  ieeeMembershipId: "12345678",
};

describe("registration memory", () => {
  it("keeps reusable profile memory separate per signed-in user", () => {
    const storage = new MemoryStorage();
    saveRegistrationProfile("user-a", profile, storage);
    expect(loadRegistrationProfile("user-a", storage)).toEqual(profile);
    expect(loadRegistrationProfile("user-b", storage).name).toBe("");
    expect(registrationProfileKey("user-a")).toContain("user-a");
  });

  it("stores event drafts independently and clears only the completed event", () => {
    const storage = new MemoryStorage();
    saveRegistrationDraft("user-a", "event-1", { ...profile, customFields: { shirt: "M" } }, storage);
    saveRegistrationDraft("user-a", "event-2", { ...profile, customFields: { team: "Blue" } }, storage);
    expect(loadRegistrationDraft("user-a", "event-1", storage)?.customFields.shirt).toBe("M");
    clearRegistrationDraft("user-a", "event-1", storage);
    expect(loadRegistrationDraft("user-a", "event-1", storage)).toBeNull();
    expect(loadRegistrationDraft("user-a", "event-2", storage)?.customFields.team).toBe("Blue");
  });

  it("drops stale event drafts instead of reviving old event answers", () => {
    const storage = new MemoryStorage();
    storage.setItem(registrationDraftKey("user-a", "event-1"), JSON.stringify({
      ...profile,
      customFields: { answer: "old" },
      updatedAt: Date.now() - 31 * 24 * 60 * 60 * 1000,
    }));
    expect(loadRegistrationDraft("user-a", "event-1", storage)).toBeNull();
  });

  it("fails open when browser storage throws", () => {
    const broken = {
      getItem: vi.fn(() => { throw new Error("blocked"); }),
      setItem: vi.fn(() => { throw new Error("full"); }),
      removeItem: vi.fn(() => { throw new Error("blocked"); }),
    };
    expect(loadRegistrationProfile("user-a", broken).name).toBe("");
    expect(() => saveRegistrationProfile("user-a", profile, broken)).not.toThrow();
  });
});
