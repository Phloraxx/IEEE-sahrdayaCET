import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, loadEnv } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

/**
 * Baked into the bundle at build time so every deployment can show what it is
 * running (the BUILD_VER badge): package version + git short SHA. Inside the
 * Docker build .git is excluded by .dockerignore, so CI passes the identity as
 * GIT_COMMIT / GIT_TREE build args instead (see Dockerfile); a local build with
 * neither falls back to the timestamp.
 *
 * GIT_TREE is recorded so the image can prove which commit tree it was built
 * from — CD compares it with the tree CI tested before it deploys.
 */
const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
const env = (name: string): string => (process.env[name] ?? "").trim();
let sha = env("GIT_COMMIT");
if (!sha) {
	try {
		sha = execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();
	} catch {
		/* no git available - a plain local build uses the timestamp instead */
	}
}
const fullSha = /^[0-9a-f]{40}$/i.test(sha) ? sha : "";
const shortSha = fullSha ? fullSha.slice(0, 7) : sha.slice(0, 7);
const tree = env("GIT_TREE");
const builtAt = new Date().toISOString().slice(0, 16);
const buildInfo = {
	version: pkg.version as string,
	sha: shortSha,
	revision: fullSha,
	tree,
	builtAt,
	display: `${pkg.version}+${shortSha || builtAt.replace("T", ".").replaceAll("-", "").replaceAll(":", "")}`,
};

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    define: { __BUILD_INFO__: JSON.stringify(buildInfo) },
    server: {
      host: "0.0.0.0",
      // allow dev-server previews served behind the org domain (e.g. dev.ieeesahrdaya.com)
      allowedHosts: ["localhost", ".ieeesahrdaya.com", ".phloraxx.us.to"],
      port: Number(env.PORT || process.env.PORT || 3000),
      // No proxy. PocketBase used to own all of /api; every surface is now
      // served by this app, including /api/files and the /api/app/* paths the
      // browser client rewrites to /api/*. A leftover proxy entry here would
      // shadow the new routes — the dev mirror of the production Traefik
      // bypass that broke phase 4.
    },
    plugins: [
      tailwindcss(),
      reactRouter(),
      tsconfigPaths(),
      {
        // `apply: "build"` keeps the dev server free of it. Written once, after
        // Vite has finished both environments, to build/build-info.json — the
        // file CD reads out of the image to compare the baked tree with the tree
        // CI tested, and the release gate reads to prove it exercised this
        // build. A file rather than an inlined constant because minification is
        // free to drop a field nothing reads.
        name: "ieee-image-provenance",
        apply: "build",
        writeBundle() {
          mkdirSync(resolve(process.cwd(), "build"), { recursive: true });
          writeFileSync(resolve(process.cwd(), "build", "build-info.json"), `${JSON.stringify(buildInfo, null, 2)}\n`);
        },
      },
    ],
  };
});
