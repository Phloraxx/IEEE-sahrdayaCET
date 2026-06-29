/**
 * Production server entry for TanStack Start.
 * Wraps the SSR handler (dist/server/server.js) in a Node.js HTTP server.
 * Use: node server-entry.mjs
 */

import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = join(fileURLToPath(import.meta.url), '..');
const PORT = parseInt(process.env.PORT || '3000', 10);
const CLIENT_DIR = join(__dirname, 'dist', 'client');
const SERVER_ENTRY = join(__dirname, 'dist', 'server', 'server.js');

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

async function main() {
  const { default: handler } = await import(SERVER_ENTRY);
  const fetch = handler.fetch || handler;

const SECURITY_HEADERS = {
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

function addSecurityHeaders(res) {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    res.setHeader(key, value);
  }
}
const MAX_BODY_SIZE = 10 * 1024 * 1024; // 10 MB
  const server = createServer(async (req, res) => {
    addSecurityHeaders(res);
    try {
      const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

      // Serve static files: try dist/client (Vite output), then public/ (raw assets)
      if (!url.pathname.startsWith('/api/') && !url.pathname.includes('..') && extname(url.pathname)) {
        const candidates = [
          join(CLIENT_DIR, url.pathname),
          join(__dirname, 'public', url.pathname),
        ];
        for (const filePath of candidates) {
          try {
            const ext = extname(filePath).toLowerCase();
            const mime = MIME_TYPES[ext] || 'application/octet-stream';
            const cacheControl = url.pathname.startsWith('/assets/')
              ? 'public, max-age=31536000, immutable'
              : 'public, max-age=86400';
            res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': cacheControl });
            res.end(readFileSync(filePath));
            return;
          } catch { /* try next candidate */ }
        }
      }
      // SSR: forward to TanStack Start handler
      const nodeHandler = toNodeHandler ? toNodeHandler(fetch) : simpleNodeHandler(fetch);
      await nodeHandler(req, res);
    } catch (err) {
      console.error('Server error:', err);
      res.writeHead(500);
      res.end('Internal Server Error');
    }
  });

  server.listen(PORT, () => {
    console.log(`IEEE Sahrdaya app listening on port ${PORT}`);
  });

  process.on('SIGTERM', () => {
    console.log('SIGTERM received — closing gracefully...');
    server.close(() => process.exit(0));
  });
  process.on('SIGINT', () => {
    console.log('SIGINT received — closing gracefully...');
    server.close(() => process.exit(0));
  });
}

/**
 * Minimal Node.js handler for fetch-style handlers.
 * Used as fallback when srvx is not available.
 */
function simpleNodeHandler(fetch) {
  return async (req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      // Skip hop-by-hop headers that shouldn't be forwarded
      if (['connection', 'keep-alive', 'transfer-encoding'].includes(key)) continue;
      if (value) headers.set(key, Array.isArray(value) ? value.join(', ') : value);
    }

    let body = undefined;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const buf = Buffer.concat(chunks);
      // Use ReadableStream for body to match Web Fetch API expectations
      if (buf.length > 0) {
        body = new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(buf));
            controller.close();
          }
        });
      }
    }

    const request = new Request(url, {
      method: req.method,
      headers,
      body,
    });

    const response = await fetch(request);
    // Filter out hop-by-hop response headers
    const resHeaders = new Headers(response.headers);
    resHeaders.delete('transfer-encoding');
    res.writeHead(response.status, Object.fromEntries(resHeaders.entries()));
    if (response.body) {
      for await (const chunk of response.body) res.write(chunk);
    } else {
      res.end();
    }
  };
}

// Try to use srvx for better performance, fall back to simple handler
let toNodeHandler;
try {
  const srvx = await import('srvx/node');
  toNodeHandler = srvx.toNodeHandler;
  console.log('[server-entry] Using srvx toNodeHandler');
} catch (err) {
  toNodeHandler = null;
  console.log('[server-entry] srvx not available, using simpleNodeHandler:', err.message);
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
