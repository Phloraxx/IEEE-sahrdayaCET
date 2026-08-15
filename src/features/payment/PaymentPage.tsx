import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Check,
  CheckCircle2,
  Clock3,
  Loader2,
  LockKeyhole,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  TriangleAlert,
  XCircle,
} from "lucide-react";

import { useAuth } from "@/lib/auth-context";
import {
  createOrResumePayment,
  getPaymentSession,
  reconcilePaymentSession,
  type RegistrationPaymentSession,
  type RazorpayCheckoutResponse,
  verifyRazorpayPayment,
} from "@/lib/data/payment.client";
import { formatDate } from "@/lib/dates";
import { MOTION_DURATION, MOTION_EASE } from "@/lib/motion";
import {
  LOCAL_PAYMENT_STATUS_POLL_MS,
  providerReconcileDelayMs,
  providerRetryAfterMs,
} from "@/lib/payment-reconciliation";
import {
  createRazorpayCustom,
  listSupportedUpiApps,
  loadRazorpayCustomCheckout,
  readUpiCapability,
  type RazorpayCustomError,
  type RazorpayCustomInstance,
} from "@/lib/razorpay-upi.client";

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
const PREFERRED_UPI_APPS = ["gpay", "phonepe", "paytm", "bhim", "any"];

function normalizeIndianContact(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  return value.trim();
}

function upiErrorMessage(
  response: RazorpayCustomError,
  mobile: boolean,
): string {
  const detail = response.error;
  const description =
    detail?.description || "UPI payment could not be started.";
  if (/UPI transactions are not enabled for the merchant/i.test(description)) {
    return "UPI activation is still pending on the Razorpay merchant account. No other payment method is enabled here.";
  }
  if (detail?.reason === "intent_no_apps_error") {
    return mobile
      ? "No supported UPI app was available on this device. Try another UPI app or retry after installing one."
      : "IEEE-branded UPI QR is not enabled on this Razorpay account yet. Razorpay must enable Custom Checkout UPI QR (non-redirect flow).";
  }
  return description;
}

function PaymentProgress({ complete = false }: { complete?: boolean }) {
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

function PaymentShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-[#f4f2ed] text-[#111315] selection:bg-[#00629B] selection:text-white">
      <main className="mx-auto flex min-h-dvh w-full max-w-[1440px] items-center px-5 py-8 sm:px-8 sm:py-10 lg:px-12">
        {children}
      </main>
    </div>
  );
}

