import { randomBytes } from "node:crypto";
import { PassThrough } from "node:stream";

import type { AppLoadContext, EntryContext } from "react-router";
import { createReadableStreamFromReadable } from "@react-router/node";
import { ServerRouter } from "react-router";
import { isbot } from "isbot";
import type { RenderToPipeableStreamOptions } from "react-dom/server";
import { renderToPipeableStream } from "react-dom/server";
import { buildContentSecurityPolicy } from "@/lib/csp";

export const streamTimeout = 5_000;

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
  responseHeaders.set("Content-Security-Policy", buildContentSecurityPolicy(nonce));

  // https://httpwg.org/specs/rfc9110.html#HEAD
  if (request.method.toUpperCase() === "HEAD") {
    return new Response(null, {
      status: responseStatusCode,
      headers: responseHeaders,
    });
  }

  return new Promise((resolve, reject) => {
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
}
