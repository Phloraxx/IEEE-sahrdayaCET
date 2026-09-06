import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(root, "shared", "academic-options.json");
const outputPath = path.join(root, "pb_hooks", "academic-options.generated.js");
const source = JSON.parse(fs.readFileSync(sourcePath, "utf8"));

function validateCatalogue(catalogue) {
  if (!Array.isArray(catalogue.semesters) || catalogue.semesters.length !== 8) {
    throw new Error("Academic catalogue must define exactly S1-S8");
  }
  const semesterCodes = catalogue.semesters.map((item) => item.code);
  if (semesterCodes.join(",") !== "S1,S2,S3,S4,S5,S6,S7,S8") {
    throw new Error(`Unexpected semester catalogue: ${semesterCodes.join(",")}`);
  }
  const programmeCodes = new Set();
  for (const programme of catalogue.programmes || []) {
    if (!programme.code || !programme.label || !Array.isArray(programme.aliases)) {
      throw new Error("Each programme needs code, label and aliases");
    }
    if (programmeCodes.has(programme.code)) throw new Error(`Duplicate programme code: ${programme.code}`);
    programmeCodes.add(programme.code);
  }
  if (!programmeCodes.has("OTHER")) throw new Error("Academic catalogue must include OTHER");
}

validateCatalogue(source);
const banner = [
  "// GENERATED FILE — DO NOT EDIT BY HAND.",
  "// Source: shared/academic-options.json",
  "// Regenerate with: node scripts/generate-academic-options.mjs",
  "",
].join("\n");
const rendered = `${banner}module.exports = ${JSON.stringify(source, null, 2)};\n`;
const checkOnly = process.argv.includes("--check");

if (checkOnly) {
  const current = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, "utf8") : "";
  if (current !== rendered) {
    console.error("pb_hooks/academic-options.generated.js is out of sync with shared/academic-options.json");
    process.exit(1);
  }
  console.log("Academic option catalogue is synchronized.");
} else {
  fs.writeFileSync(outputPath, rendered);
  console.log(`Generated ${path.relative(root, outputPath)}`);
}
