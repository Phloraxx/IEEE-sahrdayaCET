import { defineConfig, loadEnv } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react-swc'
import tsconfigPaths from 'vite-tsconfig-paths'
import path from 'path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  Object.assign(process.env, env)
  const pbUrl = env.POCKETBASE_URL || 'http://127.0.0.1:8090'

  return {
    server: {
      port: 3000,
      proxy: {
        // Same-origin proxy for client-side PB SSE subscriptions (public
        // collections only: fifa_feed_events, fifa_bet_markets, fifa_matches).
        // POCKETBASE_URL stays server-side; this is dev-only. Caddy does the
        // same in production (see Caddyfile).
        '/pb': {
          target: pbUrl,
          changeOrigin: true,
          secure: true,
          rewrite: (p) => p.replace(/^\/pb/, ''),
          ws: true,
        },
      },
    },
    plugins: [
      tanstackStart(),
      viteReact(),
      tsconfigPaths(),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    optimizeDeps: {
      exclude: [
        '@tanstack/start-server-core',
        '@tanstack/react-start',
        '@tanstack/react-start/client',
        '@tanstack/react-start/server',
      ],
    }
  }
})
