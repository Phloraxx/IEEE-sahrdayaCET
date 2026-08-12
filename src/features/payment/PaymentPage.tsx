import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { motion, useReducedMotion } from "framer-motion";
import {
  Check,
  CheckCircle2,
  Clock3,
  Download,
  Loader2,
  LockKeyhole,
  TriangleAlert,
  XCircle,
} from "lucide-react";

import { useAuth } from "@/lib/auth-context";
import {
  createOrResumePayment,
  getPaymentSession,
  type RegistrationPaymentSession,
} from "@/lib/data/payment.client";
import { formatDate } from "@/lib/dates";
import { downloadQR, generateQRDataUrl } from "@/lib/qr-utils";
import { toPersonalUpiUri } from "@/lib/upi";

interface PageProps {
  registrationId: string;
}

function paymentErrorMessage(error: unknown): string {
  if (error && typeof error === "object") {
    const response = (error as { response?: unknown }).response;
    if (response && typeof response === "object") {
      const body = response as Record<string, unknown>;
      if (typeof body.error === "string" && body.error.trim())
        return body.error;
      if (typeof body.message === "string" && body.message.trim())
        return body.message;
    }
  }
  return error instanceof Error && error.message
    ? error.message
    : "We couldn't check the payment right now.";
}

function formatCountdown(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

function PaymentProgress({ complete = false }: { complete?: boolean }) {
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
            <div
              className={`h-px w-6 sm:w-9 ${index <= active ? "bg-ieee-blue" : "bg-slate-200"}`}
            />
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

function PaymentShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-dvh overflow-hidden bg-[#F4F7FA] text-slate-950">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_10%_10%,rgba(0,98,155,0.09),transparent_28%),radial-gradient(circle_at_90%_85%,rgba(14,165,233,0.08),transparent_26%)]" />
      <main className="relative mx-auto flex min-h-dvh w-full max-w-6xl items-center px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
        {children}
      </main>
    </div>
  );
}

function EventVisual({ session }: { session: RegistrationPaymentSession }) {
  const event = session.event;
  return (
    <motion.aside
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative min-h-[260px] overflow-hidden rounded-[2.25rem] bg-slate-950 shadow-[0_30px_80px_-36px_rgba(15,23,42,0.55)] sm:min-h-[320px] lg:min-h-[650px]"
    >
      {event?.bannerUrl ? (
        <img
          src={event.bannerUrl}
          alt={event.title}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_8%,#0ea5e9_0,transparent_34%),linear-gradient(145deg,#00629B,#0f172a_68%)]" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/35 to-slate-950/5" />
      <div className="absolute inset-x-0 top-0 flex items-center justify-between p-5 sm:p-7">
        <div className="rounded-full border border-white/15 bg-black/20 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.17em] text-white/90 backdrop-blur-md">
          IEEE Sahrdaya
        </div>
        <div className="rounded-full border border-white/15 bg-black/20 px-3 py-1.5 text-xs font-bold text-white backdrop-blur-md">
          Payment
        </div>
      </div>
      <div className="absolute inset-x-0 bottom-0 p-6 sm:p-8 lg:p-10">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-sky-200">
          Complete your registration
        </p>
        <h1 className="mt-2 max-w-2xl text-3xl font-black leading-[1.04] tracking-tight text-white sm:text-4xl lg:text-5xl">
          {event?.title || "IEEE Sahrdaya event"}
        </h1>
        {event && (
          <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-sm font-semibold text-white/78">
            {event.date && <span>{formatDate(event.date)}</span>}
            {event.venue && <span>{event.venue}</span>}
          </div>
        )}
      </div>
    </motion.aside>
  );
}

function PassiveState({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <PaymentShell>
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="mx-auto w-full max-w-lg rounded-[2.5rem] border border-white/70 bg-white p-8 text-center shadow-[0_30px_80px_-36px_rgba(15,23,42,0.28)] sm:p-11"
      >
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
          {icon}
        </div>
        <h1 className="mt-6 text-2xl font-black tracking-tight sm:text-3xl">
          {title}
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-600">
          {description}
        </p>
      </motion.section>
    </PaymentShell>
  );
}

export default function PaymentPage({ registrationId }: PageProps) {
  const navigate = useNavigate();
  const { status: authStatus, signIn } = useAuth();
  const [session, setSession] = useState<RegistrationPaymentSession | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const reduceMotion = useReducedMotion();

  const startPayment = useCallback(async () => {
    if (!registrationId || authStatus !== "authenticated") return;
    setLoading(true);
    setError(null);
    try {
      setSession(await createOrResumePayment(registrationId));
    } catch (requestError) {
      setError(paymentErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, [authStatus, registrationId]);

  const refreshPayment = useCallback(async () => {
    if (!registrationId || authStatus !== "authenticated") return;
    try {
      setSession(await getPaymentSession(registrationId));
      setError(null);
    } catch (requestError) {
      setError(paymentErrorMessage(requestError));
    }
  }, [authStatus, registrationId]);

  useEffect(() => {
    if (authStatus === "loading") return;
    if (authStatus === "unauthenticated") {
      setLoading(false);
      return;
    }
    void startPayment();
  }, [authStatus, startPayment]);

  const personalUpiUri = useMemo(
    () => toPersonalUpiUri(session?.upiUri || ""),
    [session?.upiUri],
  );
  useEffect(() => {
    if (!personalUpiUri) {
      setQrDataUrl(null);
      return;
    }
    let active = true;
    void generateQRDataUrl(personalUpiUri, { width: 1024, margin: 4 }).then(
      (url) => {
        if (active) setQrDataUrl(url);
      },
    );
    return () => {
      active = false;
    };
  }, [personalUpiUri]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const paymentPending = session?.registrationStatus === "pending";
  useEffect(() => {
    if (!paymentPending) return;
    let active = true;
    const poll = () => {
      if (active && document.visibilityState === "visible")
        void refreshPayment();
    };
    const timer = window.setInterval(poll, 2000);
    const onVisibility = () => poll();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [paymentPending, refreshPayment]);

  const confirmed =
    session?.registrationStatus === "confirmed" &&
    session?.paymentStatus === "paid";
  useEffect(() => {
    if (!confirmed || !session?.ticketId) return;
    const timer = window.setTimeout(
      () => navigate(`/ticket/${session.ticketId}`, { replace: true }),
      reduceMotion ? 250 : 1500,
    );
    return () => window.clearTimeout(timer);
  }, [confirmed, navigate, reduceMotion, session?.ticketId]);

  useEffect(() => {
    if (session || !error || authStatus !== "authenticated") return;
    const timer = window.setTimeout(() => void startPayment(), 4000);
    return () => window.clearTimeout(timer);
  }, [authStatus, error, session, startPayment]);

  const expiresMs = session?.expiresAt
    ? Date.parse(session.expiresAt)
    : Number.NaN;
  const createdMs = session?.createdAt
    ? Date.parse(session.createdAt)
    : Number.NaN;
  const secondsLeft = Number.isFinite(expiresMs)
    ? Math.max(0, Math.ceil((expiresMs - now) / 1000))
    : 0;
  const locallyExpired = Number.isFinite(expiresMs) && secondsLeft <= 0;
  const totalSeconds =
    Number.isFinite(expiresMs) &&
    Number.isFinite(createdMs) &&
    expiresMs > createdMs
      ? Math.max(1, Math.ceil((expiresMs - createdMs) / 1000))
      : 300;
  const remainingPercent = Math.max(
    0,
    Math.min(100, (secondsLeft / totalSeconds) * 100),
  );
  const payable =
    session?.payableAmount ||
    (session?.payableAmountPaise
      ? (session.payableAmountPaise / 100).toFixed(2)
      : "");
  const needsReview =
    session?.manualReview ||
    (session?.registrationStatus === "cancelled" &&
      session?.paymentStatus === "paid");

  if (authStatus === "loading" || loading) {
    return (
      <PaymentShell>
        <div className="mx-auto text-center">
          <Loader2 className="mx-auto h-10 w-10 animate-spin text-ieee-blue" />
          <p className="mt-4 text-sm font-semibold text-slate-600">
            Preparing your payment…
          </p>
        </div>
      </PaymentShell>
    );
  }

  if (authStatus === "unauthenticated") {
    return (
      <PaymentShell>
        <section className="mx-auto w-full max-w-lg rounded-[2.5rem] border border-white/70 bg-white p-8 text-center shadow-[0_30px_80px_-36px_rgba(15,23,42,0.28)] sm:p-11">
          <LockKeyhole className="mx-auto h-11 w-11 text-ieee-blue" />
          <h1 className="mt-5 text-2xl font-black">Sign in to continue</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Use the Google account that created this registration.
          </p>
          <button
            type="button"
            onClick={signIn}
            className="mt-6 w-full rounded-2xl bg-ieee-blue px-5 py-3.5 font-bold text-white"
          >
            Sign in with Google
          </button>
        </section>
      </PaymentShell>
    );
  }

  if (!session) {
    return (
      <PassiveState
        icon={<TriangleAlert className="h-8 w-8" />}
        title="Payment unavailable"
        description={
          error
            ? `${error} We’ll retry automatically.`
            : "We couldn’t prepare this payment. We’ll retry automatically."
        }
      />
    );
  }

  if (confirmed) {
    return (
      <PaymentShell>
        <motion.section
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          className="mx-auto w-full max-w-xl rounded-[2.75rem] border border-emerald-100 bg-white p-9 text-center shadow-[0_32px_90px_-38px_rgba(16,185,129,0.38)] sm:p-12"
        >
          <PaymentProgress complete />
          <motion.div
            initial={{ scale: 0.45, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={
              reduceMotion
                ? { duration: 0 }
                : { type: "spring", stiffness: 190, damping: 15 }
            }
            className="relative mx-auto mt-10 flex h-24 w-24 items-center justify-center"
          >
            <motion.div
              initial={{ scale: 0.7, opacity: 0.45 }}
              animate={{ scale: 1.7, opacity: 0 }}
              transition={reduceMotion ? { duration: 0 } : { duration: 1.15 }}
              className="absolute inset-0 rounded-full bg-emerald-200"
            />
            <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-100">
              <CheckCircle2 className="h-11 w-11" />
            </div>
          </motion.div>
          <h1 className="mt-7 text-3xl font-black tracking-tight">
            Payment confirmed
          </h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-600">
            Your ticket is ready. Taking you there now.
          </p>
          <div className="mx-auto mt-7 h-1.5 max-w-xs overflow-hidden rounded-full bg-emerald-100">
            <motion.div
              initial={{ width: "0%" }}
              animate={{ width: "100%" }}
              transition={{
                duration: reduceMotion ? 0 : 1.25,
                ease: "easeOut",
              }}
              className="h-full rounded-full bg-emerald-500"
            />
          </div>
        </motion.section>
      </PaymentShell>
    );
  }

  if (session.registrationStatus === "cancelled") {
    return (
      <PassiveState
        icon={
          needsReview ? (
            <Clock3 className="h-8 w-8 text-amber-500" />
          ) : (
            <XCircle className="h-8 w-8 text-rose-500" />
          )
        }
        title={needsReview ? "Payment under review" : "Payment window ended"}
        description={
          needsReview
            ? "An organizer is reviewing this payment. Please don’t register or pay again."
            : "This payment session has ended and the reserved seat was released."
        }
      />
    );
  }

  if (locallyExpired) {
    return (
      <PaymentShell>
        <div className="grid w-full items-stretch gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(400px,500px)] lg:gap-7">
          <EventVisual session={session} />
          <section className="flex flex-col justify-center rounded-[2.5rem] border border-white/70 bg-white p-8 text-center shadow-[0_30px_80px_-36px_rgba(15,23,42,0.28)] sm:p-10">
            <PaymentProgress />
            <Clock3 className="mx-auto mt-10 h-11 w-11 text-amber-500" />
            <h2 className="mt-5 text-2xl font-black">Payment window ended</h2>
            <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-slate-600">
              Please don’t send this payment now. We’re still checking
              automatically in case a payment already made is being confirmed.
            </p>
          </section>
        </div>
      </PaymentShell>
    );
  }

  return (
    <PaymentShell>
      <div className="grid w-full items-stretch gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(410px,510px)] lg:gap-7">
        <EventVisual session={session} />

        <motion.section
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: reduceMotion ? 0 : 0.06 }}
          className="relative flex flex-col justify-center overflow-hidden rounded-[2.5rem] border border-white/70 bg-white p-6 shadow-[0_30px_80px_-36px_rgba(15,23,42,0.28)] sm:p-8 lg:p-9"
        >
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-ieee-blue via-sky-400 to-ieee-blue" />
          <PaymentProgress />

          <div className="mt-8 text-center sm:mt-10">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
              Pay exactly
            </p>
            <p className="mt-2 text-5xl font-black tracking-[-0.055em] text-slate-950 sm:text-6xl">
              ₹{payable || "—"}
            </p>
            <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-slate-500">
              Scan this QR with your preferred UPI app.
            </p>
          </div>

          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{
              delay: reduceMotion ? 0 : 0.12,
              duration: reduceMotion ? 0 : 0.35,
            }}
            className="relative mx-auto mt-7 aspect-square w-full max-w-[320px] rounded-[2rem] bg-[#F7F9FB] p-3 sm:max-w-[340px]"
          >
            <div className="relative flex h-full w-full items-center justify-center rounded-[1.55rem] bg-white p-4 shadow-[0_18px_50px_-30px_rgba(15,23,42,0.32)]">
              <span className="pointer-events-none absolute left-3 top-3 h-7 w-7 rounded-tl-xl border-l-2 border-t-2 border-ieee-blue/60" />
              <span className="pointer-events-none absolute right-3 top-3 h-7 w-7 rounded-tr-xl border-r-2 border-t-2 border-ieee-blue/60" />
              <span className="pointer-events-none absolute bottom-3 left-3 h-7 w-7 rounded-bl-xl border-b-2 border-l-2 border-ieee-blue/60" />
              <span className="pointer-events-none absolute bottom-3 right-3 h-7 w-7 rounded-br-xl border-b-2 border-r-2 border-ieee-blue/60" />
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt={`UPI QR to pay ₹${payable}`}
                  draggable={false}
                  className="h-full w-full select-none object-contain"
                />
              ) : (
                <Loader2 className="h-9 w-9 animate-spin text-slate-300" />
              )}
            </div>
          </motion.div>

          <button
            type="button"
            disabled={!qrDataUrl}
            onClick={() =>
              qrDataUrl &&
              downloadQR(qrDataUrl, `ieee-payment-${registrationId}.png`)
            }
            className="mx-auto mt-6 inline-flex w-full max-w-[340px] items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3.5 text-sm font-black text-white shadow-lg shadow-slate-200 transition hover:-translate-y-0.5 hover:bg-ieee-blue hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Download className="h-4 w-4" />
            Save QR as PNG
          </button>

          <div className="mx-auto mt-7 w-full max-w-[340px]">
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
            <div
              className="mt-4 flex items-center justify-center gap-2 text-xs font-semibold text-slate-500"
              aria-live="polite"
            >
              <span className="flex gap-1" aria-hidden="true">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ieee-blue" />
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ieee-blue [animation-delay:150ms]" />
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ieee-blue [animation-delay:300ms]" />
              </span>
              Waiting for payment confirmation
            </div>
            {(!session.providerReachable || error) && (
              <p className="mt-3 text-center text-xs leading-5 text-amber-700">
                Status checking is temporarily delayed. Keep this page open; it
                will continue automatically.
              </p>
            )}
          </div>
        </motion.section>
      </div>
    </PaymentShell>
  );
}
