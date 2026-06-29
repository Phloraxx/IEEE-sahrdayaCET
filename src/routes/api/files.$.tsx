import { createPB } from "@/lib/pb.server"
import { requireAuth } from "@/lib/auth";

import { createFileRoute } from "@tanstack/react-router";

const PB_URL = process.env.POCKETBASE_URL;
if (!PB_URL) throw new Error("POCKETBASE_URL is not configured");

export const Route = createFileRoute("/api/files/$")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const filePath = (params as Record<string, string>)._splat;
          if (!filePath) {
            return Response.json({ error: "Missing file path" }, { status: 400 });
          }
          if (!/^[a-zA-Z0-9_]+\/[a-zA-Z0-9_]+\/[^/]+$/.test(filePath) || filePath.includes('..')) {
            return Response.json({ error: 'Invalid file path' }, { status: 400 });
          }
          // Require auth — file proxy must not expose files to anonymous users
          const pb = createPB(request.headers.get("cookie") || undefined);
          await requireAuth(pb);

          const url = new URL(request.url);
          const pbUrl = new URL(`${PB_URL}/api/files/${filePath}`);
          url.searchParams.forEach((v, k) => pbUrl.searchParams.set(k, v));

          const pbRes = await fetch(pbUrl.toString(), {
            method: request.method,
            headers: {
              host: new URL(PB_URL).host,
              cookie: request.headers.get('cookie') || '',
            },
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
