import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react-swc'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  server: { port: 3001 },
  plugins: [
    tanstackStart({ customViteReactPlugin: true }),
    viteReact(),
    tsconfigPaths(),
  ],
  optimizeDeps: {
    // Exclude TanStack Start packages from Vite's dependency optimization
    // to prevent issues with virtual imports (#tanstack-router-entry, etc.)
    // Reference: TanStack/router#5795
    exclude: [
      '@tanstack/start-server-core',
      '@tanstack/react-start',
      '@tanstack/react-start/client',
      '@tanstack/react-start/server',
    ],
  },
})
