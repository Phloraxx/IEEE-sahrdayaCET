import { describe, expect, it } from "vitest";
import {
  ALL_PROGRAMME_CODES,
  ALL_SEMESTER_CODES,
  evaluateAudienceEligibility,
  normalizeEligibleProgrammes,
  normalizeEligibleSemesters,
  toggleProgramme,
  toggleSemester,
  toggleSemesterYear,
} from "@/lib/event-audience";

describe("event audience eligibility", () => {
  it("treats empty restrictions as open to everyone", () => {
    expect(evaluateAudienceEligibility({}, {})).toMatchObject({ eligible: true, code: "ELIGIBLE" });
    expect(evaluateAudienceEligibility({}, { branch: "Computer science", semester: "semester 6" })).toMatchObject({
      eligible: true,
      programmeCode: "CSE",
      semester: "S6",
    });
  });

  it("requires and validates restricted semester and programme values", () => {
    const event = { eligibleSemesters: ["S6"], eligibleProgrammes: ["EEE"] };
    expect(evaluateAudienceEligibility(event, { programmeCode: "EEE" }).code).toBe("SEMESTER_REQUIRED");
    expect(evaluateAudienceEligibility(event, { programmeCode: "EEE", semester: "S5" }).code).toBe("SEMESTER_NOT_ELIGIBLE");
    expect(evaluateAudienceEligibility(event, { semester: "S6" }).code).toBe("PROGRAMME_REQUIRED");
    expect(evaluateAudienceEligibility(event, { programmeCode: "CSE", semester: "S6" }).code).toBe("PROGRAMME_NOT_ELIGIBLE");
    expect(evaluateAudienceEligibility(event, { programmeCode: "EEE", semester: "S6" })).toMatchObject({
      eligible: true,
      programmeCode: "EEE",
      semester: "S6",
    });
  });

  it("requires a free-text name when Other is selected", () => {
    expect(evaluateAudienceEligibility({}, { programmeCode: "OTHER" }).code).toBe("OTHER_PROGRAMME_REQUIRED");
    expect(evaluateAudienceEligibility({}, { programmeCode: "OTHER", branch: "Physics", semester: "S4" })).toMatchObject({
      eligible: true,
      programmeCode: "OTHER",
      semester: "S4",
    });
  });

  it("normalizes persisted restriction arrays conservatively", () => {
    expect(normalizeEligibleSemesters(["s6", "Semester 6", "S9", ""])).toEqual(["S6"]);
    expect(normalizeEligibleProgrammes(["Computer science", "CSE", "dwada", "EEE"])).toEqual(["CSE", "EEE"]);
  });

  it("stores an all-selected audience as unrestricted", () => {
    let semesters: string[] = [];
    for (const code of ALL_SEMESTER_CODES) semesters = toggleSemester(semesters, code);
    expect(semesters).toEqual([]);
    let programmes: string[] = [];
    for (const code of ALL_PROGRAMME_CODES) programmes = toggleProgramme(programmes, code);
    expect(programmes).toEqual([]);
  });

  it("supports whole-year toggles without losing unrelated selections", () => {
    expect(toggleSemesterYear([], 1)).toEqual(["S3", "S4", "S5", "S6", "S7", "S8"]);
    expect(toggleSemesterYear(["S5", "S6"], 1)).toEqual(["S1", "S2", "S5", "S6"]);
  });
});
