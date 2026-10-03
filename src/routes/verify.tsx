import { useEffect, useRef } from "react";
import { LoaderCircle, Search, ShieldCheck } from "lucide-react";
import { data, Form, Link, useLoaderData, useNavigation, type LoaderFunctionArgs } from "react-router";

import { certificateStatusPresentation } from "@/lib/certificate-verification";
import { PublicCertificateShell } from "@/components/certificates/PublicCertificateShell";
import { PublicCertificateRecord } from "@/components/certificates/PublicCertificateRecord";
import { fetchCertificateVerificationById, type CertificateVerification } from "@/server/public/certificate.server";

type LoaderData = {
  query: string;
  verification: CertificateVerification | null;
  unavailable: boolean;
};

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const query = String(url.searchParams.get("id") || "").trim().toUpperCase();
  if (!query) return data<LoaderData>({ query: "", verification: null, unavailable: false });
  try {
    return data<LoaderData>({ query, verification: await fetchCertificateVerificationById(query), unavailable: false });
  } catch {
    // A registry outage is not evidence that a credential is invalid.
    return data<LoaderData>({ query, verification: null, unavailable: true }, { status: 503 });
  }
}

export function headers({ parentHeaders }: { parentHeaders: Headers }) {
  const responseHeaders = new Headers(parentHeaders);
  responseHeaders.set("Cache-Control", "no-store");
  responseHeaders.set("X-Content-Type-Options", "nosniff");
  responseHeaders.set("X-Robots-Tag", "noindex, nofollow");
  return responseHeaders;
}

export const meta = () => [
  { title: "Verify certificate | IEEE Sahrdaya" },
  { name: "description", content: "Verify an IEEE Sahrdaya Student Branch certificate by Credential ID." },
  { name: "robots", content: "noindex, nofollow" },
];
export default function VerifyCertificateRoute() {
  const { query, verification, unavailable } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const checking = navigation.state !== "idle" && navigation.location?.pathname === "/verify";
  const resultRef = useRef<HTMLDivElement>(null);
  const submitted = useRef(false);
  const presentation = verification ? certificateStatusPresentation(verification.status) : null;
  useEffect(() => {
    if (!checking && submitted.current && (verification || unavailable)) {
      submitted.current = false;
      resultRef.current?.focus();
    }
  }, [checking, verification, unavailable]);

  return (
    <PublicCertificateShell
      section="Public registry"
      title={<>Verify a <span className="text-ieee-blue">certificate.</span></>}
      description="Enter the Credential ID printed on an IEEE Sahrdaya certificate. We check the live issuer registry, not the PDF itself."
    >
      <section className="bg-white">
        <div className="container mx-auto px-4 py-10 md:py-14">
          <div className="grid border-y border-black/10 lg:grid-cols-[1.18fr_.82fr]">
            <div className="min-w-0 py-6 lg:border-r lg:border-black/10 lg:pr-10">
              <Form method="get" action="/verify#verification-result" onSubmit={() => { submitted.current = true; }}>
                <label htmlFor="credential-id" className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-black/65">
                  <span aria-hidden="true" className="mr-3 text-ieee-blue">02</span>Credential ID
                </label>
                <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                  <input
                    id="credential-id"
                    name="id"
                    key={query}
                    defaultValue={query}
                    required
                  pattern={".*\\S.*"}
                  title="Enter the complete Credential ID, not just spaces."
                    aria-describedby="credential-help"
                    autoCapitalize="characters"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="IEEESB-2026-COMP-XXXXXXXXXX"
                    className="min-h-14 min-w-0 flex-1 border border-black/15 bg-white px-4 font-mono text-sm uppercase outline-none transition placeholder:text-black/50 focus:border-ieee-blue focus:ring-2 focus:ring-ieee-blue/10"
                  />
                  <button type="submit" disabled={checking} className="inline-flex min-h-14 items-center justify-center gap-2 bg-black px-6 text-sm font-semibold text-white transition hover:bg-ieee-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ieee-blue/30 disabled:cursor-wait disabled:opacity-65">
                    {checking ? <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Search className="h-4 w-4" aria-hidden="true" />}
                    {checking ? "Checking…" : "Verify"}
                  </button>
                </div>
                <p id="credential-help" className="mt-3 text-sm leading-6 text-black/60">Copy the complete Credential ID printed on your certificate. Letter case does not matter.</p>
              </Form>
              <div ref={resultRef} id="verification-result" role="status" aria-live="polite" aria-atomic="true" aria-busy={checking} tabIndex={-1} className="scroll-mt-28 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ieee-blue">
                {checking ? <p className="mt-5 text-sm text-black/65">Checking the issuer registry…</p> : unavailable ? (
                  <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-950">
                    <p className="font-semibold">Verification temporarily unavailable</p>
                    <p className="mt-2 text-sm leading-6">We couldn’t check the issuer registry. This does not tell us whether the credential is valid. Keep the ID above and try Verify again shortly.</p>
                    <Link to="/contact" className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4">Contact & support</Link>
                  </div>
                ) : presentation && verification ? (
                  <div className={`mt-5 rounded-xl border p-5 ${presentation.classes}`}>
                    <p className="font-semibold">{presentation.title}</p>
                    <p className="mt-2 text-sm leading-6">{presentation.body}</p>
                    <p className="mt-3 break-words font-mono text-xs leading-5">Checked ID: {query}</p>
                    {verification.status === "INVALID" ? (
                      <p className="mt-3 text-sm leading-6">Check for missing letters or digits, then try again. You can also <Link to="/contact" className="font-semibold underline underline-offset-4">contact the branch</Link> if the ID on your certificate still cannot be found.</p>
                    ) : <a href="#certificate-record" className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4">View public record</a>}
                  </div>
                ) : null}
              </div>
            </div>
            <aside className="border-t border-black/10 py-8 lg:border-t-0 lg:pl-10">
              <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-black/65">
                <span aria-hidden="true" className="mr-3 text-ieee-blue">03</span>How it works
              </h2>
              <div className="mt-5 grid gap-4 text-sm leading-6 text-black/65">
                <p><span className="mr-3 font-mono text-[11px] text-black/60">01</span>Use the non-sequential Credential ID printed on the certificate.</p>
                <p><span className="mr-3 font-mono text-[11px] text-black/60">02</span>The registry returns only public credential details and current status.</p>
                <p><span className="mr-3 font-mono text-[11px] text-black/60">03</span>Revoked or replaced credentials remain visible with their current state.</p>
              </div>
              <div className="mt-7 flex items-center gap-3 border-t border-black/10 pt-5 font-mono text-[11px] uppercase tracking-[0.12em] text-black/65">
                <ShieldCheck className="h-4 w-4 text-ieee-blue" /> No attendee contact data is public
              </div>
            </aside>
          </div>
        </div>
      </section>

      {verification && verification.status !== "INVALID" && (
        <div id="certificate-record" tabIndex={-1} className="scroll-mt-28"><PublicCertificateRecord verification={verification} /></div>
      )}
    </PublicCertificateShell>
  );
}
