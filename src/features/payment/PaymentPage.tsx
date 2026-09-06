import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { motion, useReducedMotion } from "framer-motion";
import {
  CheckCircle2,
  Clock3,
  ExternalLink,
  Loader2,
  LockKeyhole,
  MessageCircle,
  TicketCheck,
  TriangleAlert,
  XCircle,
} from "lucide-react";

import {
  EventVisual,
  PassiveState,
  PaymentProgress,
  PaymentProviderPanel,
  PaymentShell,
} from "@/features/payment/payment-provider-panels";
import { useAuth } from "@/lib/auth-context";
import {
  createOrResumePayment,
  getPaymentSession,
  reconcilePaymentSession,
  type RegistrationPaymentSession,
} from "@/lib/data/payment.client";
import { getEventJoinDetails } from "@/lib/data/public-client";
import { MOTION_DURATION, MOTION_EASE } from "@/lib/motion";
import {
  LOCAL_PAYMENT_STATUS_POLL_MS,
  providerReconcileDelayMs,
  providerRetryAfterMs,
} from "@/lib/payment-reconciliation";
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

export default function PaymentPage({ registrationId }: PageProps) {
  const navigate = useNavigate();
  const { status: authStatus, signIn } = useAuth();
  const [session, setSession] = useState<RegistrationPaymentSession | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [isMobileUpi, setIsMobileUpi] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [reconciling, setReconciling] = useState(false);
  const [providerCheckDelayed, setProviderCheckDelayed] = useState(false);
  const [successWhatsappUrl, setSuccessWhatsappUrl] = useState("");
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    setIsMobileUpi(
      /Android|iPhone|iPad|iPod/i.test(window.navigator.userAgent),
    );
  }, []);

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

  const reconcilePayment = useCallback(
    async (surfaceError = false) => {
      if (!registrationId || authStatus !== "authenticated") return;
      setReconciling(true);
      try {
        const next = await reconcilePaymentSession(registrationId);
        setSession(next);
        setProviderCheckDelayed(!next.providerReachable);
        if (next.providerReachable) setError(null);
      } catch (requestError) {
        setProviderCheckDelayed(true);
        if (surfaceError) setError(paymentErrorMessage(requestError));
      } finally {
        setReconciling(false);
      }
    },
    [authStatus, registrationId],
  );

  useEffect(() => {
    if (authStatus === "loading") return;
    if (authStatus === "unauthenticated") {
      setLoading(false);
      return;
    }
    void startPayment();
  }, [authStatus, startPayment]);

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
    const timer = window.setInterval(poll, LOCAL_PAYMENT_STATUS_POLL_MS);
    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      poll();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [paymentPending, refreshPayment]);

  // Provider reconciliation is a fallback, not the primary status channel.
  // It starts slowly, backs off to once per minute, and honors provider 429 hints.
  useEffect(() => {
    if (!paymentPending || authStatus !== "authenticated") return;
    let disposed = false;
    let timer = 0;
    let attempt = 0;

    const schedule = (overrideDelay?: number) => {
      const delay = overrideDelay ?? providerReconcileDelayMs(attempt);
      timer = window.setTimeout(async () => {
        if (disposed) return;
        if (document.visibilityState !== "visible") {
          schedule(providerReconcileDelayMs(attempt));
          return;
        }
        setReconciling(true);
        try {
          const next = await reconcilePaymentSession(registrationId);
          if (disposed) return;
          setSession(next);
          setProviderCheckDelayed(!next.providerReachable);
          attempt += 1;
          schedule();
        } catch (requestError) {
          if (disposed) return;
          setProviderCheckDelayed(true);
          attempt += 1;
          schedule(
            providerRetryAfterMs(
              requestError,
              providerReconcileDelayMs(attempt),
            ),
          );
        } finally {
          if (!disposed) setReconciling(false);
        }
      }, delay);
    };

    schedule();
    return () => {
      disposed = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [authStatus, paymentPending, registrationId]);

  const confirmed =
    session?.registrationStatus === "confirmed" &&
    session?.paymentStatus === "paid";
  useEffect(() => {
    if (!confirmed || !session?.event?.id) {
      setSuccessWhatsappUrl("");
      return;
    }
    let active = true;
    void getEventJoinDetails(session.event.id)
      .then((details) => {
        if (active) setSuccessWhatsappUrl(details.whatsappGroupUrl || "");
      })
      .catch(() => {
        if (active) setSuccessWhatsappUrl("");
      });
    return () => {
      active = false;
    };
  }, [confirmed, session?.event?.id]);

  useEffect(() => {
    if (session || !error || authStatus !== "authenticated") return;
    const timer = window.setTimeout(
      () => void startPayment(),
      providerReconcileDelayMs(0),
    );
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
  const payGateUpiUri = session?.provider === "paygate" ? session.upiUri || "" : "";

  useEffect(() => {
    if (session?.provider !== "paygate" || !payGateUpiUri) return;
    let disposed = false;
    setQrDataUrl("");
    void import("qrcode")
      .then((QRCode) =>
        QRCode.toDataURL(payGateUpiUri, {
          width: 320,
          margin: 2,
          errorCorrectionLevel: "M",
        }),
      )
      .then((dataUrl) => {
        if (!disposed) setQrDataUrl(dataUrl);
      })
      .catch(() => {
        if (!disposed) setError("The UPI payment is ready but its QR could not be displayed. Open it in a UPI app or retry.");
      });
    return () => { disposed = true; };
  }, [payGateUpiUri, session?.expiresAt, session?.provider]);

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
        <section className="mx-auto w-full max-w-lg border-y border-black/12 py-10 text-center sm:py-14">
          <LockKeyhole className="mx-auto h-11 w-11 text-ieee-blue" />
          <h1 className="mt-5 text-2xl font-black">Sign in to continue</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Use the Google account that created this registration.
          </p>
          <button
            type="button"
            onClick={signIn}
            className="mt-7 w-full border-y border-[#00629B] py-4 font-bold text-[#00629B]"
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
          className="mx-auto w-full max-w-xl border-y border-emerald-300 py-10 text-center sm:py-14"
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
          <motion.h1
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduceMotion ? 0 : MOTION_DURATION.ui, ease: MOTION_EASE, delay: reduceMotion ? 0 : 0.18 }}
            className="mt-7 text-3xl font-black tracking-tight"
          >
            Payment confirmed
          </motion.h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-600">
            Your place is confirmed. Save your ticket and join the attendee group for event updates.
          </p>
          <div className="mx-auto mt-8 grid w-full max-w-md gap-3 px-4 sm:px-0">
            {successWhatsappUrl && (
              <a
                href={successWhatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="group inline-flex min-h-14 w-full items-center justify-center gap-3 rounded-xl bg-[#25D366] px-5 py-4 text-base font-black text-white shadow-lg shadow-emerald-200/70 transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#25D366] focus-visible:ring-offset-2"
              >
                <MessageCircle className="h-5 w-5" />
                Join WhatsApp group
                <ExternalLink className="h-4 w-4 opacity-80 transition-transform group-hover:translate-x-0.5" />
              </a>
            )}
            {session.ticketId && (
              <button
                type="button"
                onClick={() => navigate(`/ticket/${session.ticketId}`, { replace: true })}
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-800 transition-colors hover:border-slate-400 hover:bg-slate-50"
              >
                <TicketCheck className="h-4 w-4" />
                View ticket
              </button>
            )}
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
          <EventVisual session={session} reduceMotion={Boolean(reduceMotion)} />
          <section className="flex flex-col justify-center border-y border-black/12 py-8 text-center sm:py-10">
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

  if (session.provider === "paygate") {
    return (
      <PaymentProviderPanel
        session={session}
        payable={payable}
        payGateUpiUri={payGateUpiUri}
        isMobileUpi={isMobileUpi}
        qrDataUrl={qrDataUrl}
        providerCheckDelayed={providerCheckDelayed}
        reconciling={reconciling}
        reduceMotion={Boolean(reduceMotion)}
        error={error}
        secondsLeft={secondsLeft}
        remainingPercent={remainingPercent}
        reconcilePayment={reconcilePayment}
      />
    );
  }

  return (
    <PassiveState
      icon={<XCircle className="h-8 w-8 text-rose-500" />}
      title="Legacy payment unavailable"
      description="This registration uses a retired payment route. Please contact the event organizer before making another payment."
    />
  );
}
