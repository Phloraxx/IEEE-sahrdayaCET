import { reactRouter } from "@react-router/dev/vite";
import { defineConfig, loadEnv } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const pocketBaseUrl = env.POCKETBASE_INTERNAL_URL || process.env.POCKETBASE_INTERNAL_URL || "http://127.0.0.1:8090";

  return {
    server: {
      host: "0.0.0.0",
      port: 3000,
      proxy: {
        "/api": {
          target: pocketBaseUrl,
          changeOrigin: true,
          ws: true,
        },
      },
    },
    plugins: [reactRouter(), tsconfigPaths()],
  };
});
