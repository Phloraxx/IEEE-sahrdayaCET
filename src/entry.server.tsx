import { randomBytes } from "node:crypto";
import { PassThrough } from "node:stream";

import type { AppLoadContext, EntryContext } from "react-router";
import { createReadableStreamFromReadable } from "@react-router/node";
import { ServerRouter } from "react-router";
import { isbot } from "isbot";
import type { RenderToPipeableStreamOptions } from "react-dom/server";
import { renderToPipeableStream } from "react-dom/server";
import { buildContentSecurityPolicy } from "@/lib/csp";
import { PUBLIC_DOCUMENT_CACHE_CONTROL, isCacheablePublicDocument } from "@/server/http/cache";
import {
	renderCacheKey,
	renderCacheLookup,
	renderCacheMiss,
	renderCacheStore,
} from "@/server/http/render-cache.server";
import { startScheduler } from "@/server/jobs/scheduler.server";

/**
 * The app owns its clock. This module is imported once per server process in
 * production, so starting the runner here gives every deploy a scheduler without
 * a host cron entry. See `src/server/jobs/scheduler.server.ts` for the why and
 * the single-instance assumptions.
 */
startScheduler();

export const streamTimeout = 5_000;

/** Same cookie the security policy and the shared-cache predicate use. */
const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME || "__Host-ieee_session";

/**
 * A fresh CSP nonce per document response.
 *
 * React Router's SSR output contains inline scripts it cannot hash: the
 * single-fetch stream controller embeds the loader payload, which differs on
 * every request. A nonce is the only way to authorise those without falling
 * back to `unsafe-inline`. Base64 so it satisfies the CSP `base64-value`
 * grammar.
 */
function createNonce(): string {
  return randomBytes(16).toString("base64");
}

export default function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
  // Unused, but part of the entry signature. `react-router.config.ts` enables
  // `v8_middleware`, so at runtime this is a `RouterContextProvider`.
  _loadContext: AppLoadContext,
) {
  // Production authorises React Router's inline scripts by nonce; development
  // keeps `unsafe-inline` for Vite's HMR client. `buildContentSecurityPolicy`
  // drops the nonce from the policy when it is not given one.
  const nonce = process.env.NODE_ENV === "production" ? createNonce() : undefined;

  // Anonymous public documents may be answered from the render cache. The body
  // was rendered with a different nonce, so every occurrence is rewritten to the
  // fresh one and the header is recomputed; if the old nonce is not in the body,
  // the entry is unusable and the request renders normally.
  const cacheable = nonce ? isCacheablePublicDocument(request, SESSION_COOKIE_NAME) : false;
  const cacheKey = cacheable ? renderCacheKey(request) : null;
  if (cacheKey && nonce) {
    const hit = renderCacheLookup(cacheKey);
    if (hit && hit.body.includes(hit.nonce)) {
      const headers = new Headers();
      for (const [name, value] of hit.headers) headers.set(name, value);
      headers.set("Content-Security-Policy", buildContentSecurityPolicy(nonce));
      headers.set("X-Render-Cache", "hit");
      return new Response(hit.body.split(hit.nonce).join(nonce), {
        status: hit.status,
        headers,
      });
    }
    renderCacheMiss();
  }

  responseHeaders.set("Content-Security-Policy", buildContentSecurityPolicy(nonce));

  // https://httpwg.org/specs/rfc9110.html#HEAD
  if (request.method.toUpperCase() === "HEAD") {
    return new Response(null, {
      status: responseStatusCode,
      headers: responseHeaders,
    });
  }

  const rendered = new Promise<Response>((resolve, reject) => {
    let shellRendered = false;
    const userAgent = request.headers.get("user-agent");

    // Ensure requests from bots and SPA Mode renders wait for all content to load before responding
    // https://react.dev/reference/react-dom/server/renderToPipeableStream#waiting-for-all-content-to-load-for-crawlers-and-static-generation
    //
    // `nonce` forces the same path for everyone else. React's Suspense
    // streaming emits its own inline scripts when a boundary resolves after
    // the shell — `<script id="_R_">` and the `$RC` reveal calls — and those
    // carry no nonce, so a nonce-based CSP blocks them and the boundary's
    // content stays inside its hidden `<div>`. Rendering everything up front
    // means React never emits them. The cost is TTFB: the response waits for
    // the slowest loader instead of streaming the shell early.
    const readyOption: keyof RenderToPipeableStreamOptions =
      nonce || (userAgent && isbot(userAgent)) || routerContext.isSpaMode
        ? "onAllReady"
        : "onShellReady";

    // Abort the rendering stream after the `streamTimeout` so it has time to
    // flush down the rejected boundaries
    let timeoutId: ReturnType<typeof setTimeout> | undefined = setTimeout(
      () => abort(),
      streamTimeout + 1000,
    );

    const { pipe, abort } = renderToPipeableStream(
      <ServerRouter context={routerContext} url={request.url} nonce={nonce} />,
      {
        [readyOption]() {
          shellRendered = true;
          const body = new PassThrough({
            final(callback) {
              // Clear the timeout to prevent retaining the closure and memory leak
              clearTimeout(timeoutId);
              timeoutId = undefined;
              callback();
            },
          });
          const stream = createReadableStreamFromReadable(body);

          responseHeaders.set("Content-Type", "text/html");

          pipe(body);

          resolve(
            new Response(stream, {
              headers: responseHeaders,
              status: responseStatusCode,
            }),
          );
        },
        onShellError(error: unknown) {
          reject(error);
        },
        onError(error: unknown) {
          responseStatusCode = 500;
          // Log streaming rendering errors from inside the shell.  Don't log
          // errors encountered during initial shell rendering since they'll
          // reject and get logged in handleDocumentRequest.
          if (shellRendered) {
            console.error(error);
          }
        },
      },
    );
  });
  if (!cacheKey || !nonce) return rendered;

  return rendered.then((response) => {
    // The middleware annotates the final response, not this one, so the checks
    // are on what the entry actually knows: a complete document, no cookie, no
    // redirect. Anything else must not be pinned.
    const contentType = response.headers.get("content-type") ?? "";
    if (
      response.status !== 200 ||
      !contentType.includes("text/html") ||
      response.headers.has("set-cookie")
    ) {
      return response;
    }

    // The hit path never reaches the middleware, so the shared-cache directive is
    // set here for both outcomes rather than being inherited.
    response.headers.set("Cache-Control", PUBLIC_DOCUMENT_CACHE_CONTROL);
    response.headers.set("X-Render-Cache", "miss");
    const clone = response.clone();
    void clone
      .text()
      .then((body) => {
        renderCacheStore(cacheKey, {
          status: response.status,
          headers: [...response.headers.entries()],
          body,
          nonce,
        });
      })
      .catch(() => {
        // A failed clone must never affect the response the visitor receives.
      });
    return response;
  });
}
