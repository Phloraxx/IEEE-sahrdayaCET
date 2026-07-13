/**
 * Production server entry for TanStack Start.
 * Wraps the SSR handler (dist/server/server.js) in a Node.js HTTP server.
 * Use: node server-entry.mjs
 */

import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
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
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
};

/** Media types that need Range + Content-Length for reliable browser playback (esp. Safari). */
const RANGE_MEDIA = new Set(['.mp4', '.webm', '.mov']);

/**
 * Serve a static file with correct Content-Length.
 * For media, also supports Accept-Ranges / HTTP 206 partial content so
 * <video> can stream instead of waiting on chunked transfer encoding
 * (which lacks Content-Length after writeHead and breaks autoplay).
 */
function serveStaticFile(req, res, filePath, { mime, cacheControl, addSecurityHeaders }) {
  let stat;
  try {
    stat = statSync(filePath);
  } catch {
    return false;
  }
  if (!stat.isFile()) return false;

  const size = stat.size;
  const isMedia = RANGE_MEDIA.has(extname(filePath).toLowerCase());
  const method = (req.method || 'GET').toUpperCase();
  const rangeHeader = req.headers.range;

  addSecurityHeaders(res);

  // HEAD: metadata only
  if (method === 'HEAD') {
    res.writeHead(200, {
      'Content-Type': mime,
      'Content-Length': size,
      'Cache-Control': cacheControl,
      ...(isMedia ? { 'Accept-Ranges': 'bytes' } : {}),
    });
    res.end();
    return true;
  }

  // Byte-range partial content (required by Safari for progressive video)
  if (isMedia && rangeHeader) {
    const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim());
    if (!match) {
      res.writeHead(416, {
        'Content-Type': 'text/plain',
        'Content-Range': `bytes */${size}`,
      });
      res.end('Range Not Satisfiable');
      return true;
    }

    let start = match[1] === '' ? NaN : Number(match[1]);
    let end = match[2] === '' ? NaN : Number(match[2]);

    if (Number.isNaN(start) && Number.isNaN(end)) {
      res.writeHead(416, {
        'Content-Type': 'text/plain',
        'Content-Range': `bytes */${size}`,
      });
      res.end('Range Not Satisfiable');
      return true;
    }

    // suffix range: bytes=-500 → last 500 bytes
    if (Number.isNaN(start)) {
      const suffix = end;
      start = Math.max(0, size - suffix);
      end = size - 1;
    } else if (Number.isNaN(end)) {
      end = size - 1;
    }

    if (start >= size || end >= size || start > end) {
      res.writeHead(416, {
        'Content-Type': 'text/plain',
        'Content-Range': `bytes */${size}`,
      });
      res.end('Range Not Satisfiable');
      return true;
    }

    const chunkSize = end - start + 1;
    res.writeHead(206, {
      'Content-Type': mime,
      'Content-Length': chunkSize,
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Accept-Ranges': 'bytes',
      'Cache-Control': cacheControl,
    });
    const stream = createReadStream(filePath, { start, end });
    stream.on('error', () => {
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
    stream.pipe(res);
    return true;
  }

  // Full body — always set Content-Length before writeHead so Node does not
  // fall back to Transfer-Encoding: chunked (breaks many video players).
  res.writeHead(200, {
    'Content-Type': mime,
    'Content-Length': size,
    'Cache-Control': cacheControl,
    ...(isMedia ? { 'Accept-Ranges': 'bytes' } : {}),
  });
  const stream = createReadStream(filePath);
  stream.on('error', () => {
    if (!res.headersSent) res.writeHead(500);
    res.end();
  });
  stream.pipe(res);
  return true;
}

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
  'Content-Security-Policy': "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'; media-src 'self'; img-src 'self' data: https:; font-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self' https://*.pocketbase.io https://*.ieeesahrdaya.com https://accounts.google.com https://site.api.espn.com https://api.football-data.org https://raw.githubusercontent.com; frame-src https://accounts.google.com",
};

function addSecurityHeaders(res) {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    res.setHeader(key, value);
  }
}

