import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Clock3,
  Download,
  ExternalLink,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Ticket,
  TriangleAlert,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import { useAuth } from "@/lib/auth-context";
import {
  createOrResumePayment,
  getPaymentSession,
  type RegistrationPaymentSession,
} from "@/lib/data/payment.client";
import { downloadRegistrationReceipt } from "@/lib/data/receipt.client";
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
      if (typeof body.error === "string" && body.error.trim()) return body.error;
      if (typeof body.message === "string" && body.message.trim()) return body.message;
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
    <div className="flex items-center justify-center gap-2" aria-label="Registration progress">
      {steps.map((step, index) => (
        <div key={step} className="contents">
          {index > 0 && <div className={`h-px w-6 sm:w-10 ${index <= active ? "bg-ieee-blue" : "bg-slate-200"}`} />}
          <div className={`flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-[0.13em] ${index <= active ? "text-ieee-blue" : "text-slate-400"}`}>
            <span className={`flex h-5 w-5 items-center justify-center rounded-full border ${index < active ? "border-ieee-blue bg-ieee-blue text-white" : index === active ? "border-ieee-blue bg-ieee-blue/5" : "border-slate-200"}`}>
              {index < active ? <Check className="h-3 w-3" /> : index + 1}
            </span>
            <span className="hidden sm:inline">{step}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function EventHeader({ session }: { session: RegistrationPaymentSession }) {
  const event = session.event;
  return (
    <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-slate-950 shadow-xl shadow-slate-300/30">
      <div className="relative min-h-52 sm:min-h-64">
        {event?.bannerUrl ? (
          <img src={event.bannerUrl} alt={event.title} className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,#0ea5e9_0,transparent_40%),linear-gradient(135deg,#00629B,#0f172a_70%)]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/35 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-6 sm:p-8">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-sky-200">Complete your registration</p>
          <h1 className="mt-2 text-2xl font-black leading-tight text-white sm:text-3xl">{event?.title || "IEEE Sahrdaya event"}</h1>
          {event && (
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs font-medium text-white/75">
              {event.date && <span>{formatDate(event.date)}</span>}
              {event.venue && <span>· {event.venue}</span>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function PaymentPage({ registrationId }: PageProps) {
  const { status: authStatus, signIn } = useAuth();
  const [session, setSession] = useState<RegistrationPaymentSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
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

  const refreshPayment = useCallback(async (showSpinner = true) => {
    if (!registrationId || authStatus !== "authenticated") return;
    if (showSpinner) setRefreshing(true);
    try {
      setSession(await getPaymentSession(registrationId));
      setError(null);
    } catch (requestError) {
      setError(paymentErrorMessage(requestError));
    } finally {
      if (showSpinner) setRefreshing(false);
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

  const personalUpiUri = useMemo(() => toPersonalUpiUri(session?.upiUri || ""), [session?.upiUri]);
  useEffect(() => {
    if (!personalUpiUri) {
      setQrDataUrl(null);
      return;
    }
    let active = true;
    void generateQRDataUrl(personalUpiUri, { width: 720, margin: 2 }).then((url) => { if (active) setQrDataUrl(url); });
    return () => { active = false; };
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
      if (active && document.visibilityState === "visible") void refreshPayment(false);
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

  const expiresMs = session?.expiresAt ? Date.parse(session.expiresAt) : Number.NaN;
  const createdMs = session?.createdAt ? Date.parse(session.createdAt) : Number.NaN;
  const secondsLeft = Number.isFinite(expiresMs) ? Math.max(0, Math.ceil((expiresMs - now) / 1000)) : 0;
  const locallyExpired = Number.isFinite(expiresMs) && secondsLeft <= 0;
  const totalSeconds = Number.isFinite(expiresMs) && Number.isFinite(createdMs) && expiresMs > createdMs
    ? Math.max(1, Math.ceil((expiresMs - createdMs) / 1000))
    : 300;
  const remainingPercent = Math.max(0, Math.min(100, (secondsLeft / totalSeconds) * 100));
  const payable = session?.payableAmount || (session?.payableAmountPaise ? (session.payableAmountPaise / 100).toFixed(2) : "");

  const handleReceipt = async () => {
    try { await downloadRegistrationReceipt(registrationId); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Receipt could not be downloaded"); }
  };

  if (authStatus === "loading" || loading) {
    return (
      <div className="min-h-screen bg-[#F5F7FA] flex items-center justify-center px-4">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center">
          <Loader2 className="mx-auto h-11 w-11 animate-spin text-ieee-blue" />
          <p className="mt-4 text-sm font-semibold text-slate-600">Preparing your payment…</p>
        </motion.div>
      </div>
    );
  }

  if (authStatus === "unauthenticated") {
    return (
      <div className="min-h-screen bg-[#F5F7FA]">
        <Navbar />
        <main className="mx-auto max-w-lg px-4 pb-20 pt-32">
          <div className="rounded-[2rem] border border-slate-200 bg-white p-9 text-center shadow-sm">
            <ShieldCheck className="mx-auto h-12 w-12 text-ieee-blue" />
            <h1 className="mt-5 text-2xl font-black">Sign in to continue</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">This payment belongs to the account that created the registration.</p>
            <button type="button" onClick={signIn} className="mt-6 w-full rounded-2xl bg-ieee-blue px-5 py-3.5 font-bold text-white">Sign in with Google</button>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-[#F5F7FA]">
        <Navbar />
        <main className="mx-auto max-w-lg px-4 pb-20 pt-32">
          <div className="rounded-[2rem] border border-rose-200 bg-white p-9 text-center shadow-sm">
            <TriangleAlert className="mx-auto h-12 w-12 text-rose-500" />
            <h1 className="mt-5 text-2xl font-black">Payment unavailable</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">{error || "We couldn't prepare this payment."}</p>
            <button type="button" onClick={() => void startPayment()} className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-ieee-blue px-5 py-3.5 font-bold text-white"><RefreshCw className="h-4 w-4" />Try again</button>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const confirmed = session.registrationStatus === "confirmed" && session.paymentStatus === "paid";
  const needsReview = session.manualReview || (session.registrationStatus === "cancelled" && session.paymentStatus === "paid");

  if (confirmed) {
    return (
      <div className="min-h-screen bg-[#F5F7FA]">
        <Navbar />
        <main className="mx-auto max-w-3xl px-4 pb-24 pt-24 sm:px-6">
          <PaymentProgress complete />
          <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} className="mt-6 overflow-hidden rounded-[2.25rem] border border-emerald-200 bg-white shadow-xl shadow-emerald-100/50">
            {session.event?.bannerUrl && <img src={session.event.bannerUrl} alt={session.event.title} className="h-52 w-full object-cover sm:h-64" />}
            <div className="p-8 text-center sm:p-11">
              <motion.div
                initial={{ scale: 0.35, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 180, damping: 14 }}
                className="relative mx-auto flex h-24 w-24 items-center justify-center"
              >
                <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1.55, opacity: 0 }} transition={reduceMotion ? { duration: 0 } : { duration: 1.2, repeat: 1 }} className="absolute inset-0 rounded-full bg-emerald-200" />
                <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-200"><CheckCircle2 className="h-11 w-11" /></div>
              </motion.div>
              <motion.h1 initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: reduceMotion ? 0 : 0.18 }} className="mt-6 text-3xl font-black tracking-tight text-slate-950">Payment confirmed</motion.h1>
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: reduceMotion ? 0 : 0.3 }} className="mx-auto mt-3 max-w-lg text-sm leading-6 text-slate-600">
                You&apos;re registered for <strong className="text-slate-900">{session.event?.title || "the event"}</strong>. Your ticket is ready, and your payment receipt is available below.
              </motion.p>
              <div className="mx-auto mt-7 grid max-w-md gap-3 sm:grid-cols-2">
                {session.ticketId && <Link to={`/ticket/${session.ticketId}`} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-ieee-blue px-5 py-3.5 font-bold text-white">View ticket <Ticket className="h-4 w-4" /></Link>}
                <button type="button" onClick={() => void handleReceipt()} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3.5 font-bold text-slate-800 hover:bg-slate-50"><Download className="h-4 w-4" />Receipt</button>
              </div>
            </div>
          </motion.div>
        </main>
        <Footer />
      </div>
    );
  }

  if (session.registrationStatus === "cancelled") {
    return (
      <div className="min-h-screen bg-[#F5F7FA]">
        <Navbar />
        <main className="mx-auto max-w-2xl px-4 pb-24 pt-24 sm:px-6">
          <PaymentProgress />
          <div className={`mt-6 rounded-[2rem] border bg-white p-9 text-center shadow-sm ${needsReview ? "border-amber-200" : "border-rose-200"}`}>
            {needsReview ? <Clock3 className="mx-auto h-12 w-12 text-amber-500" /> : <XCircle className="mx-auto h-12 w-12 text-rose-500" />}
            <h1 className="mt-5 text-2xl font-black">{needsReview ? "Payment under review" : "Payment window ended"}</h1>
            <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-600">
              {needsReview ? "An organizer needs to review this payment before a ticket can be issued. Please don't register or pay again." : "This seat reservation was released because payment wasn't completed in time."}
            </p>
            <Link to="/events" className="mt-6 inline-flex rounded-2xl bg-slate-950 px-5 py-3.5 font-bold text-white">Back to events</Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F7FA] text-slate-900">
      <Navbar />
      <main className="mx-auto max-w-4xl px-4 pb-24 pt-24 sm:px-6">
        <Link to="/events" className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-900"><ArrowLeft className="h-4 w-4" />Back to events</Link>
        <EventHeader session={session} />
        <div className="mt-6"><PaymentProgress /></div>

        <section className="mx-auto mt-6 max-w-xl overflow-hidden rounded-[2.25rem] border border-slate-200 bg-white shadow-xl shadow-slate-200/60">
          <div className="p-6 sm:p-9">
            {!session.providerReachable && (
              <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
                We&apos;re having trouble checking payment status right now. Keep this page open and don&apos;t pay twice.
              </div>
            )}
            {error && (
              <div className="mb-5 flex items-start justify-between gap-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <span>{error}</span><button type="button" onClick={() => void refreshPayment()} className="font-bold underline">Retry</button>
              </div>
            )}

            {locallyExpired ? (
              <div className="py-5 text-center">
                <Clock3 className="mx-auto h-12 w-12 text-amber-500" />
                <h2 className="mt-4 text-2xl font-black">Payment window ended</h2>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">Please don&apos;t send this payment now. We&apos;ll keep checking briefly in case a payment you already made is still being confirmed.</p>
                <button type="button" onClick={() => void refreshPayment()} disabled={refreshing} className="mt-6 inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-5 py-3 font-bold text-slate-700"><RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />Check status</button>
              </div>
            ) : (
              <>
                <div className="text-center">
                  <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-slate-400">Pay exactly</p>
                  <p className="mt-2 text-5xl font-black tracking-tight text-slate-950">₹{payable || "—"}</p>
                  <p className="mt-2 text-sm text-slate-500">Scan the QR or open your UPI app below.</p>
                </div>

                <div className="mx-auto mt-7 flex aspect-square w-full max-w-[310px] items-center justify-center rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
                  {qrDataUrl ? <img src={qrDataUrl} alt={`UPI QR to pay ₹${payable}`} className="h-full w-full" /> : <Loader2 className="h-9 w-9 animate-spin text-slate-300" />}
                </div>

                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  {personalUpiUri && (
                    <a href={personalUpiUri} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-ieee-blue px-5 py-3.5 font-bold text-white transition hover:-translate-y-0.5 hover:shadow-lg">
                      Open UPI app <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                  <button type="button" disabled={!qrDataUrl} onClick={() => qrDataUrl && downloadQR(qrDataUrl, `ieee-payment-${registrationId}.svg`)} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3.5 font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-50"><Download className="h-4 w-4" />Save QR</button>
                </div>

                <div className="mt-7 rounded-2xl bg-slate-50 p-5">
                  <div className="flex items-center justify-between gap-4"><div><p className="text-xs font-extrabold uppercase tracking-[0.14em] text-slate-400">Seat held for</p><p className="mt-1 font-mono text-xl font-black text-slate-900">{formatCountdown(secondsLeft)}</p></div><div className="flex items-center gap-2 text-sm font-semibold text-ieee-blue"><span className="flex gap-1"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ieee-blue" /><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ieee-blue [animation-delay:150ms]" /><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ieee-blue [animation-delay:300ms]" /></span>Waiting for payment</div></div>
                  <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-200"><motion.div className="h-full rounded-full bg-ieee-blue" animate={{ width: `${remainingPercent}%` }} transition={{ duration: 0.35 }} /></div>
                  <p className="mt-3 text-xs leading-5 text-slate-500">We&apos;ll update this page automatically as soon as your payment is confirmed.</p>
                </div>

                <div className="mt-5 flex items-center justify-between gap-4 border-t border-dashed border-slate-200 pt-5">
                  <div className="flex items-center gap-2 text-xs text-slate-500"><ShieldCheck className="h-4 w-4 text-emerald-600" />Status updates automatically</div>
                  <button type="button" onClick={() => void refreshPayment()} disabled={refreshing} className="inline-flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-slate-950"><RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />Check status</button>
                </div>
              </>
            )}
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
