import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  PROGRAMMES,
  SEMESTERS,
  normalizeProgramme,
  normalizeSemester,
  programmeLabel,
  semestersForYear,
  yearForSemester,
} from "@/lib/academic-options";

interface PbAcademicHelper {
  catalogue: { semesters: Array<{ code: string; year: number }>; programmes: Array<{ code: string }> };
  normalizeProgramme(value: unknown): string;
  normalizeSemester(value: unknown): string;
  programmeLabel(value: unknown): string;
  semestersForYear(year: number): string[];
  yearForSemester(value: unknown): number | null;
}

async function loadPocketBaseAcademicHelper(): Promise<PbAcademicHelper> {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const root = path.resolve(here, "../../..");
  const source = await readFile(path.join(root, "pb_hooks", "academic-options.js"), "utf8");
  const catalogue = JSON.parse(await readFile(path.join(root, "shared", "academic-options.json"), "utf8"));
  const module = { exports: {} as PbAcademicHelper };
  vm.runInNewContext(source, {
    module,
    exports: module.exports,
    __hooks: "/pb/pb_hooks",
    require(request: string) {
      if (request === "/pb/pb_hooks/academic-options.generated.js") return catalogue;
      throw new Error(`Unexpected require: ${request}`);
    },
  });
  return module.exports;
}

const semesterCases: Array<[unknown, string, number | null]> = [
  ["S1", "S1", 1],
  ["s7", "S7", 4],
  ["Semester 6", "S6", 3],
  ["sem 2", "S2", 1],
  ["S3 CSB", "", null],
  ["S9", "", null],
  ["", "", null],
];

const programmeCases: Array<[unknown, string]> = [
  ["Computer science", "CSE"],
  ["Computer Science and Engineering", "CSE"],
  ["E.C.E", "ECE"],
  ["Electronics and communication engineering", "ECE"],
  ["Triple E", "EEE"],
  ["BMB", "BME"],
  ["Biotechnology", "BT"],
  ["CSE C", ""],
  ["Computer sceine", ""],
  ["dwada", ""],
];

describe("academic option catalogue", () => {
  it("defines the canonical semester/year mapping", () => {
    expect(SEMESTERS.map((item) => item.code)).toEqual(["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8"]);
    expect(semestersForYear(1)).toEqual(["S1", "S2"]);
    expect(semestersForYear(4)).toEqual(["S7", "S8"]);
  });

  it.each(semesterCases)("normalizes semester %j conservatively", (input, normalized, year) => {
    expect(normalizeSemester(input)).toBe(normalized);
    expect(yearForSemester(input)).toBe(year);
  });

  it.each(programmeCases)("normalizes programme %j conservatively", (input, normalized) => {
    expect(normalizeProgramme(input)).toBe(normalized);
  });

  it("keeps current programme labels stable", () => {
    expect(PROGRAMMES.map((item) => item.code)).toContain("OTHER");
    expect(programmeLabel("BMB")).toBe("Biomedical Engineering");
    expect(programmeLabel("CSE C")).toBe("");
  });

  it("keeps PocketBase normalization behavior in parity with the web helper", async () => {
    const pb = await loadPocketBaseAcademicHelper();
    expect(pb.catalogue.semesters).toEqual(SEMESTERS);
    expect(pb.catalogue.programmes.map((item) => item.code)).toEqual(PROGRAMMES.map((item) => item.code));
    for (const [input, normalized, year] of semesterCases) {
      expect(pb.normalizeSemester(input)).toBe(normalized);
      expect(pb.yearForSemester(input)).toBe(year);
    }
    for (const [input, normalized] of programmeCases) {
      expect(pb.normalizeProgramme(input)).toBe(normalized);
    }
    expect(pb.semestersForYear(3)).toEqual(["S5", "S6"]);
    expect(pb.programmeLabel("BMB")).toBe(programmeLabel("BMB"));
  });
});
