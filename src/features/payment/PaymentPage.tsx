import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { motion, useReducedMotion } from "framer-motion";
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
  type RegistrationPaymentSession,
  type RazorpayCheckoutResponse,
  verifyRazorpayPayment,
} from "@/lib/data/payment.client";
import { formatDate } from "@/lib/dates";
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

function upiErrorMessage(response: RazorpayCustomError, mobile: boolean): string {
  const detail = response.error;
  const description = detail?.description || "UPI payment could not be started.";
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
      <main className="relative mx-auto flex min-h-dvh w-full max-w-6xl items-center px-4 py-4 sm:px-6 sm:py-10 lg:px-8">
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
      className="relative min-h-[230px] overflow-hidden rounded-[2.25rem] bg-slate-950 shadow-[0_30px_80px_-36px_rgba(15,23,42,0.55)] sm:min-h-[320px] lg:min-h-[650px]"
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
  const [now, setNow] = useState(() => Date.now());
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [upiStatus, setUpiStatus] = useState<"checking" | "enabled" | "disabled" | "error">("checking");
  const [upiApps, setUpiApps] = useState<string[]>([]);
  const [isMobileUpi, setIsMobileUpi] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [qrExpiresAt, setQrExpiresAt] = useState(0);
  const [upiCheckNonce, setUpiCheckNonce] = useState(0);
  const razorpayRef = useRef<RazorpayCustomInstance | null>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    setIsMobileUpi(/Android|iPhone|iPad|iPod/i.test(window.navigator.userAgent));
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
  const qrSecondsLeft = qrExpiresAt > 0 ? Math.max(0, Math.ceil((qrExpiresAt - now) / 1000)) : 0;
  const shownUpiApps = PREFERRED_UPI_APPS.filter((app) => upiApps.includes(app));

  useEffect(() => {
    const keyId = session?.razorpayKeyId || "";
    const orderId = session?.razorpayOrderId || "";
    if (!keyId || !orderId || session?.provider !== "razorpay" || session.registrationStatus !== "pending") {
      razorpayRef.current = null;
      return;
    }

    let disposed = false;
    setUpiStatus("checking");
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
          if (!checkout.razorpay_order_id || !checkout.razorpay_payment_id || !checkout.razorpay_signature) {
            setCheckoutLoading(false);
            setError("Razorpay returned an incomplete UPI confirmation. We are checking the payment automatically.");
            void refreshPayment();
            return;
          }
          setCheckoutLoading(true);
          void verifyRazorpayPayment(registrationId, checkout)
            .then((next) => { setSession(next); setError(null); })
            .catch((verifyError) => {
              setError(`${paymentErrorMessage(verifyError)} We are still checking Razorpay automatically.`);
              void refreshPayment();
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
        if (isMobileUpi) {
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
    refreshPayment,
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

  const startUpiIntent = useCallback((app: string) => {
    const razorpay = razorpayRef.current;
    const data = upiPaymentData();
    if (!razorpay || !data || upiStatus !== "enabled") return;
    setCheckoutLoading(true);
    setError(null);
    try {
      razorpay.createPayment(data, { app });
    } catch (intentError) {
      setCheckoutLoading(false);
      setError(paymentErrorMessage(intentError));
    }
  }, [upiPaymentData, upiStatus]);

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
          .then((QRCode) => QRCode.toDataURL(payload.qr_url!, { width: 320, margin: 2, errorCorrectionLevel: "M" }))
          .then((dataUrl) => {
            setQrDataUrl(dataUrl);
            setQrExpiresAt(Number(payload.expires_on || 0) * 1000);
            setCheckoutLoading(false);
          })
          .catch(() => {
            setCheckoutLoading(false);
            setError("The UPI QR was created but could not be displayed. Please retry.");
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

  if (session.provider === "razorpay") {
    return (
      <PaymentShell>
        <div className="grid w-full items-stretch gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(400px,500px)] lg:gap-7">
          <EventVisual session={session} />
          <motion.section
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative flex flex-col justify-center overflow-hidden rounded-[2.5rem] border border-white/70 bg-white p-8 text-center shadow-[0_30px_80px_-36px_rgba(15,23,42,0.28)] sm:p-10"
          >
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-ieee-blue via-sky-400 to-ieee-blue" />
            <PaymentProgress />
            <div className="mx-auto mt-8 flex h-16 w-16 items-center justify-center rounded-2xl bg-ieee-blue/10 text-ieee-blue">
              {isMobileUpi ? <Smartphone className="h-8 w-8" /> : <QrCode className="h-8 w-8" />}
            </div>
            <p className="mt-6 text-[10px] font-black uppercase tracking-[0.2em] text-ieee-blue">
              IEEE Sahrdaya Secure UPI
            </p>
            <p className="mt-2 text-5xl font-black tracking-[-0.055em] text-slate-950 sm:text-6xl">
              ₹{payable || "—"}
            </p>
            <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-slate-500">
              UPI only. Your seat is confirmed only after Razorpay reports the payment as captured.
            </p>

            <div className="mx-auto mt-7 w-full max-w-sm">
              {upiStatus === "checking" && (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                  <Loader2 className="mx-auto h-6 w-6 animate-spin text-ieee-blue" />
                  <p className="mt-3 text-sm font-bold text-slate-700">Checking UPI availability…</p>
                </div>
              )}

              {upiStatus === "disabled" && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-left">
                  <div className="flex gap-3">
                    <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                    <div>
                      <p className="text-sm font-black text-amber-950">UPI activation pending</p>
                      <p className="mt-1 text-xs leading-5 text-amber-800">Razorpay has not enabled UPI transactions for this merchant key yet. Cards, Pay Later and netbanking are intentionally not offered.</p>
                    </div>
                  </div>
                  <button type="button" onClick={() => setUpiCheckNonce((value) => value + 1)} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-xs font-black text-amber-900 shadow-sm ring-1 ring-amber-200">
                    <RefreshCw className="h-4 w-4" /> Check again
                  </button>
                </div>
              )}

              {upiStatus === "error" && (
                <button type="button" onClick={() => setUpiCheckNonce((value) => value + 1)} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm font-black text-slate-800">
                  <RefreshCw className="h-4 w-4" /> Retry UPI connection
                </button>
              )}

              {upiStatus === "enabled" && isMobileUpi && (
                <div className="space-y-2">
                  <p className="mb-3 text-xs font-bold text-slate-500">Choose your UPI app</p>
                  {(shownUpiApps.length ? shownUpiApps : ["any"]).map((app) => (
                    <button
                      key={app}
                      type="button"
                      onClick={() => startUpiIntent(app)}
                      disabled={checkoutLoading}
                      className="inline-flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm font-black text-slate-900 shadow-sm transition hover:border-ieee-blue/30 hover:bg-sky-50 disabled:opacity-50"
                    >
                      <span className="inline-flex items-center gap-3"><Smartphone className="h-4 w-4 text-ieee-blue" /> {UPI_APP_LABELS[app] || app}</span>
                      <span className="text-ieee-blue">Open</span>
                    </button>
                  ))}
                  {checkoutLoading && <p className="pt-2 text-xs font-semibold text-slate-500">Complete the payment in your UPI app, then return here.</p>}
                </div>
              )}

              {upiStatus === "enabled" && !isMobileUpi && !qrDataUrl && (
                <button
                  type="button"
                  onClick={showUpiQr}
                  disabled={checkoutLoading}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-ieee-blue px-5 py-4 text-sm font-black text-white shadow-lg shadow-sky-100 transition hover:-translate-y-0.5 hover:bg-[#004f7c] disabled:opacity-50"
                >
                  {checkoutLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
                  {checkoutLoading ? "Creating secure QR…" : "Show UPI QR"}
                </button>
              )}

              {upiStatus === "enabled" && !isMobileUpi && qrDataUrl && (
                <div className="rounded-[1.75rem] border border-slate-200 bg-white p-4 shadow-sm">
                  <img src={qrDataUrl} alt="UPI payment QR code" className="mx-auto aspect-square w-full max-w-[280px] rounded-xl" />
                  <p className="mt-3 text-sm font-black text-slate-900">Scan with any UPI app</p>
                  <p className="mt-1 text-xs text-slate-500">The amount and Razorpay Order are already embedded in this one-time QR.</p>
                  {qrExpiresAt > 0 && (
                    <p className={`mt-3 font-mono text-xs font-bold ${qrSecondsLeft > 0 ? "text-ieee-blue" : "text-rose-600"}`}>
                      {qrSecondsLeft > 0 ? `QR expires in ${formatCountdown(qrSecondsLeft)}` : "QR expired"}
                    </p>
                  )}
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => void refreshPayment()} className="rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-black text-slate-800">Check payment</button>
                    <button type="button" onClick={showUpiQr} disabled={checkoutLoading} className="rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-black text-slate-800 disabled:opacity-50">New QR</button>
                  </div>
                </div>
              )}

              {error && (
                <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-800" role="alert">{error}</p>
              )}
            </div>

            <div className="mx-auto mt-7 w-full max-w-sm border-t border-slate-100 pt-5">
              <div className="flex items-center justify-between gap-4 text-xs">
                <span className="font-bold text-slate-500">Seat held for</span>
                <span className="font-mono text-base font-black text-slate-900">{formatCountdown(secondsLeft)}</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                <motion.div className="h-full rounded-full bg-ieee-blue" animate={{ width: `${remainingPercent}%` }} transition={{ duration: reduceMotion ? 0 : 0.35 }} />
              </div>
              <p className="mt-4 inline-flex items-center justify-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
                <ShieldCheck className="h-3.5 w-3.5" /> Processed securely by Razorpay
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
