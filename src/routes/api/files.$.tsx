import { createFileRoute } from "@tanstack/react-router";

const PB_URL =
  process.env.POCKETBASE_URL || "http://ieee-pocketbase-8wt381-pocketbase-1:8090";

// @ts-expect-error - TanStack Router type system doesnt recognize splat routes
export const Route = createFileRoute("/api/files/$")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const filePath = (params as Record<string, string>)._splat;
          if (!filePath) {
            return Response.json({ error: "Missing file path" }, { status: 400 });
          }

          const url = new URL(request.url);
          const pbUrl = new URL(`${PB_URL}/api/files/${filePath}`);
          url.searchParams.forEach((v, k) => pbUrl.searchParams.set(k, v));

          const pbRes = await fetch(pbUrl.toString(), {
            method: request.method,
            headers: { host: new URL(PB_URL).host },
          });

          const headers = new Headers();
          pbRes.headers.forEach((v, k) => {
            if (!["transfer-encoding", "content-encoding"].includes(k.toLowerCase())) {
              headers.set(k, v);
            }
          });

          return new Response(pbRes.body, { status: pbRes.status, headers });
        } catch {
          return Response.json({ error: "Proxy error" }, { status: 502 });
        }
      },
    },
  },
});
