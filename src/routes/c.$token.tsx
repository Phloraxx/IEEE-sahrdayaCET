import { FileDown, ShieldCheck } from "lucide-react";
import { Link, useLoaderData, type LoaderFunctionArgs } from "react-router";

import { fetchCertificateVerification, type CertificateVerification } from "@/server/public/certificate.server";
import { certificateStatusPresentation, formatCertificateIssueDate, labelCertificateType } from "@/lib/certificate-verification";

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
  const status = certificateStatusPresentation(verification.status);
  const StatusIcon = status.icon;
  const validRecord = verification.status !== "INVALID";

  return (
    <main className="min-h-screen bg-[#f4f7fa] text-slate-950">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 py-7 sm:px-8 sm:py-10">
        <header className="flex items-center justify-between gap-4">
          <Link to="/" className="inline-flex items-center gap-3 text-sm font-semibold tracking-tight text-slate-900">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#00629B] text-xs font-black tracking-[-0.04em] text-white">IEEE</span>
            <span>IEEE Sahrdaya Student Branch</span>
          </Link>
          <span className="hidden text-xs font-medium uppercase tracking-[0.18em] text-slate-500 sm:inline">Credential verification</span>
        </header>

        <section className="my-auto grid gap-6 py-12 lg:grid-cols-[0.82fr_1.18fr] lg:items-stretch">
          <div className={`rounded-[28px] border p-7 shadow-[0_20px_70px_-45px_rgba(15,23,42,0.45)] sm:p-9 ${status.classes}`}>
            <div className="flex items-start justify-between gap-5">
              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-white/75 shadow-sm">
                <StatusIcon className="h-7 w-7" aria-hidden="true" />
              </span>
              <span className={`rounded-full px-3 py-1 text-[11px] font-bold tracking-[0.16em] ${status.badge}`}>{verification.status}</span>
            </div>
            <p className="mt-12 text-xs font-semibold uppercase tracking-[0.19em] opacity-60">Verification result</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">{status.title}</h1>
            <p className="mt-4 max-w-md text-sm leading-6 opacity-75 sm:text-base">{status.body}</p>
            <div className="mt-10 flex items-center gap-2 border-t border-current/10 pt-5 text-xs font-medium opacity-65">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              Verified directly against the issuer registry
            </div>
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-white p-7 shadow-[0_24px_80px_-50px_rgba(15,23,42,0.4)] sm:p-9">
            {validRecord ? (
              <>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#00629B]">Certificate record</p>
                <h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-4xl">{verification.recipientName}</h2>
                <p className="mt-2 text-base text-slate-500">{labelCertificateType(verification.certificateType)} certificate</p>

                <dl className="mt-9 grid gap-x-8 gap-y-6 border-t border-slate-100 pt-8 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Event</dt>
                    <dd className="mt-1.5 text-base font-medium text-slate-800">{verification.event}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Credential ID</dt>
                    <dd className="mt-1.5 break-all font-mono text-sm font-semibold text-slate-800">{verification.credentialId}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Issue date</dt>
                    <dd className="mt-1.5 text-sm font-medium text-slate-800">{formatCertificateIssueDate(verification.issueDate)}</dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Issuer</dt>
                    <dd className="mt-1.5 text-sm font-medium text-slate-800">{verification.issuer}</dd>
                  </div>
                </dl>

                <div className="mt-9 flex flex-wrap gap-3 border-t border-slate-100 pt-7">
                  <a href={`/c/${encodeURIComponent(token)}/certificate.pdf`} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#00629B] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#004f7e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00629B]/40">
                    <FileDown className="h-4 w-4" aria-hidden="true" /> Download PDF
                  </a>
                  <a href={`/c/${encodeURIComponent(token)}/certificate.png`} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300">
                    <FileDown className="h-4 w-4" aria-hidden="true" /> Download PNG
                  </a>
                </div>
              </>
            ) : (
              <div className="flex h-full min-h-80 flex-col justify-center">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">No public record</p>
                <h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-slate-950">Check the verification link</h2>
                <p className="mt-4 max-w-lg text-sm leading-6 text-slate-500">The link may be incomplete or invalid. A genuine IEEE Sahrdaya certificate uses its own random verification link.</p>
              </div>
            )}
          </div>
        </section>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-5 text-xs text-slate-500">
          <span>IEEE Sahrdaya Student Branch</span>
          <span>Public verification shows credential data only.</span>
        </footer>
      </div>
    </main>
  );
}
