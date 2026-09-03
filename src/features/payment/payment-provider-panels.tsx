import type { ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Check,
  Clock3,
  Loader2,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  TriangleAlert,
} from "lucide-react";

import type { RegistrationPaymentSession } from "@/lib/data/payment.client";
import { formatDate } from "@/lib/dates";
import { MOTION_DURATION, MOTION_EASE } from "@/lib/motion";

export function formatCountdown(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

const UPI_APP_LABELS: Record<string, string> = {
  gpay: "Google Pay",
  phonepe: "PhonePe",
  paytm: "Paytm",
  bhim: "BHIM",
  amazon: "Amazon Pay",
  cred: "CRED",
  mobikwik: "MobiKwik",
  super_money: "super.money",
  any: "Other UPI apps",
};
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
  qrExpiresAt: number;
  qrSecondsLeft: number;
  providerCheckDelayed: boolean;
  reconciling: boolean;
  reduceMotion: boolean;
  error: string | null;
  secondsLeft: number;
  remainingPercent: number;
  upiStatus: "checking" | "enabled" | "disabled" | "error";
  upiIntentEnabled: boolean;
  shownUpiApps: string[];
  checkoutLoading: boolean;
  activeUpiApp: string | null;
  startUpiIntent: (app: string) => void;
  showUpiQr: () => void;
  reconcilePayment: (surfaceError?: boolean) => Promise<void>;
  retryUpiCheck: () => void;
}

