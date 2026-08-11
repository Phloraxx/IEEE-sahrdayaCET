import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Clock3,
  Copy,
  Download,
  ExternalLink,
  Loader2,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
  XCircle,
} from "lucide-react";

import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useAuth } from "@/lib/auth-context";
import { downloadQR, generateQRDataUrl } from "@/lib/qr-utils";
import {
  createOrResumePayment,
  getPaymentSession,
  type RegistrationPaymentSession,
} from "@/lib/data/payment.client";

interface PageProps {
  registrationId: string;
}

function formatPaise(value: number): string {
  if (!Number.isFinite(value)) return "₹0.00";
  return `₹${(value / 100).toFixed(2)}`;
}

function formatCountdown(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safe / 60);
  const remainder = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
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
    : "Unable to load the payment right now.";
}

function upiIdFromUri(uri: string): string {
  if (!uri) return "";
  try {
    return new URL(uri).searchParams.get("pa") || "";
  } catch {
    return "";
  }
}

export default function PaymentPage({ registrationId }: PageProps) {
  const { status: authStatus, signIn } = useAuth();
  const [session, setSession] = useState<RegistrationPaymentSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState<"amount" | "upi" | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const startPayment = useCallback(async () => {
    if (!registrationId || authStatus !== "authenticated") return;
    setLoading(true);
    setError(null);
    try {
      const next = await createOrResumePayment(registrationId);
      setSession(next);
    } catch (requestError) {
      setError(paymentErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, [authStatus, registrationId]);

  const refreshPayment = useCallback(async () => {
    if (!registrationId || authStatus !== "authenticated") return;
    setRefreshing(true);
    try {
      const next = await getPaymentSession(registrationId);
      setSession(next);
      setError(null);
    } catch (requestError) {
      setError(paymentErrorMessage(requestError));
    } finally {
      setRefreshing(false);
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

  useEffect(() => {
    if (!session?.upiUri) {
      setQrDataUrl(null);
      return;
    }
    let active = true;
    void generateQRDataUrl(session.upiUri, { width: 720, margin: 2 }).then((dataUrl) => {
      if (active) setQrDataUrl(dataUrl);
    });
    return () => {
      active = false;
    };
  }, [session?.upiUri]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!session || session.registrationStatus !== "pending") return;
    if (!["pending", "expired", "not_initialized"].includes(session.providerStatus)) return;

    let active = true;
    const poll = async () => {
      if (document.visibilityState !== "visible" || !active) return;
      try {
        const next = await getPaymentSession(registrationId);
        if (active) {
          setSession(next);
          setError(null);
        }
      } catch (requestError) {
        if (active) setError(paymentErrorMessage(requestError));
      }
    };
    const interval = window.setInterval(() => void poll(), 2000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") void poll();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      active = false;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [registrationId, session]);

  const expiresAtMs = session?.expiresAt ? Date.parse(session.expiresAt) : Number.NaN;
  const secondsLeft = Number.isFinite(expiresAtMs)
    ? Math.max(0, Math.ceil((expiresAtMs - now) / 1000))
    : 0;
  const locallyExpired = Number.isFinite(expiresAtMs) && secondsLeft <= 0;
  const upiId = useMemo(() => upiIdFromUri(session?.upiUri || ""), [session?.upiUri]);
  const requestedPaise = session?.requestedAmountPaise || (session?.amount || 0) * 100;
  const payablePaise = session?.payableAmountPaise || 0;
  const adjustmentPaise = Math.max(0, payablePaise - requestedPaise);
  const exactAmount = session?.payableAmount || (payablePaise ? (payablePaise / 100).toFixed(2) : "");

  const copyText = async (value: string, kind: "amount" | "upi") => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 1500);
    } catch {
      // The value remains visible for manual copy.
    }
  };

  if (authStatus === "loading" || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-11 h-11 animate-spin text-ieee-blue mx-auto" />
          <p className="mt-4 text-sm font-medium text-gray-600">Preparing your secure payment…</p>
        </div>
      </div>
    );
  }

  if (authStatus === "unauthenticated") {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <main className="max-w-lg mx-auto px-4 py-20">
          <div className="rounded-3xl border border-gray-200 bg-white p-8 text-center shadow-sm">
            <ShieldCheck className="w-12 h-12 text-ieee-blue mx-auto" />
            <h1 className="mt-4 text-2xl font-bold text-gray-950">Sign in to continue</h1>
            <p className="mt-2 text-sm leading-6 text-gray-600">
              Payment details are private to the attendee who created this registration.
            </p>
            <button
              type="button"
              onClick={signIn}
              className="mt-6 w-full rounded-xl bg-ieee-blue px-5 py-3 font-semibold text-white transition hover:bg-blue-700"
            >
              Sign in with Google
            </button>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <main className="max-w-lg mx-auto px-4 py-16">
          <div className="rounded-3xl border border-red-200 bg-white p-8 text-center shadow-sm">
            <TriangleAlert className="w-12 h-12 text-red-500 mx-auto" />
            <h1 className="mt-4 text-2xl font-bold text-gray-950">Payment unavailable</h1>
            <p className="mt-2 text-sm leading-6 text-gray-600">{error || "We could not create this payment."}</p>
            <button
              type="button"
              onClick={() => void startPayment()}
              className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-ieee-blue px-5 py-3 font-semibold text-white"
            >
              <RefreshCw className="w-4 h-4" />
              Try again
            </button>
            <div className="mt-4">
              <Link to="/events" className="text-sm font-medium text-gray-500 hover:text-gray-900">Back to events</Link>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (session.registrationStatus === "confirmed" && session.paymentStatus === "paid") {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <main className="max-w-lg mx-auto px-4 py-16">
          <div className="rounded-3xl border border-emerald-200 bg-white p-8 text-center shadow-sm">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50">
              <CheckCircle2 className="w-9 h-9 text-emerald-600" />
            </div>
            <h1 className="mt-5 text-2xl font-bold text-gray-950">Payment confirmed</h1>
            <p className="mt-2 text-sm leading-6 text-gray-600">
              Your registration is confirmed and the event ticket is ready.
            </p>
            {session.ticketId ? (
              <Link
                to={`/ticket/${session.ticketId}`}
                className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-ieee-blue px-5 py-3 font-semibold text-white transition hover:bg-blue-700"
              >
                View ticket
                <ExternalLink className="w-4 h-4" />
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => void refreshPayment()}
                className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-ieee-blue px-5 py-3 font-semibold text-white"
              >
                <RefreshCw className="w-4 h-4" />
                Refresh ticket
              </button>
            )}
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (session.registrationStatus === "cancelled") {
    const needsReview = session.manualReview || session.providerStatus === "late";
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <main className="max-w-lg mx-auto px-4 py-16">
          <div className={`rounded-3xl border bg-white p-8 text-center shadow-sm ${needsReview ? "border-amber-200" : "border-red-200"}`}>
            {needsReview ? (
              <TriangleAlert className="w-12 h-12 text-amber-500 mx-auto" />
            ) : (
              <XCircle className="w-12 h-12 text-red-500 mx-auto" />
            )}
            <h1 className="mt-4 text-2xl font-bold text-gray-950">
              {needsReview ? "Payment needs review" : "Payment session ended"}
            </h1>
            <p className="mt-2 text-sm leading-6 text-gray-600">
              {needsReview
                ? "A payment was detected outside the accepted registration window. It was not auto-confirmed so an organizer can review it safely."
                : "This seat reservation was released because the payment could not be completed in time."}
            </p>
            <Link
              to="/events"
              className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-gray-950 px-5 py-3 font-semibold text-white"
            >
              Back to events
            </Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-linear-to-br from-gray-50 to-blue-50/40">
      <Navbar />
      <main className="max-w-xl mx-auto px-4 py-8 sm:py-12">
        <Link to="/events" className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-900">
          <ArrowLeft className="w-4 h-4" />
          Back to events
        </Link>

        <section className="mt-5 overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-xl shadow-gray-200/50">
          <div className="border-b border-gray-100 bg-gray-950 px-6 py-5 text-white">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/55">IEEE Sahrdaya payment</p>
                <h1 className="mt-2 text-2xl font-bold">Pay exactly</h1>
              </div>
              <div className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold">
                {locallyExpired ? "Window ended" : "Awaiting payment"}
              </div>
            </div>
          </div>

          <div className="p-6 sm:p-8">
            {!session.providerReachable && (
              <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
                PayGate status sync is temporarily unavailable. Your existing QR is preserved; do not create a second payment.
              </div>
            )}

            {error && (
              <div className="mb-5 flex items-start justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <span>{error}</span>
                <button type="button" onClick={() => void refreshPayment()} className="shrink-0 font-semibold underline">Retry</button>
              </div>
            )}

            {locallyExpired ? (
              <div className="rounded-2xl border border-orange-200 bg-orange-50 p-5 text-center">
                <Clock3 className="w-9 h-9 text-orange-600 mx-auto" />
                <h2 className="mt-3 font-bold text-orange-950">Do not send this payment now</h2>
                <p className="mt-2 text-sm leading-6 text-orange-800">
                  The QR payment window has ended. We will keep checking briefly in case the bank reports an on-time payment with delayed confirmation.
                </p>
              </div>
            ) : (
              <>
                <div className="text-center">
                  <p className="text-5xl font-black tracking-tight text-gray-950">
                    {exactAmount ? `₹${exactAmount}` : formatPaise(payablePaise)}
                  </p>
                  <button
                    type="button"
                    onClick={() => void copyText(exactAmount || (payablePaise / 100).toFixed(2), "amount")}
                    className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-ieee-blue"
                  >
                    {copied === "amount" ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    {copied === "amount" ? "Copied" : "Copy exact amount"}
                  </button>
                </div>

                {qrDataUrl ? (
                  <div className="mx-auto mt-7 w-full max-w-[290px] rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
                    <img src={qrDataUrl} alt={`UPI QR to pay ${exactAmount ? `₹${exactAmount}` : formatPaise(payablePaise)}`} className="aspect-square w-full" />
                  </div>
                ) : (
                  <div className="mx-auto mt-7 flex aspect-square w-full max-w-[290px] items-center justify-center rounded-3xl border border-dashed border-gray-300 bg-gray-50">
                    <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
                  </div>
                )}

                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  {session.upiUri && (
                    <a
                      href={session.upiUri}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-ieee-blue px-4 py-3 font-semibold text-white transition hover:bg-blue-700"
                    >
                      Open UPI app
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  )}
                  <button
                    type="button"
                    disabled={!qrDataUrl}
                    onClick={() => {
                      if (qrDataUrl) downloadQR(qrDataUrl, `ieee-payment-${session.paymentId || registrationId}.svg`);
                    }}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 font-semibold text-gray-800 transition hover:bg-gray-50 disabled:opacity-50"
                  >
                    <Download className="w-4 h-4" />
                    Save QR
                  </button>
                </div>

                {upiId && (
                  <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-gray-50 px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-gray-400">UPI ID</p>
                      <p className="mt-1 truncate font-mono text-sm font-semibold text-gray-800">{upiId}</p>
                    </div>
                    <button type="button" onClick={() => void copyText(upiId, "upi")} className="rounded-lg p-2 text-gray-500 hover:bg-white" aria-label="Copy UPI ID">
                      {copied === "upi" ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                )}

                <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-blue-900">
                  <strong>Do not change the amount.</strong> The extra {formatPaise(adjustmentPaise)} is the verification fingerprint PayGate uses to match the bank credit to this registration.
                </div>
              </>
            )}

            <div className="mt-6 grid grid-cols-2 gap-3 border-t border-dashed border-gray-200 pt-6">
              <div className="rounded-2xl bg-gray-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Registration fee</p>
                <p className="mt-1 font-bold text-gray-900">{formatPaise(requestedPaise)}</p>
              </div>
              <div className="rounded-2xl bg-gray-50 p-4 text-right">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Time remaining</p>
                <p className="mt-1 font-mono text-lg font-bold text-gray-900">{formatCountdown(secondsLeft)}</p>
              </div>
            </div>

            <div className="mt-5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                Bank confirmation is required
              </div>
              <button
                type="button"
                onClick={() => void refreshPayment()}
                disabled={refreshing}
                className="inline-flex items-center gap-2 text-sm font-semibold text-gray-600 hover:text-gray-950 disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
                Check status
              </button>
            </div>

            {session.paymentId && (
              <p className="mt-4 break-all text-center font-mono text-[10px] text-gray-400">Payment ID: {session.paymentId}</p>
            )}
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