function EventVisual({
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
          <p className="mt-2 font-semibold">{event?.date ? formatDate(event.date) : "—"}</p>
        </div>
        <div>
          <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-black/30">Venue</p>
          <p className="mt-2 font-semibold leading-snug">{event?.venue || "—"}</p>
        </div>
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
      <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mx-auto w-full max-w-xl border-y border-black/12 py-10 text-center sm:py-14">
        <div className="mx-auto flex h-14 w-14 items-center justify-center text-black/55">{icon}</div>
        <h1 className="mt-6 text-4xl font-semibold tracking-[-0.055em]">{title}</h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-black/52">{description}</p>
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
  const [now, setNow] = useState(() => Date.now());
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [activeUpiApp, setActiveUpiApp] = useState<string | null>(null);
  const [upiStatus, setUpiStatus] = useState<
    "checking" | "enabled" | "disabled" | "error"
  >("checking");
  const [upiIntentEnabled, setUpiIntentEnabled] = useState(false);
  const [upiApps, setUpiApps] = useState<string[]>([]);
  const [isMobileUpi, setIsMobileUpi] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [qrExpiresAt, setQrExpiresAt] = useState(0);
  const [upiCheckNonce, setUpiCheckNonce] = useState(0);
  const [reconciling, setReconciling] = useState(false);
  const [providerCheckDelayed, setProviderCheckDelayed] = useState(false);
  const razorpayRef = useRef<RazorpayCustomInstance | null>(null);
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
      setCheckoutLoading(false);
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
    if (!confirmed || !session?.ticketId) return;
    const timer = window.setTimeout(
      () => navigate(`/ticket/${session.ticketId}`, { replace: true }),
      reduceMotion ? 250 : 1500,
    );
    return () => window.clearTimeout(timer);
  }, [confirmed, navigate, reduceMotion, session?.ticketId]);

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
  const qrSecondsLeft =
    qrExpiresAt > 0 ? Math.max(0, Math.ceil((qrExpiresAt - now) / 1000)) : 0;
  const shownUpiApps = PREFERRED_UPI_APPS.filter((app) =>
    upiApps.includes(app),
  );

  useEffect(() => {
    if (session?.provider !== "paygate" || !session.upiUri) return;
    let disposed = false;
    setQrDataUrl("");
    setQrExpiresAt(session.expiresAt ? Date.parse(session.expiresAt) : 0);
    void import("qrcode")
      .then((QRCode) =>
        QRCode.toDataURL(session.upiUri, {
          width: 320,
          margin: 2,
          errorCorrectionLevel: "M",
        }),
      )
      .then((dataUrl) => {
        if (!disposed) setQrDataUrl(dataUrl);
      })
      .catch(() => {
        if (!disposed) setError("The Kotak UPI payment is ready but its QR could not be displayed. Open it in a UPI app or retry.");
      });
    return () => { disposed = true; };
  }, [session?.expiresAt, session?.provider, session?.upiUri]);

  useEffect(() => {
    const keyId = session?.razorpayKeyId || "";
    const orderId = session?.razorpayOrderId || "";
    if (
      !keyId ||
      !orderId ||
      session?.provider !== "razorpay" ||
      session.registrationStatus !== "pending"
    ) {
      razorpayRef.current = null;
      return;
    }

    let disposed = false;
    setUpiStatus("checking");
    setUpiIntentEnabled(false);
    setUpiApps([]);
    setQrDataUrl("");
    setQrExpiresAt(0);

    void (async () => {
      try {
        await loadRazorpayCustomCheckout();
        if (disposed) return;
        const razorpay = createRazorpayCustom(keyId);
        razorpayRef.current = razorpay;
        razorpay.on("payment.success", (response) => {
          const checkout: RazorpayCheckoutResponse = {
            razorpay_order_id: String(response.razorpay_order_id || ""),
            razorpay_payment_id: String(response.razorpay_payment_id || ""),
            razorpay_signature: String(response.razorpay_signature || ""),
          };
          if (
            !checkout.razorpay_order_id ||
            !checkout.razorpay_payment_id ||
            !checkout.razorpay_signature
          ) {
            setCheckoutLoading(false);
            setError(
              "Razorpay returned an incomplete UPI confirmation. We are checking the payment automatically.",
            );
            void reconcilePayment(false);
            return;
          }
          setCheckoutLoading(true);
          void verifyRazorpayPayment(registrationId, checkout)
            .then((next) => {
              setSession(next);
              setError(null);
            })
            .catch((verifyError) => {
              setError(
                `${paymentErrorMessage(verifyError)} We are still checking Razorpay automatically.`,
              );
              void reconcilePayment(false);
            })
            .finally(() => setCheckoutLoading(false));
        });
        razorpay.on("payment.error", (response) => {
          if (disposed) return;
          setCheckoutLoading(false);
          setError(upiErrorMessage(response, isMobileUpi));
        });

        const capability = await readUpiCapability(razorpay);
        if (disposed) return;
        if (!capability.enabled) {
          setUpiStatus("disabled");
          return;
        }
        setUpiStatus("enabled");
        setUpiIntentEnabled(capability.intentEnabled);
        if (isMobileUpi && capability.intentEnabled) {
          const apps = await listSupportedUpiApps(razorpay);
          if (!disposed) setUpiApps(apps);
        }
      } catch (upiError) {
        if (disposed) return;
        razorpayRef.current = null;
        setUpiStatus("error");
        setError(paymentErrorMessage(upiError));
      }
    })();

    return () => {
      disposed = true;
      razorpayRef.current = null;
    };
  }, [
    isMobileUpi,
    reconcilePayment,
    registrationId,
    session?.provider,
    session?.razorpayKeyId,
    session?.razorpayOrderId,
    session?.registrationStatus,
    upiCheckNonce,
  ]);

  const upiPaymentData = useCallback(() => {
    if (!session) return null;
    return {
      amount: session.requestedAmountPaise,
      currency: "INR",
      email: session.attendeeEmail,
      contact: normalizeIndianContact(session.attendeePhone),
      order_id: session.razorpayOrderId,
      method: "upi",
    };
  }, [session]);

  const startUpiIntent = useCallback(
    (app: string) => {
      const razorpay = razorpayRef.current;
      const data = upiPaymentData();
      if (!razorpay || !data || upiStatus !== "enabled" || !upiIntentEnabled)
        return;
      setCheckoutLoading(true);
      setActiveUpiApp(app);
      setError(null);
      try {
        razorpay.createPayment(data, { app });
      } catch (intentError) {
        setCheckoutLoading(false);
        setError(paymentErrorMessage(intentError));
      }
    },
    [upiIntentEnabled, upiPaymentData, upiStatus],
  );

  const showUpiQr = useCallback(() => {
    const razorpay = razorpayRef.current;
    const data = upiPaymentData();
    if (!razorpay || !data || upiStatus !== "enabled") return;
    setCheckoutLoading(true);
    setError(null);
    setQrDataUrl("");
    setQrExpiresAt(0);
    try {
      const payment = razorpay.createPayment(data, { app: "any", flow: "qr" });
      payment.on("upi.qr", (payload) => {
        if (!payload.qr_url || payload.status !== "created") {
          setCheckoutLoading(false);
          setError("Razorpay could not create a UPI QR. Please retry.");
          return;
        }
        void import("qrcode")
          .then((QRCode) =>
            QRCode.toDataURL(payload.qr_url!, {
              width: 320,
              margin: 2,
              errorCorrectionLevel: "M",
            }),
          )
          .then((dataUrl) => {
            setQrDataUrl(dataUrl);
            setQrExpiresAt(Number(payload.expires_on || 0) * 1000);
            setCheckoutLoading(false);
          })
          .catch(() => {
            setCheckoutLoading(false);
            setError(
              "The UPI QR was created but could not be displayed. Please retry.",
            );
          });
      });
    } catch (qrError) {
      setCheckoutLoading(false);
      setError(paymentErrorMessage(qrError));
    }
  }, [upiPaymentData, upiStatus]);

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

              {isMobileUpi && session.upiUri && (
                <motion.a
                  href={session.upiUri}
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
                    onClick={() => setUpiCheckNonce((value) => value + 1)}
                    className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-xs font-black text-amber-900 shadow-sm ring-1 ring-amber-200"
                  >
                    <RefreshCw className="h-4 w-4" /> Check again
                  </button>
                </div>
              )}

              {upiStatus === "error" && (
                <button
                  type="button"
                  onClick={() => setUpiCheckNonce((value) => value + 1)}
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
                    onClick={() => setUpiCheckNonce((value) => value + 1)}
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

  return (
    <PassiveState
      icon={<XCircle className="h-8 w-8 text-rose-500" />}
      title="Legacy payment unavailable"
      description="This registration uses a retired payment route. Please contact the event organizer before making another payment."
    />
  );
}
