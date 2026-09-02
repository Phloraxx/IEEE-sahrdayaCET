import { useLoaderData, type LoaderFunctionArgs } from "react-router";

import { PublicCertificateShell } from "@/components/certificates/PublicCertificateShell";
import { PublicCertificateRecord } from "@/components/certificates/PublicCertificateRecord";
import { fetchCertificateVerification, type CertificateVerification } from "@/server/public/certificate.server";

type LoaderData = { token: string; verification: CertificateVerification };

export async function loader({ params }: LoaderFunctionArgs): Promise<LoaderData> {
  const token = String(params.token || "").trim();
  return { token, verification: await fetchCertificateVerification(token) };
}

export function headers() {
  return {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex, nofollow",
  };
}

export const meta = ({ data }: { data?: LoaderData }) => {
  const verification = data?.verification;
  const title = verification?.status === "INVALID"
    ? "Invalid certificate | IEEE Sahrdaya"
    : `Verify ${verification?.credentialId || "certificate"} | IEEE Sahrdaya`;
  return [
    { title },
    { name: "description", content: "Verify an IEEE Sahrdaya Student Branch certificate credential." },
    { name: "robots", content: "noindex, nofollow" },
  ];
};
export default function CertificateVerificationRoute() {
  const { token, verification } = useLoaderData() as LoaderData;
  const valid = verification.status !== "INVALID";

  return (
    <PublicCertificateShell
      section="Credential registry"
      title={valid ? <>Certificate <span className="text-ieee-blue">record.</span></> : <>Verification <span className="text-ieee-blue">result.</span></>}
      description={valid
        ? "This public record is generated directly from the IEEE Sahrdaya issuer registry and reflects the credential's current state."
        : "This verification reference does not match an issued public credential in the IEEE Sahrdaya registry."}
    >
      <PublicCertificateRecord verification={verification} token={valid ? token : undefined} />
    </PublicCertificateShell>
  );
}
