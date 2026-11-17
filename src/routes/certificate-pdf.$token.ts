import type { LoaderFunctionArgs } from "react-router";

import { createHash } from "node:crypto";
import { fetchCertificateRenderData } from "@/server/public/certificate.server";
import { cacheKey, read, write } from "@/server/certificates/render-cache";
import { renderCertificatePdf, renderCertificatePng } from "@/server/certificates/render.server";

function safeFilename(value: string) {
  return value.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "certificate";
}

export async function loader({ params }: LoaderFunctionArgs) {
  const token = String(params.token || "").trim();
  const data = await fetchCertificateRenderData(token);
  if (!data) throw new Response("Certificate not found", { status: 404 });

  const base = createHash("sha256").update(data.renderBase).digest("hex").slice(0, 16);
  const key = cacheKey(data.credentialId, base, "pdf");
  const cached = read(key);
  const pdf = cached ?? write(key, await (async () => {
    const png = await renderCertificatePng({ ...data, verificationToken: token });
    return renderCertificatePdf(png, data.canvasWidth, data.canvasHeight);
  })());
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${safeFilename(data.credentialId)}.pdf"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
