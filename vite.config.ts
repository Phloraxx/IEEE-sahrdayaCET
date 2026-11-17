import { reactRouter } from "@react-router/dev/vite";
import { defineConfig, loadEnv } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const pocketBaseUrl = env.POCKETBASE_INTERNAL_URL || process.env.POCKETBASE_INTERNAL_URL || "http://127.0.0.1:8090";

  return {
    server: {
      host: "0.0.0.0",
      // allow dev-server previews served behind the org domain (e.g. dev.ieeesahrdaya.com)
      allowedHosts: ["localhost", ".ieeesahrdaya.com", ".phloraxx.us.to"],
      port: Number(env.PORT || process.env.PORT || 3000),
      // Transitional: PocketBase used to own all of /api. The app now serves
      // /api/events/*, /api/registrations/*, /api/my-events and
      // /api/registration-memory itself, so only the paths PocketBase still
      // answers are proxied. This list shrinks each phase and disappears at
      // cutover, matching the production Traefik rule being removed then.
      // Only the surfaces PocketBase still owns are proxied. Everything else is
      // served by this app: /api/collections, /api/workspace, /api/admin,
      // /api/tickets and /api/webhooks were ported in phases 2-4, and leaving
      // them here shadowed the new routes (the dev mirror of the production
      // Traefik bypass).
      proxy: {
        "/api/files": { target: pocketBaseUrl, changeOrigin: true },
        "/api/app": { target: pocketBaseUrl, changeOrigin: true },
      },
    },
    plugins: [reactRouter(), tsconfigPaths()],
  };
});
