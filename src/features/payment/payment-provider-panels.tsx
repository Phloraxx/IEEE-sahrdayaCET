import type { ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Check,
  Loader2,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Smartphone,
} from "lucide-react";

import type { RegistrationPaymentSession } from "@/lib/data/payment.client";
import { formatDate } from "@/lib/dates";
import { MOTION_DURATION, MOTION_EASE } from "@/lib/motion";

export function formatCountdown(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

export function PaymentProgress({ complete = false }: { complete?: boolean }) {
  const reduceMotion = Boolean(useReducedMotion());
  const steps = ["Details", "Payment", "Ticket"];
  const active = complete ? 2 : 1;
  return (
    <div
      className="flex items-center justify-center gap-2"
      aria-label="Registration progress"
    >
      {steps.map((step, index) => (
        <div key={step} className="contents">
          {index > 0 && (
            <div className="relative h-px w-6 overflow-hidden bg-black/12 sm:w-9">
              {index <= active && (
                <motion.div
                  initial={reduceMotion ? false : { scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: reduceMotion ? 0 : MOTION_DURATION.ui, ease: MOTION_EASE }}
                  className="absolute inset-0 origin-left bg-ieee-blue"
                />
              )}
            </div>
          )}
          <div
            className={`flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-[0.13em] ${index <= active ? "text-ieee-blue" : "text-slate-400"}`}
          >
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full border ${index < active ? "border-ieee-blue bg-ieee-blue text-white" : index === active ? "border-ieee-blue bg-ieee-blue/5" : "border-slate-200"}`}
            >
              {index < active ? <Check className="h-3 w-3" /> : index + 1}
            </span>
            <span className="hidden sm:inline">{step}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function PaymentShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-[#f4f2ed] text-[#111315] selection:bg-[#00629B] selection:text-white">
      <main className="mx-auto flex min-h-dvh w-full max-w-[1440px] items-center px-5 py-8 sm:px-8 sm:py-10 lg:px-12">
        {children}
      </main>
    </div>
  );
}

export function EventVisual({
  session,
  reduceMotion,
}: {
  session: RegistrationPaymentSession;
  reduceMotion: boolean;
}) {
  const event = session.event;
  return (
    <motion.aside
      initial={reduceMotion ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduceMotion ? 0 : MOTION_DURATION.reveal, ease: MOTION_EASE }}
      className="flex min-h-[260px] flex-col justify-between border-y border-black/12 py-7 text-left sm:min-h-[320px] sm:py-9 lg:min-h-[650px] lg:py-10"
    >
      <div className="flex items-center justify-between gap-4">
        <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#00629B]">Registration / Payment</p>
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-black/45">
          <motion.span
            className="h-1.5 w-1.5 rounded-full bg-emerald-500"
            animate={reduceMotion ? undefined : { opacity: [0.45, 1, 0.45], scale: [1, 1.2, 1] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          />
          Seat reserved
        </div>
      </div>

      <div className="py-10 lg:py-16">
        <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-black/35">Complete your registration</p>
        <div className="mt-4 overflow-hidden pb-1">
          <motion.h1
            initial={reduceMotion ? false : { y: "105%" }}
            animate={{ y: 0 }}
            transition={{ duration: reduceMotion ? 0 : MOTION_DURATION.reveal, ease: MOTION_EASE, delay: reduceMotion ? 0 : 0.08 }}
            className="max-w-3xl text-4xl font-semibold leading-[0.94] tracking-[-0.06em] sm:text-5xl lg:text-6xl"
          >
            {event?.title || "IEEE Sahrdaya event"}
          </motion.h1>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6 border-t border-black/10 pt-6 text-sm">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-black/30">Date</p>
          <p className="mt-2 font-semibold">{event?.date ? formatDate(event.date) : "—"}</p>{event?.timeTbc && <p className="mt-1 text-xs font-medium text-[#00629B]">Time to be confirmed</p>}
        </div>
        <div>
          <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-black/30">Venue</p>
          <p className="mt-2 font-semibold leading-snug">{event?.venue || "—"}</p>
        </div>
      </div>
    </motion.aside>
  );
}

export function PassiveState({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <PaymentShell>
      <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mx-auto w-full max-w-xl border-y border-black/12 py-10 text-center sm:py-14">
        <div className="mx-auto flex h-14 w-14 items-center justify-center text-black/55">{icon}</div>
        <h1 className="mt-6 text-4xl font-semibold tracking-[-0.055em]">{title}</h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-black/52">{description}</p>
      </motion.section>
    </PaymentShell>
  );
}


export interface PaymentProviderPanelProps {
  session: RegistrationPaymentSession;
  payable: string;
  payGateUpiUri: string;
  isMobileUpi: boolean;
  qrDataUrl: string;
  providerCheckDelayed: boolean;
  reconciling: boolean;
  reduceMotion: boolean;
  error: string | null;
  secondsLeft: number;
  remainingPercent: number;
  reconcilePayment: (surfaceError?: boolean) => Promise<void>;
}

export function PaymentProviderPanel({
  session, payable, payGateUpiUri, isMobileUpi, qrDataUrl,
  providerCheckDelayed, reconciling, reduceMotion, error, secondsLeft,
  remainingPercent, reconcilePayment,
}: PaymentProviderPanelProps) {
    return (
      <PaymentShell>
        <div className="grid w-full items-stretch gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(400px,500px)] lg:gap-7">
          <EventVisual session={session} reduceMotion={Boolean(reduceMotion)} />
          <motion.section
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative flex flex-col justify-center overflow-hidden border-y border-black/12 py-8 text-center sm:py-10"
          >
            <div className="absolute inset-x-0 top-0 h-px bg-[#00629B]" />
            <PaymentProgress />

            <div className="mx-auto mt-8 flex h-16 w-16 items-center justify-center rounded-2xl bg-ieee-blue/10 text-ieee-blue">
              {isMobileUpi ? <Smartphone className="h-8 w-8" /> : <QrCode className="h-8 w-8" />}
            </div>
            <p className="mt-6 text-[10px] font-black uppercase tracking-[0.2em] text-ieee-blue">
              UPI payment
            </p>
            <motion.p
              initial={reduceMotion ? false : { opacity: 0, scale: 0.96, y: 6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: reduceMotion ? 0 : MOTION_DURATION.reveal, ease: MOTION_EASE, delay: reduceMotion ? 0 : 0.08 }}
              className="mt-2 text-5xl font-black tracking-[-0.055em] text-slate-950 sm:text-6xl"
            >
              ₹{payable || "—"}
            </motion.p>
            <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-slate-500">
              Pay the exact amount shown. The unique paise amount allows your payment to be verified automatically.
            </p>

            <div className="mx-auto mt-5 flex w-fit items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-bold text-slate-600">
              <motion.span
                className={`h-2 w-2 rounded-full ${providerCheckDelayed ? "bg-amber-400" : "bg-emerald-500"}`}
                animate={reduceMotion ? undefined : { opacity: [0.45, 1, 0.45] }}
                transition={{ duration: reconciling ? 0.8 : 1.8, repeat: Infinity }}
              />
              {reconciling
                ? "Checking payment confirmation…"
                : providerCheckDelayed
                  ? "Payment check delayed — retry queued"
                  : "Payment is verified automatically"}
            </div>

            <div className="mx-auto mt-7 w-full max-w-sm">
              {qrDataUrl ? (
                <motion.div
                  initial={reduceMotion ? undefined : { opacity: 0, scale: 0.97, y: 8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  className="rounded-[1.75rem] border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <div className="relative mx-auto w-fit rounded-2xl ring-1 ring-slate-100">
                    <img
                      src={qrDataUrl}
                      alt="UPI payment QR code"
                      className="mx-auto aspect-square w-full max-w-[270px] rounded-xl"
                    />
                    <motion.div
                      aria-hidden="true"
                      className="pointer-events-none absolute -inset-1 rounded-2xl border-2 border-ieee-blue/15"
                      animate={reduceMotion ? undefined : { opacity: [0.25, 0.7, 0.25], scale: [1, 1.015, 1] }}
                      transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
                    />
                  </div>
                  <p className="mt-3 text-sm font-black text-slate-900">Scan with any UPI app</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    Do not edit the amount in your UPI app. It must remain exactly ₹{payable || "—"}.
                  </p>
                </motion.div>
              ) : (
                <div className="rounded-2xl border border-slate-200 bg-white p-6">
                  <Loader2 className="mx-auto h-6 w-6 animate-spin text-ieee-blue" />
                  <p className="mt-3 text-xs font-bold text-slate-500">Preparing your UPI QR…</p>
                </div>
              )}

              {isMobileUpi && payGateUpiUri && (
                <motion.a
                  href={payGateUpiUri}
                  whileTap={reduceMotion ? undefined : { scale: 0.985 }}
                  className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-ieee-blue px-5 py-4 text-sm font-black text-white shadow-lg shadow-sky-100"
                >
                  <Smartphone className="h-4 w-4" /> Open in UPI app
                </motion.a>
              )}

              <button
                type="button"
                onClick={() => void reconcilePayment(true)}
                disabled={reconciling}
                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-black text-slate-800 disabled:opacity-50"
              >
                {reconciling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Check payment
              </button>

              <AnimatePresence initial={false}>
                {error && (
                  <motion.p
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className="mt-4 rounded-xl bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-800"
                    role="alert"
                  >
                    {error}
                  </motion.p>
                )}
              </AnimatePresence>
            </div>

            <div className="mx-auto mt-7 w-full max-w-sm border-t border-slate-100 pt-5">
              <div className="flex items-center justify-between gap-4 text-xs">
                <span className="font-bold text-slate-500">Pay before</span>
                <span className="font-mono text-base font-black text-slate-900">{formatCountdown(secondsLeft)}</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                <motion.div
                  className="h-full rounded-full bg-ieee-blue"
                  animate={{ width: `${remainingPercent}%` }}
                  transition={{ duration: reduceMotion ? 0 : 0.35 }}
                />
              </div>
              <p className="mt-4 inline-flex items-center justify-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
                <ShieldCheck className="h-3.5 w-3.5" /> Verified securely by PayGate
              </p>
            </div>
          </motion.section>
        </div>
      </PaymentShell>
    );
}