/** Add security headers after SSR without touching writeHead. */
function addSecurityHeadersSafely(res) {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    if (res.getHeader(key)) continue;
    try {
      res.setHeader(key, value);
    } catch (err) {
      // Streaming SSR may flush headers before the handler promise resolves.
      if (err?.code !== 'ERR_HTTP_HEADERS_SENT') throw err;
    }
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

function wrapHandlerWithSecurityHeaders(handler) {
  return async (req, res) => {
    // Never patch res.writeHead. srvx passes headers as a flat string array
    // (e.g. ['content-type', 'text/html; charset=utf-8']). Spreading that
    // array into an object yields { 0: 'content-type', 1: 'text/html...' },
    // so browsers show raw HTML instead of rendering the page.
    await handler(req, res);
    addSecurityHeadersSafely(res);
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

      // Same-origin proxy for client-side PB SSE + public FIFA read routes.
      // Allowlist only — never open the whole PB REST surface.
      // Allowed:
      //   GET/HEAD realtime SSE: /api/realtime
      //   GET public FIFA custom routes: /api/fifa/leaderboard|feed|stats
      //   GET collection reads for public game collections only
      if (url.pathname.startsWith('/pb/')) {
        try {
          const method = (req.method || 'GET').toUpperCase();
          const targetPath = url.pathname.replace(/^\/pb/, '') + (url.search || '');
          const pathOnly = (url.pathname.replace(/^\/pb/, '') || '/').split('?')[0];

          const isGet = method === 'GET' || method === 'HEAD';
          const isRealtime = pathOnly === '/api/realtime';
          const isPublicFifaRoute = /^\/api\/fifa\/(leaderboard|feed|stats)\/?$/.test(pathOnly);
          const isPublicCollection = /^\/api\/collections\/(fifa_feed_events|fifa_bet_markets|fifa_matches)(\/|$)/.test(pathOnly);

          // SSE subscribe is POST on /api/realtime in PB — allow only that write path.
          const isRealtimeSubscribe = method === 'POST' && pathOnly === '/api/realtime';

          if (!(isRealtimeSubscribe || (isGet && (isRealtime || isPublicFifaRoute || isPublicCollection)))) {
            addSecurityHeaders(res);
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Forbidden: /pb path not allowlisted' }));
            return;
          }

          const pbUrl = process.env.POCKETBASE_URL || 'http://127.0.0.1:8090';
          const targetUrl = `${pbUrl}${targetPath}`;
          const pbHeaders = new Headers();
          for (const [key, value] of Object.entries(req.headers)) {
            if (['connection', 'keep-alive', 'transfer-encoding', 'host'].includes(key)) continue;
            // Drop auth for public proxy — these endpoints are public reads.
            if (['authorization', 'cookie'].includes(key)) continue;
            pbHeaders.set(key, Array.isArray(value) ? value.join(', ') : value);
          }
          let pbBody = undefined;
          if (isRealtimeSubscribe) {
            const buf = await readBodyLimited(req);
            if (buf && buf.length > 0) pbBody = buf;
          }
          // Abort the upstream fetch when the client goes away — otherwise a
          // closed SSE tab leaves this loop reading from PB indefinitely.
          const upstreamAbort = new AbortController();
          res.on('close', () => upstreamAbort.abort());
          const pbRes = await globalFetch(targetUrl, { method: req.method, headers: pbHeaders, body: pbBody, signal: upstreamAbort.signal });
          addSecurityHeaders(res);
          res.writeHead(pbRes.status, Object.fromEntries(pbRes.headers.entries()));
          if (pbRes.body) {
            for await (const chunk of pbRes.body) res.write(chunk);
          }
          res.end();
        } catch (err) {
          // Long-lived /api/realtime SSE streams always end with a socket
          // close — client tab gone (abort) or upstream dropping the
          // connection (undici "terminated"/UND_ERR_SOCKET; routine when
          // POCKETBASE_URL goes through Cloudflare, which caps stream
          // lifetimes). The PB client SDK auto-reconnects, so these are not
          // server faults — one quiet line, no stack trace.
          const benign =
            err?.name === 'AbortError' ||
            err?.message === 'terminated' ||
            err?.code === 'UND_ERR_SOCKET' ||
            err?.cause?.code === 'UND_ERR_SOCKET';
          if (benign) {
            console.log(`[pb-proxy] stream closed (${url.pathname})`);
          } else {
            console.error('[pb-proxy] Error:', err);
          }
          if (!res.headersSent) {
            addSecurityHeaders(res);
            if (err.message === 'PAYLOAD_TOO_LARGE') {
              res.writeHead(413, { 'Content-Type': 'text/plain' });
              res.end('Payload Too Large');
            } else {
              res.writeHead(502, { 'Content-Type': 'text/plain' });
              res.end('Bad Gateway: ' + (err.message || 'Unknown error'));
            }
          } else {
            res.end();
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
          const isMedia = RANGE_MEDIA.has(ext);
          // Media: shorter TTL so header fixes (Range/Content-Length) propagate
          // through CDNs; hashed assets stay immutable.
          const cacheControl = url.pathname.startsWith('/assets/')
            ? 'public, max-age=31536000, immutable'
            : isMedia
              ? 'public, max-age=3600'
              : 'public, max-age=86400';
          if (serveStaticFile(req, res, filePath, { mime, cacheControl, addSecurityHeaders })) {
            return;
          }
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
      if (buf && buf.length > 0) body = buf;
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
