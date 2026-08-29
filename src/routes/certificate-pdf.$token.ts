import type { LoaderFunctionArgs } from "react-router";

import { fetchCertificateRenderData } from "@/server/public/certificate.server";
import { renderCertificatePdf, renderCertificatePng } from "@/server/certificates/render.server";

function safeFilename(value: string) {
  return value.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "certificate";
}

export async function loader({ params }: LoaderFunctionArgs) {
  const token = String(params.token || "").trim();
  const data = await fetchCertificateRenderData(token);
  if (!data) throw new Response("Certificate not found", { status: 404 });

  const png = await renderCertificatePng({ ...data, verificationToken: token });
  const pdf = await renderCertificatePdf(png, data.canvasWidth, data.canvasHeight);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${safeFilename(data.credentialId)}.pdf"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
