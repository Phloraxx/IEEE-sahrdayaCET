import { FileDown, ShieldCheck } from "lucide-react";

import type { CertificateVerification } from "@/server/public/certificate.server";
import { certificateStatusPresentation, formatCertificateIssueDate, labelCertificateType } from "@/lib/certificate-verification";

interface PublicCertificateRecordProps {
  verification: CertificateVerification;
  token?: string;
  compactInvalid?: boolean;
}

const statusAccent: Record<string, string> = {
  ACTIVE: "text-ieee-light-blue",
  REVOKED: "text-rose-400",
  SUPERSEDED: "text-amber-300",
  INVALID: "text-white/55",
};

const statusRule: Record<string, string> = {
  ACTIVE: "bg-ieee-light-blue",
  REVOKED: "bg-rose-400",
  SUPERSEDED: "bg-amber-300",
  INVALID: "bg-white/25",
};

export function PublicCertificateRecord({ verification, token, compactInvalid = false }: PublicCertificateRecordProps) {
  const view = certificateStatusPresentation(verification.status);
  const StatusIcon = view.icon;
  const valid = verification.status !== "INVALID";
  const accent = statusAccent[verification.status] || statusAccent.INVALID;
  const rule = statusRule[verification.status] || statusRule.INVALID;

  return (
    <section className="border-b border-black/10 bg-white">
      <div className="container mx-auto px-4 py-10 md:py-16">        <div className="overflow-hidden rounded-2xl border border-black/10 shadow-[0_18px_50px_-35px_rgba(15,23,42,.45)]">
          <div className="grid lg:grid-cols-[0.78fr_1.22fr]">
            <div className="relative overflow-hidden bg-[#06111f] p-6 text-white sm:p-8 lg:min-h-[520px] lg:p-10">
              <div className={`absolute inset-x-0 top-0 h-1 ${rule}`} />
              <div className="flex items-start justify-between gap-4">
                <span className="grid h-12 w-12 place-items-center border border-white/15 bg-white/5">
                  <StatusIcon className={`h-6 w-6 ${accent}`} aria-hidden="true" />
                </span>
                <span className="border border-white/15 px-3 py-1.5 font-mono text-[9px] font-semibold uppercase tracking-[0.24em] text-white/70">
                  {verification.status}
                </span>
              </div>

              <div className="mt-16 max-w-md lg:mt-24">
                <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.28em] text-white/40">Registry result</p>
                <h2 className="mt-4 text-4xl font-semibold leading-[0.95] tracking-[-0.055em] sm:text-5xl">{view.title}</h2>
                <p className="mt-5 text-sm leading-6 text-white/55 sm:text-base">{view.body}</p>
              </div>

              <div className="mt-14 flex items-center gap-3 border-t border-white/10 pt-5 font-mono text-[9px] uppercase tracking-[0.18em] text-white/45 lg:absolute lg:inset-x-10 lg:bottom-10">
                <ShieldCheck className={`h-4 w-4 ${accent}`} aria-hidden="true" />
                Live issuer registry
              </div>
            </div>
            <div className="bg-white p-6 sm:p-8 lg:p-10">
              {valid ? (
                <>
                  <div className="flex flex-col gap-3 border-b border-black/10 pb-7 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.28em] text-black/35">Certificate record</p>
                      <h3 className="mt-3 text-3xl font-semibold leading-none tracking-[-0.045em] sm:text-4xl">{verification.recipientName}</h3>
                    </div>
                    <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.22em] text-ieee-blue">{labelCertificateType(verification.certificateType)}</span>
                  </div>

                  <dl className="grid border-b border-black/10 sm:grid-cols-2">
                    <RecordField index="01" label="Event" value={verification.event || "—"} wide />
                    <RecordField index="02" label="Credential ID" value={verification.credentialId || "—"} mono />
                    <RecordField index="03" label="Issue date" value={formatCertificateIssueDate(verification.issueDate)} />
                    <RecordField index="04" label="Issuer" value={verification.issuer || "—"} wide />
                  </dl>

                  {token && (
                    <div className="flex flex-col gap-3 pt-7 sm:flex-row">
                      <DownloadLink href={`/c/${encodeURIComponent(token)}/certificate.pdf`} label="Download PDF" primary />
                      <DownloadLink href={`/c/${encodeURIComponent(token)}/certificate.png`} label="Download PNG" />
                    </div>
                  )}
                </>
              ) : (
                <InvalidRecord compact={compactInvalid} />
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
function RecordField({ index, label, value, wide = false, mono = false }: { index: string; label: string; value: string; wide?: boolean; mono?: boolean }) {
  return (
    <div className={`border-black/10 py-5 sm:px-5 sm:first:pl-0 ${wide ? "sm:col-span-2" : "sm:border-r last:sm:border-r-0"}`}>
      <dt className="flex items-center gap-3 font-mono text-[9px] font-semibold uppercase tracking-[0.22em] text-black/35">
        <span className="text-ieee-blue">{index}</span>{label}
      </dt>
      <dd className={`mt-2 break-words text-sm font-medium text-black/75 ${mono ? "font-mono" : ""}`}>{value}</dd>
    </div>
  );
}

function DownloadLink({ href, label, primary = false }: { href: string; label: string; primary?: boolean }) {
  return (
    <a href={href} className={`inline-flex min-h-12 items-center justify-center gap-2 px-5 text-sm font-semibold transition ${primary ? "bg-black text-white hover:bg-ieee-blue" : "border border-black/15 bg-white text-black hover:border-black/35"}`}>
      <FileDown className="h-4 w-4" aria-hidden="true" />{label}
    </a>
  );
}

function InvalidRecord({ compact }: { compact: boolean }) {
  return (
    <div className={`flex flex-col justify-center ${compact ? "min-h-52" : "min-h-[360px]"}`}>
      <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.28em] text-black/35">No public record</p>
      <h3 className="mt-4 max-w-xl text-3xl font-semibold leading-[0.98] tracking-[-0.045em] sm:text-4xl">Check the Credential ID and try again.</h3>
      <p className="mt-4 max-w-xl text-sm leading-6 text-black/50">A genuine IEEE Sahrdaya credential must match an issued record in the live registry. Invalid or incomplete references are never treated as valid certificates.</p>
    </div>
  );
}
