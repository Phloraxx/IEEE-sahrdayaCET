/**
 * Responsive derivatives for the homepage gallery's curated photographs.
 *
 * The homepage rail paints seven curated photos in 166px (phone) and 260px
 * (`sm`+) cards that crop with `object-cover` to 3:4, so the only widths the
 * layout can use are one image pixel per CSS pixel at 1x and 2x:
 *
 *   166px × 1 = 166 → 320w    166px × 2 = 332 → 480w
 *   260px × 1 = 260 → 320w    260px × 2 = 520 → 480w
 *
 * That is the whole scope: seven source photos × two widths, 4:3 frames
 * (the ratio the 3:4 card crops to), WebP. Originals stay in place and stay
 * the `<img src>`, so the rail still works with no derivatives at all.
 *
 * The frame list is read from `src/components/EventsShowcase.tsx`, so adding a
 * curated photo fails `--check` until its derivatives exist.
 *
 *   node scripts/generate-gallery-derivatives.mjs           # write missing
 *   node scripts/generate-gallery-derivatives.mjs --check   # verify only
 *
 * Requires `sharp`, which is already a dependency for upload re-encoding.
 * Output is deterministic for a given sharp/libwebp build; `--check` verifies
 * presence, WebP signature and the expected pixel dimensions, which is
 * reproducible without depending on encoder byte-stability.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(root, "public");
const showcasePath = path.join(root, "src", "components", "EventsShowcase.tsx");

/** Keep in step with the `widths` in `EventsShowcase.tsx`. */
export const GALLERY_WIDTHS = [320, 480];
/** The card's `object-cover` crop: `w-[166px] h-[230px]` is 3:4. */
export const GALLERY_ASPECT = 4 / 3;

const WEBP_OPTIONS = { quality: 78, effort: 4 };

/** `/Events/<name>.<ext>?v=1` at a given width, next to the original. */
export function derivativePath(src, width) {
  const file = src.split("?")[0];
  return file.replace(/\.[a-z0-9]+$/i, `-${width}w.webp`);
}

/** The curated frames and their widths, straight from the component. */
function readGalleryImages() {
  const source = fs.readFileSync(showcasePath, "utf8");
  const block = /const eventImages = \[([\s\S]*?)\n\];/.exec(source)?.[1] ?? "";
  const images = [...block.matchAll(/src:\s*'([^']+)'\s*,\s*widths:\s*\[([^\]]*)\]/g)].map((match) => ({
    src: match[1],
    widths: match[2].split(",").map((value) => Number(value.trim())).filter(Boolean),
  }));
  if (images.length === 0) throw new Error("No curated gallery images found in EventsShowcase.tsx");
  return images;
}

async function asWebp(sharpInstance) {
  // Cover-crop to the card ratio so the file serves exactly the pixels the
  // `object-cover` frame shows, then encode WebP.
  const { data } = await sharpInstance.toBuffer({ resolveWithObject: true });
  return data;
}

async function plan(images) {
  const jobs = [];
  for (const image of images) {
    const sourcePath = path.join(publicDir, image.src.split("?")[0]);
    if (!fs.existsSync(sourcePath)) throw new Error(`Missing original: ${publicDir}/${image.src}`);
    const metadata = await sharp(sourcePath).metadata();
    const width = metadata.width ?? 0;
    for (const target of image.widths) {
      if (!GALLERY_WIDTHS.includes(target)) {
        throw new Error(`${image.src} asks for ${target}w, which is not one of ${GALLERY_WIDTHS.join(", ")}`);
      }
      // Never upscale an original that is already smaller than the derivative.
      if (target > width) continue;
      jobs.push({
        src: image.src,
        sourcePath,
        width: target,
        height: Math.round(target / GALLERY_ASPECT),
        outputPath: path.join(publicDir, derivativePath(image.src, target)),
      });
    }
  }
  return jobs;
}

function isWebp(filePath) {
  const header = fs.readFileSync(filePath).subarray(0, 12);
  return header.subarray(0, 4).toString("ascii") === "RIFF" && header.subarray(8, 12).toString("ascii") === "WEBP";
}

async function main() {
  const checkOnly = process.argv.includes("--check");
  const jobs = await plan(readGalleryImages());

  if (checkOnly) {
    const broken = [];
    for (const job of jobs) {
      if (!fs.existsSync(job.outputPath) || fs.statSync(job.outputPath).size === 0) {
        broken.push(`${path.relative(root, job.outputPath)} (missing)`);
        continue;
      }
      if (!isWebp(job.outputPath)) {
        broken.push(`${path.relative(root, job.outputPath)} (not WebP)`);
        continue;
      }
      const metadata = await sharp(job.outputPath).metadata();
      if (metadata.width !== job.width || metadata.height !== job.height) {
        broken.push(`${path.relative(root, job.outputPath)} (${metadata.width}x${metadata.height}, expected ${job.width}x${job.height})`);
      }
    }
    if (broken.length > 0) {
      console.error(`Gallery derivatives are not usable (${broken.length}):`);
      for (const item of broken) console.error(`  ${item}`);
      console.error("Run: node scripts/generate-gallery-derivatives.mjs");
      process.exitCode = 1;
      return;
    }
    console.log(`gallery derivatives: ${jobs.length} present and valid`);
    return;
  }

  let written = 0;
  let bytes = 0;
  for (const job of jobs) {
    if (fs.existsSync(job.outputPath) && fs.statSync(job.outputPath).mtimeMs >= fs.statSync(job.sourcePath).mtimeMs) {
      bytes += fs.statSync(job.outputPath).size;
      continue;
    }
    const data = await asWebp(
      sharp(job.sourcePath).resize({ width: job.width, height: job.height, fit: "cover", position: "centre" }).webp(WEBP_OPTIONS),
    );
    fs.writeFileSync(job.outputPath, data);
    bytes += data.length;
    written += 1;
  }
  console.log(`gallery derivatives: wrote ${written} of ${jobs.length}; ${(bytes / 1024).toFixed(0)} KB total`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
