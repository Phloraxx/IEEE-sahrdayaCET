import { reactRouter } from "@react-router/dev/vite";
import { defineConfig, loadEnv } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
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
