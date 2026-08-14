export interface RazorpayUpiCapability {
  enabled: boolean;
  intentEnabled: boolean;
}

export interface RazorpayUpiQrPayload {
  qr_url?: string;
  expires_on?: number;
  status?: string;
}

export interface RazorpayCustomError {
  error?: {
    code?: string;
    description?: string;
    reason?: string;
    source?: string;
    step?: string;
    metadata?: Record<string, unknown>;
  };
}

export interface RazorpayCustomSuccess {
  razorpay_payment_id?: string;
  razorpay_order_id?: string;
  razorpay_signature?: string;
}

export interface RazorpayPaymentHandle {
  on(event: "upi.qr", handler: (payload: RazorpayUpiQrPayload) => void): void;
}

export interface RazorpayCustomInstance {
  once(event: "ready", handler: (response: { methods?: Record<string, unknown> }) => void): void;
  on(event: "payment.success", handler: (response: RazorpayCustomSuccess) => void): void;
  on(event: "payment.error", handler: (response: RazorpayCustomError) => void): void;
  createPayment(data: Record<string, unknown>, options?: Record<string, unknown>): RazorpayPaymentHandle;
  getSupportedUpiIntentApps?: () => Promise<string[]>;
  emit?: (event: "payment.cancel") => void;
}

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayCustomInstance;
  }
}

const CUSTOM_CHECKOUT_SRC = "https://checkout.razorpay.com/v1/razorpay.js";

export function loadRazorpayCustomCheckout(): Promise<void> {
  const existing = document.querySelector<HTMLScriptElement>(
    `script[src="${CUSTOM_CHECKOUT_SRC}"]`,
  );
  if (existing && window.Razorpay) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const script = existing ?? document.createElement("script");
    const onLoad = () => {
      if (window.Razorpay) resolve();
      else reject(new Error("Razorpay UPI checkout did not initialise"));
    };
    const onError = () => reject(new Error("Razorpay UPI checkout could not load"));

    script.addEventListener("load", onLoad, { once: true });
    script.addEventListener("error", onError, { once: true });
    if (!existing) {
      script.src = CUSTOM_CHECKOUT_SRC;
      script.async = true;
      document.head.appendChild(script);
    }
  });
}

export function createRazorpayCustom(key: string): RazorpayCustomInstance {
  if (!window.Razorpay) throw new Error("Razorpay UPI checkout is unavailable");
  return new window.Razorpay({ key, redirect: false });
}

export function readUpiCapability(
  razorpay: RazorpayCustomInstance,
  timeoutMs = 6000,
): Promise<RazorpayUpiCapability> {
  return new Promise((resolve) => {
    let settled = false;
    let timer = 0;
    const finish = (value: RazorpayUpiCapability) => {
      if (settled) return;
      settled = true;
      if (timer) window.clearTimeout(timer);
      resolve(value);
    };
    timer = window.setTimeout(() => finish({ enabled: false, intentEnabled: false }), timeoutMs);
    razorpay.once("ready", (response) => {
      const methods = response.methods ?? {};
      const upiType = methods.upi_type && typeof methods.upi_type === "object"
        ? methods.upi_type as Record<string, unknown>
        : {};
      finish({
        enabled: methods.upi === true,
        intentEnabled: methods.upi === true && (
          methods.upi_intent === true || Number(upiType.intent || 0) > 0
        ),
      });
    });
  });
}

export async function listSupportedUpiApps(
  razorpay: RazorpayCustomInstance,
): Promise<string[]> {
  if (!razorpay.getSupportedUpiIntentApps) return [];
  try {
    const apps = await razorpay.getSupportedUpiIntentApps();
    return Array.isArray(apps)
      ? apps.filter((app): app is string => typeof app === "string" && app.length > 0)
      : [];
  } catch {
    return [];
  }
}
