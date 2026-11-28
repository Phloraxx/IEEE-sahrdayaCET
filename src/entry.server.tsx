import { randomBytes } from "node:crypto";
import { PassThrough } from "node:stream";

import type { AppLoadContext, EntryContext } from "react-router";
import { createReadableStreamFromReadable } from "@react-router/node";
import { ServerRouter } from "react-router";
import { isbot } from "isbot";
import type { RenderToPipeableStreamOptions } from "react-dom/server";
import { renderToPipeableStream } from "react-dom/server";
import { prepareDatabaseForStartup } from "@/lib/db.server";
import { buildContentSecurityPolicy } from "@/lib/csp";
import { PUBLIC_DOCUMENT_CACHE_CONTROL, isCacheablePublicDocument } from "@/server/http/cache";
import {
	renderCacheKey,
	renderCacheLookup,
	renderCacheMiss,
	renderCacheStore,
} from "@/server/http/render-cache.server";
import { startScheduler } from "@/server/jobs/scheduler.server";
import { resolveBuildIdentity } from "@/server/build-identity.server";
import { applyIntegrationGuard, describeIntegrations } from "@/server/integrations.server";

/**
 * The app owns its clock. This module is imported once per server process in
 * production, so starting the runner here gives every deploy a scheduler without
 * a host cron entry. See `src/server/jobs/scheduler.server.ts` for the why and
 * the single-instance assumptions.
 */
startScheduler();

/**
 * Prove the database before the first request.
 *
 * `src/lib/db.server.ts` opens and migrates lazily, which keeps scripts and
 * tests that never touch the database from creating one. The cost is that the
 * first *request* discovers a refusal: a missing production bind mount, an
 * unknown schema version, or a failed forward migration becomes a 500 for
 * whoever arrived first, and in production an empty database would have been
 * served long enough to look healthy.
 *
 * So this entry opens it once, at boot, and refuses to finish starting if that
 * fails. The gate matters, because this module is also evaluated by the Vite
 * build and by anything that imports the entry rather than running the server:
 *
 * - `NODE_ENV=production` (the container and `react-router-serve`) always runs
 *   it. A production storage or schema refusal throws out of module evaluation,
 *   the process exits non-zero, and no request is ever accepted. That is the
 *   intended behaviour: fail before real traffic, not during it.
 * - Outside production it runs only when asked (`DB_PREPARE_ON_BOOT=1`), so a
 *   dev server, a build, a unit test or a Playwright run does not create or
 *   mutate a database as a side effect of importing this file. Those
 *   environments keep the lazy path, which fails safe with the same codes.
 *
 * `getDatabase()` is a process singleton that remembers a throw, so the lazy
 * path and this call cannot disagree about the outcome or migrate twice.
 */
async function prepareDatabaseOnBoot(): Promise<void> {
	const always = process.env.NODE_ENV === "production";
	const requested = /^(1|true|on)$/i.test(process.env.DB_PREPARE_ON_BOOT ?? "");
	if (!always && !requested) return;
	try {
		await prepareDatabaseForStartup();
	} catch (error) {
		// The refusal message is already logged by the helper with its code; the
		// stack is what makes an operator able to find the call site.
		console.error("[db] startup refused; not accepting requests", error);
		throw error;
	}
}

/**
 * Start the boot check without blocking the module's export evaluation.
 *
 * React Router reads `streamTimeout` and the default export from this module at
 * server start; holding that behind an await would make the export a promise.
 * The check is captured so an unhandled rejection cannot be swallowed, and
 * production exits on it rather than continuing to serve.
 */
const databaseReady = prepareDatabaseOnBoot();

if (process.env.NODE_ENV === "production") {
	databaseReady.catch(() => {
		// `prepareDatabaseOnBoot` has already logged the reason. Exit non-zero so
		// the supervisor restarts only when the operator has fixed storage.
		process.exitCode = 1;
		setTimeout(() => process.exit(1), 0).unref?.();
	});
} else {
	databaseReady.catch(() => {
		// Best effort off production: the lazy path will raise the same error on
		// first use, with the same code, so this is not swallowed silently.
	});
}

/** Resolves once the boot-time database check has finished. Used by the health check. */
export const databaseBootCheck = databaseReady;

/**
 * Resolve the build identity before the first request. The Dockerfile bakes
 * `build/git-commit` and `build/git-tree`; this fills them in when the
 * deployment's environment does not carry them (a bare `docker compose up`, or
 * a pulled production image). See `src/server/build-identity.server.ts`.
 */
const knownCommit = resolveBuildIdentity();
console.log(`[boot] build identity: ${knownCommit ? "commit known" : "source build (no commit)"}`);

/**
 * Resolve which outbound integrations may act in this deployment before the
 * first request. The guard only reads the process environment; it never contacts
 * a provider. A PayGate endpoint without `PAYGATE_SANDBOX=true` refuses paid
 * registration initiation (fail closed on money), and the outcome is logged so
 * an inherited credential is visible in `docker logs` rather than discovered by
 * a test registration. See `src/server/integrations.server.ts`.
 */
const integrations = applyIntegrationGuard();
console.log(`[boot] integrations: ${describeIntegrations(integrations)}`);

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
