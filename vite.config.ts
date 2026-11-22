import { reactRouter } from "@react-router/dev/vite";
import { defineConfig, loadEnv } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

/**
 * Baked into the bundle at build time so every deployment can show what it is
 * running (the BUILD_VER badge): package version + git short SHA. Inside the
 * Docker build .git is excluded by .dockerignore, so those builds fall back
 * to a build timestamp - either way the value changes on every build.
 */
const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
let sha = "";
try {
	sha = execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();
} catch {
	/* no git available - Docker builds use the timestamp instead */
}
const builtAt = new Date().toISOString().slice(0, 16);
const buildInfo = {
	version: pkg.version as string,
	sha,
	builtAt,
	display: `${pkg.version}+${sha || builtAt.replace("T", ".").replaceAll("-", "").replaceAll(":", "")}`,
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
    plugins: [reactRouter(), tsconfigPaths()],
  };
});
