import type { LoaderFunctionArgs } from "react-router";

import { createHash } from "node:crypto";
import { fetchCertificateRenderData } from "@/server/public/certificate.server";
import { cacheKey, read, write } from "@/server/certificates/render-cache";
import { renderCertificatePng } from "@/server/certificates/render.server";

function safeFilename(value: string) {
  return value.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "certificate";
}

export async function loader({ params }: LoaderFunctionArgs) {
  const token = String(params.token || "").trim();
  const data = await fetchCertificateRenderData(token);
  if (!data) throw new Response("Certificate not found", { status: 404 });

  // The render base is the template artwork, so its hash is a valid invalidation
  // key: republishing a template changes it and the cached render is bypassed.
  const key = cacheKey(
    data.credentialId,
    createHash("sha256").update(data.renderBase).digest("hex").slice(0, 16),
    "png",
  );
  const png = read(key) ?? write(key, await renderCertificatePng({ ...data, verificationToken: token }));
  return new Response(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": `inline; filename="${safeFilename(data.credentialId)}.png"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
