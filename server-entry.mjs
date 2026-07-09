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
  const tsrFetch = handler.fetch || handler;
  const globalFetch = globalThis.fetch;

const SECURITY_HEADERS = {
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'; img-src 'self' data: https:; font-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self' https://*.pocketbase.io https://*.ieeesahrdaya.com https://accounts.google.com https://site.api.espn.com https://api.football-data.org https://raw.githubusercontent.com; frame-src https://accounts.google.com",
};

function addSecurityHeaders(res) {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    res.setHeader(key, value);
  }
}

const MAX_BODY_SIZE = 10 * 1024 * 1024; // 10 MB

/** Read request body with a size cap. Returns Buffer or null for empty bodies. */
async function readBodyLimited(req, maxBytes = MAX_BODY_SIZE) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBytes) throw new Error('PAYLOAD_TOO_LARGE');
    chunks.push(chunk);
  }
  return chunks.length ? Buffer.concat(chunks) : null;
}

/** Public FIFA collections allowed through the /pb proxy (read-only + SSE). */
const PB_PROXY_ALLOWED = [
  /^\/api\/realtime$/,
  /^\/api\/collections\/fifa_feed_events\/records$/,
  /^\/api\/collections\/fifa_bet_markets\/records$/,
  /^\/api\/collections\/fifa_matches\/records$/,
  /^\/api\/fifa\/leaderboard$/,
  /^\/api\/fifa\/feed$/,
];

function isPbProxyAllowed(pathname, method) {
  if (method !== 'GET' && method !== 'HEAD' && !pathname.startsWith('/api/realtime')) {
    return false;
  }
  return PB_PROXY_ALLOWED.some((re) => re.test(pathname));
}

function wrapHandlerWithSecurityHeaders(handler) {
  return async (req, res) => {
    await handler(req, res);
    if (!res.headersSent) addSecurityHeaders(res);
    else {
      for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
        if (!res.getHeader(key)) res.setHeader(key, value);
      }
    }
  };
}

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

      // Health check endpoint — bypasses SSR router.
      if (url.pathname === '/health') {
        addSecurityHeaders(res);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', uptime: process.uptime() }));
        return;
      }

      // Same-origin proxy for client-side PB SSE subscriptions (public
      // collections only: fifa_feed_events, fifa_bet_markets, fifa_matches).
      // POCKETBASE_URL stays server-side; this exposes only the /pb path.
      if (url.pathname.startsWith('/pb/')) {
        try {
          const targetPath = url.pathname.replace(/^\/pb/, '') + (url.search || '');
          if (!isPbProxyAllowed(targetPath.split('?')[0], req.method || 'GET')) {
            addSecurityHeaders(res);
            res.writeHead(403, { 'Content-Type': 'text/plain' });
            res.end('Forbidden');
            return;
          }
          const pbUrl = process.env.POCKETBASE_URL || 'http://127.0.0.1:8090';
          const targetUrl = `${pbUrl}${targetPath}`;
          const pbHeaders = new Headers();
          for (const [key, value] of Object.entries(req.headers)) {
            if (['connection', 'keep-alive', 'transfer-encoding', 'host', 'authorization'].includes(key)) continue;
            pbHeaders.set(key, Array.isArray(value) ? value.join(', ') : value);
          }
          let pbBody = undefined;
          if (req.method !== 'GET' && req.method !== 'HEAD') {
            const buf = await readBodyLimited(req);
            if (buf && buf.length > 0) {
              pbBody = new ReadableStream({
                start(controller) {
                  controller.enqueue(new Uint8Array(buf));
                  controller.close();
                }
              });
            }
          }
          const pbRes = await globalFetch(targetUrl, { method: req.method, headers: pbHeaders, body: pbBody });
          addSecurityHeaders(res);
          res.writeHead(pbRes.status, Object.fromEntries(pbRes.headers.entries()));
          if (pbRes.body) {
            for await (const chunk of pbRes.body) res.write(chunk);
          }
          res.end();
        } catch (err) {
          console.error('[pb-proxy] Error:', err);
          addSecurityHeaders(res);
          if (err.message === 'PAYLOAD_TOO_LARGE') {
            res.writeHead(413, { 'Content-Type': 'text/plain' });
            res.end('Payload Too Large');
          } else {
            res.writeHead(502, { 'Content-Type': 'text/plain' });
            res.end('Bad Gateway: ' + (err.message || 'Unknown error'));
          }
        }
        return;
      }

      // Serve static files: try dist/client (Vite output), then public/ (raw assets)
      if (!url.pathname.startsWith('/api/') && !url.pathname.includes('..') && extname(url.pathname)) {
        const candidates = [
          join(CLIENT_DIR, url.pathname),
          join(__dirname, 'public', url.pathname),
        ];
        for (const filePath of candidates) {
          if (!existsSync(filePath)) continue;
          const ext = extname(filePath).toLowerCase();
          const mime = MIME_TYPES[ext] || 'application/octet-stream';
          const cacheControl = url.pathname.startsWith('/assets/')
            ? 'public, max-age=31536000, immutable'
            : 'public, max-age=86400';
          addSecurityHeaders(res);
          res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': cacheControl });
          res.end(readFileSync(filePath));
          return;
        }
      }
      // SSR: forward to TanStack Start handler
      const baseHandler = toNodeHandler ? toNodeHandler(tsrFetch) : simpleNodeHandler(tsrFetch);
      const nodeHandler = wrapHandlerWithSecurityHeaders(baseHandler);
      await nodeHandler(req, res);
    } catch (err) {
      console.error('Server error:', err);
      if (!res.headersSent) {
        addSecurityHeaders(res);
        res.writeHead(500);
        res.end('Internal Server Error');
      }
    }
  });

  server.listen(PORT, () => {
    console.log(`IEEE Sahrdaya app listening on port ${PORT}`);
  });

  // Graceful restart every 25 minutes to prevent TanStack Start router
  // singleton state corruption (causes 307 redirect loops after ~30 min).
  // Docker's restart: unless-stopped policy brings the process back in <2s.
  const RESTART_INTERVAL_MS = 25 * 60 * 1000;
  const jitter = Math.floor(Math.random() * 5 * 60 * 1000); // 0-5 min jitter
  setTimeout(() => {
    console.log(`Scheduled restart after ${Math.round((RESTART_INTERVAL_MS + jitter) / 60000)} min — closing gracefully...`);
    server.close(() => process.exit(0));
  }, RESTART_INTERVAL_MS + jitter);

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
      const buf = await readBodyLimited(req);
      if (buf && buf.length > 0) {
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