export function PaymentProviderPanel({
  session, payable, payGateUpiUri, isMobileUpi, qrDataUrl, qrExpiresAt, qrSecondsLeft,
  providerCheckDelayed, reconciling, reduceMotion, error, secondsLeft, remainingPercent,
  upiStatus, upiIntentEnabled, shownUpiApps, checkoutLoading, activeUpiApp, startUpiIntent,
  showUpiQr, reconcilePayment, retryUpiCheck,
}: PaymentProviderPanelProps) {
  if (session.provider === "paygate") {
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
              Temporary · Kotak direct UPI
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
              Pay this exact amount. The paise suffix is unique to your registration and lets IEEE verify the Kotak bank credit automatically.
            </p>

            <div className="mx-auto mt-5 flex w-fit items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-bold text-slate-600">
              <motion.span
                className={`h-2 w-2 rounded-full ${providerCheckDelayed ? "bg-amber-400" : "bg-emerald-500"}`}
                animate={reduceMotion ? undefined : { opacity: [0.45, 1, 0.45] }}
                transition={{ duration: reconciling ? 0.8 : 1.8, repeat: Infinity }}
              />
              {reconciling
                ? "Checking Kotak confirmation…"
                : providerCheckDelayed
                  ? "Bank check delayed — retry queued"
                  : "Bank credit is verified automatically"}
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
                      alt="Kotak UPI payment QR code"
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
                <ShieldCheck className="h-3.5 w-3.5" /> Verified from Kotak bank credit
              </p>
            </div>
          </motion.section>
        </div>
      </PaymentShell>
    );
  }

  if (session.provider === "razorpay") {
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
              {isMobileUpi ? (
                <Smartphone className="h-8 w-8" />
              ) : (
                <QrCode className="h-8 w-8" />
              )}
            </div>
            <p className="mt-6 text-[10px] font-black uppercase tracking-[0.2em] text-ieee-blue">
              IEEE Sahrdaya Secure UPI
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
              UPI only. Your seat is confirmed only after Razorpay reports the
              payment as captured.
            </p>

            <div className="mx-auto mt-5 flex w-fit items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-bold text-slate-600">
              <motion.span
                className={`h-2 w-2 rounded-full ${providerCheckDelayed ? "bg-amber-400" : "bg-emerald-500"}`}
                animate={
                  reduceMotion ? undefined : { opacity: [0.45, 1, 0.45] }
                }
                transition={{
                  duration: reconciling ? 0.8 : 1.8,
                  repeat: Infinity,
                }}
              />
              {reconciling
                ? "Verifying payment status…"
                : providerCheckDelayed
                  ? "Provider check delayed — retry queued"
                  : "Payment status is verified automatically"}
            </div>

            <div className="mx-auto mt-7 w-full max-w-sm">
              {upiStatus === "checking" && (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                  <Loader2 className="mx-auto h-6 w-6 animate-spin text-ieee-blue" />
                  <p className="mt-3 text-sm font-bold text-slate-700">
                    Checking UPI availability…
                  </p>
                </div>
              )}

              {upiStatus === "disabled" && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-left">
                  <div className="flex gap-3">
                    <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                    <div>
                      <p className="text-sm font-black text-amber-950">
                        UPI activation pending
                      </p>
                      <p className="mt-1 text-xs leading-5 text-amber-800">
                        Razorpay has not enabled UPI transactions for this
                        merchant key yet. Cards, Pay Later and netbanking are
                        intentionally not offered.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => retryUpiCheck()}
                    className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-xs font-black text-amber-900 shadow-sm ring-1 ring-amber-200"
                  >
                    <RefreshCw className="h-4 w-4" /> Check again
                  </button>
                </div>
              )}

              {upiStatus === "error" && (
                <button
                  type="button"
                  onClick={() => retryUpiCheck()}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm font-black text-slate-800"
                >
                  <RefreshCw className="h-4 w-4" /> Retry UPI connection
                </button>
              )}

              {upiStatus === "enabled" && isMobileUpi && !upiIntentEnabled && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-2xl border border-sky-200 bg-sky-50 p-5 text-left"
                >
                  <div className="flex gap-3">
                    <Clock3 className="mt-0.5 h-5 w-5 shrink-0 text-ieee-blue" />
                    <div>
                      <p className="text-sm font-black text-slate-950">
                        UPI Intent activation pending
                      </p>
                      <p className="mt-1 text-xs leading-5 text-slate-600">
                        Razorpay is still enabling app-to-app UPI for this
                        account. We will show Google Pay, PhonePe and other
                        supported apps here automatically once it is active.
                        Desktop UPI QR remains a separate flow.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => retryUpiCheck()}
                    className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-xs font-black text-ieee-blue shadow-sm ring-1 ring-sky-200"
                  >
                    <RefreshCw className="h-4 w-4" /> Check activation again
                  </button>
                </motion.div>
              )}

              {upiStatus === "enabled" && isMobileUpi && upiIntentEnabled && (
                <div className="space-y-2">
                  <p className="mb-3 text-xs font-bold text-slate-500">
                    Choose your UPI app
                  </p>
                  {(shownUpiApps.length ? shownUpiApps : ["any"]).map(
                    (app, index) => (
                      <motion.button
                        key={app}
                        initial={
                          reduceMotion ? undefined : { opacity: 0, y: 8 }
                        }
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: reduceMotion ? 0 : index * 0.045 }}
                        whileTap={reduceMotion ? undefined : { scale: 0.985 }}
                        type="button"
                        onClick={() => startUpiIntent(app)}
                        disabled={checkoutLoading}
                        className="inline-flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm font-black text-slate-900 shadow-sm transition hover:border-ieee-blue/30 hover:bg-sky-50 disabled:opacity-50"
                      >
                        <span className="inline-flex items-center gap-3">
                          <Smartphone className="h-4 w-4 text-ieee-blue" />{" "}
                          {checkoutLoading && activeUpiApp === app ? `Opening ${UPI_APP_LABELS[app] || app}…` : UPI_APP_LABELS[app] || app}
                        </span>
                        <span className="text-ieee-blue">{checkoutLoading && activeUpiApp === app ? <Loader2 className="h-4 w-4 animate-spin" /> : "Open"}</span>
                      </motion.button>
                    ),
                  )}
                  {checkoutLoading && (
                    <p className="pt-2 text-xs font-semibold text-slate-500">
                      Complete the payment in your UPI app, then return here.
                    </p>
                  )}
                </div>
              )}

              {upiStatus === "enabled" && !isMobileUpi && !qrDataUrl && (
                <motion.button
                  type="button"
                  onClick={showUpiQr}
                  whileHover={reduceMotion ? undefined : { y: -2 }}
                  whileTap={reduceMotion ? undefined : { scale: 0.985 }}
                  disabled={checkoutLoading}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-ieee-blue px-5 py-4 text-sm font-black text-white shadow-lg shadow-sky-100 transition hover:-translate-y-0.5 hover:bg-[#004f7c] disabled:opacity-50"
                >
                  {checkoutLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <QrCode className="h-4 w-4" />
                  )}
                  {checkoutLoading ? "Creating secure QR…" : "Show UPI QR"}
                </motion.button>
              )}

              {upiStatus === "enabled" && !isMobileUpi && qrDataUrl && (
                <motion.div
                  initial={
                    reduceMotion ? undefined : { opacity: 0, scale: 0.97, y: 8 }
                  }
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  className="rounded-[1.75rem] border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <div className="relative mx-auto w-fit rounded-2xl ring-1 ring-slate-100">
                    <img
                      src={qrDataUrl}
                      alt="UPI payment QR code"
                      className="mx-auto aspect-square w-full max-w-[280px] rounded-xl"
                    />
                    <motion.div
                      aria-hidden="true"
                      className="pointer-events-none absolute -inset-1 rounded-2xl border-2 border-ieee-blue/15"
                      animate={
                        reduceMotion
                          ? undefined
                          : { opacity: [0.25, 0.7, 0.25], scale: [1, 1.015, 1] }
                      }
                      transition={{
                        duration: 2.4,
                        repeat: Infinity,
                        ease: "easeInOut",
                      }}
                    />
                  </div>
                  <p className="mt-3 text-sm font-black text-slate-900">
                    Scan with any UPI app
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    The amount and Razorpay Order are already embedded in this
                    one-time QR.
                  </p>
                  {qrExpiresAt > 0 && (
                    <p
                      className={`mt-3 font-mono text-xs font-bold ${qrSecondsLeft > 0 ? "text-ieee-blue" : "text-rose-600"}`}
                    >
                      {qrSecondsLeft > 0
                        ? `QR expires in ${formatCountdown(qrSecondsLeft)}`
                        : "QR expired"}
                    </p>
                  )}
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => void reconcilePayment(true)}
                      disabled={reconciling}
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-black text-slate-800 disabled:opacity-50"
                    >
                      {reconciling ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3.5 w-3.5" />
                      )}{" "}
                      Check payment
                    </button>
                    <button
                      type="button"
                      onClick={showUpiQr}
                      disabled={checkoutLoading}
                      className="rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-black text-slate-800 disabled:opacity-50"
                    >
                      New QR
                    </button>
                  </div>
                </motion.div>
              )}

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
                <span className="font-bold text-slate-500">Seat held for</span>
                <span className="font-mono text-base font-black text-slate-900">
                  {formatCountdown(secondsLeft)}
                </span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                <motion.div
                  className="h-full rounded-full bg-ieee-blue"
                  animate={{ width: `${remainingPercent}%` }}
                  transition={{ duration: reduceMotion ? 0 : 0.35 }}
                />
              </div>
              <p className="mt-4 inline-flex items-center justify-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
                <ShieldCheck className="h-3.5 w-3.5" />{"Processed securely by Razorpay"}
              </p>
            </div>
          </motion.section>
        </div>
      </PaymentShell>
    );
  }

  return null;
}
