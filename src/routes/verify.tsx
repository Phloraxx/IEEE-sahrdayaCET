import { Search, ShieldCheck } from "lucide-react";
import { Form, Link, useLoaderData, type LoaderFunctionArgs } from "react-router";

import { fetchCertificateVerificationById, type CertificateVerification } from "@/server/public/certificate.server";
import { certificateStatusPresentation, formatCertificateIssueDate, labelCertificateType } from "@/lib/certificate-verification";

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
  const view = certificateStatusPresentation(verification?.status || "INVALID");
  const StatusIcon = view.icon;
  const found = verification && verification.status !== "INVALID";

  return (
    <main className="min-h-screen bg-[#f4f7fa] text-slate-950">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-5 py-7 sm:px-8 sm:py-10">
        <header className="flex items-center justify-between gap-4">
          <Link to="/" className="inline-flex items-center gap-3 text-sm font-semibold tracking-tight text-slate-900">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#00629B] text-xs font-black text-white">IEEE</span>
            <span>IEEE Sahrdaya Student Branch</span>
          </Link>
          <span className="hidden text-xs font-medium uppercase tracking-[0.18em] text-slate-500 sm:inline">Credential verification</span>
        </header>

        <section className="my-auto py-12">
          <div className="mx-auto max-w-3xl rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_30px_90px_-55px_rgba(15,23,42,.45)] sm:p-9">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#00629B]">Verify a certificate</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">Enter the Credential ID.</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">Use the ID printed on an IEEE Sahrdaya certificate. Verification checks the live issuer registry, not the PDF itself.</p>

            <Form method="get" className="mt-7 flex flex-col gap-3 sm:flex-row">
              <input
                name="id"
                defaultValue={query}
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                placeholder="IEEESB-2026-COMP-XXXXXXXXXX"
                className="min-h-12 flex-1 rounded-xl border border-slate-300 bg-white px-4 font-mono text-sm uppercase outline-none transition focus:border-[#00629B] focus:ring-4 focus:ring-[#00629B]/10"
              />
              <button type="submit" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#00629B] px-5 text-sm font-semibold text-white hover:bg-[#004f7e]">
                <Search className="h-4 w-4" />Verify
              </button>
            </Form>

            {verification && (
              <div className={`mt-7 rounded-2xl border p-5 sm:p-6 ${view.classes}`}>
                <div className="flex items-start gap-4">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/75"><StatusIcon className="h-5 w-5" /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-xl font-semibold">{view.title}</h2><span className="rounded-full bg-white/70 px-2.5 py-1 text-[10px] font-bold tracking-[0.14em]">{verification.status}</span></div>
                    {!found ? <p className="mt-2 text-sm opacity-75">No issued certificate matches that Credential ID. Check every letter and number and try again.</p> : (
                      <dl className="mt-5 grid gap-4 border-t border-current/10 pt-5 sm:grid-cols-2">
                        <div className="sm:col-span-2"><dt className="text-[10px] font-semibold uppercase tracking-[0.14em] opacity-60">Recipient</dt><dd className="mt-1 text-lg font-semibold">{verification.recipientName}</dd></div>
                        <div className="sm:col-span-2"><dt className="text-[10px] font-semibold uppercase tracking-[0.14em] opacity-60">Event</dt><dd className="mt-1 text-sm font-medium">{verification.event}</dd></div>
                        <div><dt className="text-[10px] font-semibold uppercase tracking-[0.14em] opacity-60">Type</dt><dd className="mt-1 text-sm font-medium">{labelCertificateType(verification.certificateType)}</dd></div>
                        <div><dt className="text-[10px] font-semibold uppercase tracking-[0.14em] opacity-60">Issue date</dt><dd className="mt-1 text-sm font-medium">{formatCertificateIssueDate(verification.issueDate)}</dd></div>
                        <div className="sm:col-span-2"><dt className="text-[10px] font-semibold uppercase tracking-[0.14em] opacity-60">Credential ID</dt><dd className="mt-1 break-all font-mono text-sm font-semibold">{verification.credentialId}</dd></div>
                        <div className="sm:col-span-2"><dt className="text-[10px] font-semibold uppercase tracking-[0.14em] opacity-60">Issuer</dt><dd className="mt-1 text-sm font-medium">{verification.issuer}</dd></div>
                      </dl>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="mt-7 flex items-center gap-2 border-t border-slate-100 pt-5 text-xs text-slate-500">
              <ShieldCheck className="h-4 w-4 text-[#00629B]" />The Credential ID is non-sequential and uniquely assigned at issuance.
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
