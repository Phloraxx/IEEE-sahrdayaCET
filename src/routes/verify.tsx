import { Search, ShieldCheck } from "lucide-react";
import { Form, useLoaderData, type LoaderFunctionArgs } from "react-router";

import { PublicCertificateShell } from "@/components/certificates/PublicCertificateShell";
import { PublicCertificateRecord } from "@/components/certificates/PublicCertificateRecord";
import { fetchCertificateVerificationById, type CertificateVerification } from "@/server/public/certificate.server";

type LoaderData = {
  query: string;
  verification: CertificateVerification | null;
};

export async function loader({ request }: LoaderFunctionArgs): Promise<LoaderData> {
  const url = new URL(request.url);
  const query = String(url.searchParams.get("id") || "").trim().toUpperCase();
  if (!query) return { query: "", verification: null };
  return { query, verification: await fetchCertificateVerificationById(query) };
}

export function headers() {
  return {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex, nofollow",
  };
}

export const meta = () => [
  { title: "Verify certificate | IEEE Sahrdaya" },
  { name: "description", content: "Verify an IEEE Sahrdaya Student Branch certificate by Credential ID." },
  { name: "robots", content: "noindex, nofollow" },
];
export default function VerifyCertificateRoute() {
  const { query, verification } = useLoaderData() as LoaderData;

  return (
    <PublicCertificateShell
      section="Public registry"
      title={<>Verify a <span className="text-ieee-blue">certificate.</span></>}
      description="Enter the Credential ID printed on an IEEE Sahrdaya certificate. We check the live issuer registry, not the PDF itself."
    >
      <section className="bg-white">
        <div className="container mx-auto px-4 py-10 md:py-14">
          <div className="grid border-y border-black/10 lg:grid-cols-[1.18fr_.82fr]">
            <Form method="get" className="py-8 lg:border-r lg:border-black/10 lg:pr-10">
              <label htmlFor="credential-id" className="font-mono text-[9px] font-semibold uppercase tracking-[0.28em] text-black/40">
                <span className="mr-3 text-ieee-blue">02</span>Credential ID
              </label>
              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                <input
                  id="credential-id"
                  name="id"
                  defaultValue={query}
                  autoCapitalize="characters"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="IEEESB-2026-COMP-XXXXXXXXXX"
                  className="min-h-14 min-w-0 flex-1 border border-black/15 bg-white px-4 font-mono text-sm uppercase outline-none transition placeholder:text-black/25 focus:border-ieee-blue focus:ring-2 focus:ring-ieee-blue/10"
                />
                <button type="submit" className="inline-flex min-h-14 items-center justify-center gap-2 bg-black px-6 text-sm font-semibold text-white transition hover:bg-ieee-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ieee-blue/30">
                  <Search className="h-4 w-4" /> Verify
                </button>
              </div>
            </Form>
            <aside className="border-t border-black/10 py-8 lg:border-t-0 lg:pl-10">
              <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.28em] text-black/40">
                <span className="mr-3 text-ieee-blue">03</span>How it works
              </p>
              <div className="mt-5 grid gap-4 text-sm leading-6 text-black/55">
                <p><span className="mr-3 font-mono text-[10px] text-black/30">01</span>Use the non-sequential Credential ID printed on the certificate.</p>
                <p><span className="mr-3 font-mono text-[10px] text-black/30">02</span>The registry returns only public credential details and current status.</p>
                <p><span className="mr-3 font-mono text-[10px] text-black/30">03</span>Revoked or replaced credentials remain visible with their current state.</p>
              </div>
              <div className="mt-7 flex items-center gap-3 border-t border-black/10 pt-5 font-mono text-[9px] uppercase tracking-[0.18em] text-black/40">
                <ShieldCheck className="h-4 w-4 text-ieee-blue" /> No attendee contact data is public
              </div>
            </aside>
          </div>
        </div>
      </section>

      {verification && <PublicCertificateRecord verification={verification} compactInvalid />}
    </PublicCertificateShell>
  );
}
