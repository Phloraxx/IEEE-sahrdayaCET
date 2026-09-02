import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  BadgePercent,
  Check,
  CheckCircle2,
  Clock3,
  CreditCard,
  Loader2,
  ShieldCheck,
  Ticket,
} from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/lib/auth-context";
import {
  createRegistration,
  getEventWaitlist,
  getMyEventRegistration,
  getRegistrationMemory,
  getPublicEvent,
  joinEventWaitlist,
  leaveEventWaitlist,
  previewCoupon,
  type CouponPreview,
  type EventWaitlistResponse,
  type PublicRegistrationEvent,
} from "@/lib/data/public-client";
import { downloadRegistrationReceipt } from "@/lib/data/receipt.client";
import { formatDate } from "@/lib/dates";
import { MOTION_DURATION, MOTION_EASE } from "@/lib/motion";
import {
  clearRegistrationDraft,
  loadRegistrationDraft,
  loadRegistrationProfile,
  saveRegistrationDraft,
  saveRegistrationProfile,
  type RegistrationProfileMemory,
} from "@/lib/registration-memory";
import { registrationAction, type MyEventRegistration } from "@/lib/registration-state";
import type { FormField } from "@/types";

interface PageProps {
  eventId: string;
  initialEvent?: PublicRegistrationEvent | null;
}

function requestErrorMessage(error: unknown, fallback: string) {
  if (error && typeof error === "object") {
    const response = (error as { response?: { error?: unknown; message?: unknown; data?: { error?: unknown } } }).response;
    const detail = response?.error ?? response?.data?.error ?? response?.message;
    if (typeof detail === "string" && detail.trim()) return detail;
  }
  return error instanceof Error && error.message ? error.message : fallback;
}

const fieldClass =
  "w-full border-0 border-b border-black/15 bg-transparent bg-[linear-gradient(#00629B,#00629B)] bg-[length:0_1px] bg-[position:0_100%] bg-no-repeat px-0 py-3 text-[15px] text-[#111315] outline-none transition-[border-color,background-size] duration-200 placeholder:text-black/30 focus:border-transparent focus:bg-[length:100%_1px] focus:ring-0 disabled:text-black/40";

function BookingProgress({ paid, stage = "details" }: { paid: boolean; stage?: "details" | "payment" | "ticket" }) {
  const reduceMotion = Boolean(useReducedMotion());
  const steps = paid ? ["Details", "Payment", "Ticket"] : ["Details", "Ticket"];
  const stageIndex = paid
    ? { details: 0, payment: 1, ticket: 2 }[stage]
    : stage === "ticket" ? 1 : 0;

  return (
    <div className="flex items-center gap-2" aria-label="Registration progress">
      {steps.map((step, index) => (
        <div key={step} className="contents">
          {index > 0 && (
            <div className="relative h-px w-5 overflow-hidden bg-black/15 sm:w-9">
              {index <= stageIndex && (
                <motion.div
                  initial={reduceMotion ? false : { scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: reduceMotion ? 0 : MOTION_DURATION.ui, ease: MOTION_EASE }}
                  className="absolute inset-0 origin-left bg-[#00629B]"
                />
              )}
            </div>
          )}
          <div className={`flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.16em] ${index <= stageIndex ? "text-[#00629B]" : "text-black/30"}`}>
            <span className={`grid h-5 w-5 place-items-center rounded-full border text-[9px] ${index < stageIndex ? "border-[#00629B] bg-[#00629B] text-white" : index === stageIndex ? "border-[#00629B]" : "border-black/15"}`}>
              {index < stageIndex ? <Check className="h-3 w-3" /> : index + 1}
            </span>
            <span className="hidden sm:inline">{step}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function FieldLabel({ label, complete = false }: { label: string; complete?: boolean }) {
  return (
    <span className="flex items-center gap-2 text-xs font-bold">
      {label}
      <AnimatePresence initial={false}>
        {complete && (
          <motion.span
            initial={{ opacity: 0, scale: 0.75 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.75 }}
            transition={{ duration: MOTION_DURATION.micro, ease: MOTION_EASE }}
            className="text-emerald-600"
            aria-label="Complete"
          >
            <Check className="h-3.5 w-3.5" />
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}

function DynamicField({ field, value, onChange, error }: {
  field: FormField;
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  const classes = `${fieldClass} ${error ? "border-rose-400 focus:border-rose-400 focus:ring-rose-100" : ""}`;
  const common = { id: field.id, value, required: field.required, "aria-invalid": !!error };
  if (["text", "email", "phone"].includes(field.type)) {
    const type = field.type === "phone" ? "tel" : field.type;
    return <input {...common} type={type} placeholder={field.placeholder} onChange={(e) => onChange(e.target.value)} className={classes} />;
  }
  if (field.type === "textarea") {
    return <textarea {...common} placeholder={field.placeholder} onChange={(e) => onChange(e.target.value)} className={`${classes} min-h-28 resize-y`} />;
  }
  if (field.type === "number" || field.type === "date") {
    return <input {...common} type={field.type} placeholder={field.placeholder} onChange={(e) => onChange(e.target.value)} className={classes} />;
  }
  if (field.type === "select") {
    return (
      <select {...common} onChange={(e) => onChange(e.target.value)} className={classes}>
        <option value="">Select an option</option>
        {field.options?.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    );
  }
  if (field.type === "checkbox") {
    return (
      <label className="flex cursor-pointer items-start gap-3 border-y border-black/12 py-4">
        <input id={field.id} type="checkbox" checked={value === "true"} onChange={(e) => onChange(e.target.checked ? "true" : "false")} className="mt-0.5 h-4 w-4 accent-[#00629B]" />
        <span className="text-sm leading-6 text-slate-700">{field.label}</span>
      </label>
    );
  }
  if (field.type === "radio" || field.type === "boolean") {
    const options = field.type === "boolean" ? ["Yes", "No"] : field.options || [];
    return (
      <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label={field.label}>
        {options.map((option) => {
          const normalized = field.type === "boolean" ? option.toLowerCase() : option;
          return (
            <label key={option} className={`flex cursor-pointer items-center gap-3 border px-4 py-3 text-sm font-medium transition ${value === normalized ? "border-[#111315] bg-[#111315] text-white" : "border-black/15 text-[#111315]"}`}>
              <input type="radio" name={`field-${field.id}`} value={normalized} checked={value === normalized} onChange={() => onChange(normalized)} className="accent-[#00629B]" />
              {option}
            </label>
          );
        })}
      </div>
    );
  }
  return <input {...common} type="text" placeholder={field.placeholder} onChange={(e) => onChange(e.target.value)} className={classes} />;
}

function StatusCard({ event, state, onReceipt }: {
  event: PublicRegistrationEvent;
  state: MyEventRegistration;
  onReceipt: () => void;
}) {
  const action = registrationAction(state, event.registrationOpen);
  const isPast = state.eventEnded;
  if (action === "review") {
    return (
      <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="border-y border-amber-300 py-8">
        <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-amber-700">Registration status</p>
        <Clock3 className="mt-6 h-8 w-8 text-amber-600" />
        <h2 className="mt-5 text-4xl font-semibold tracking-[-0.055em]">Payment under review</h2>
        <p className="mt-3 max-w-xl text-sm leading-6 text-black/52">An organiser needs to review this payment before a ticket can be issued. Please don&apos;t register or pay again.</p>
      </motion.section>
    );
  }
  if (action === "payment") {
    return (
      <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="border-y border-[#00629B]/35 py-8">
        <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#00629B]">Registration status</p>
        <h2 className="mt-4 text-4xl font-semibold tracking-[-0.055em]">Your details are saved.</h2>
        <p className="mt-3 max-w-xl text-sm leading-6 text-black/52">Payment is the only step left. Continue the existing registration instead of starting again.</p>
        <Link to={`/payment/${state.registrationId}`} className="group mt-7 flex max-w-md items-center justify-between border-y border-[#00629B] py-4 text-lg font-bold text-[#00629B]">Continue payment <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" /></Link>
      </motion.section>
    );
  }
  return (
    <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="border-y border-emerald-300 py-8">
      <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-emerald-700">Registration status</p>
      <div className="mt-5 flex items-center gap-2 text-sm font-bold text-emerald-700"><CheckCircle2 className="h-5 w-5" /> You&apos;re registered</div>
      <h2 className="mt-4 text-4xl font-semibold tracking-[-0.055em]">Your place is confirmed.</h2>
      <p className="mt-3 max-w-xl text-sm leading-6 text-black/52">{isPast ? "This event has ended, but your ticket and receipt remain available." : "Keep your ticket ready for check-in."}</p>
      <div className="mt-7 flex flex-wrap items-center gap-5">
        <Link to={`/ticket/${state.ticketId}`} className="group inline-flex items-center gap-3 font-bold text-[#00629B]">View ticket <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></Link>
        {state.receiptAvailable && <button type="button" onClick={onReceipt} className="text-sm font-bold text-black/45 hover:text-[#00629B]">Download receipt</button>}
      </div>
    </motion.section>
  );
}

export default function RegisterPage({ eventId, initialEvent }: PageProps) {
  const navigate = useNavigate();
  const { user, status: authStatus, signIn } = useAuth();
  const [event, setEvent] = useState<PublicRegistrationEvent | null>(initialEvent ?? null);
  const [loading, setLoading] = useState(!initialEvent);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [registrationState, setRegistrationState] = useState<MyEventRegistration | null>(null);
  const [registrationStateLoading, setRegistrationStateLoading] = useState(false);
  const [waitlistState, setWaitlistState] = useState<EventWaitlistResponse | null>(null);
  const [waitlistLoading, setWaitlistLoading] = useState(false);
  const [waitlistBusy, setWaitlistBusy] = useState(false);
  const [memoryReady, setMemoryReady] = useState(false);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [college, setCollege] = useState("");
  const [branch, setBranch] = useState("");
  const [semester, setSemester] = useState("");
  const [isIeeeMember, setIsIeeeMember] = useState(false);
  const [ieeeMembershipId, setIeeeMembershipId] = useState("");
  const [customFields, setCustomFields] = useState<Record<string, string>>({});
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [couponCode, setCouponCode] = useState("");
  const [couponPreview, setCouponPreview] = useState<CouponPreview | null>(null);
  const [couponApplying, setCouponApplying] = useState(false);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (initialEvent) return;
    let active = true;
    void getPublicEvent(eventId)
      .then((next) => { if (active) setEvent(next); })
      .catch((err) => { if (active) setError(err instanceof Error ? err.message : "Failed to load event"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [eventId, initialEvent]);

  useEffect(() => {
    if (!event) return;
    setCustomFields((current) => {
      const next = { ...current };
      for (const field of event.formFields || []) {
        if (next[field.id] === undefined) next[field.id] = field.defaultValue || (field.type === "checkbox" ? "false" : "");
      }
      return next;
    });
  }, [event]);

  useEffect(() => {
    if (!user?.id || !event) {
      setMemoryReady(false);
      return;
    }
    let active = true;
    const localProfile = loadRegistrationProfile(user.id);
    const draft = loadRegistrationDraft(user.id, event.id);

    const apply = (profile: RegistrationProfileMemory) => {
      if (!active) return;
      const source = draft || profile;
      setName(source.name || user.name || "");
      setPhone(source.phone);
      setCollege(source.college);
      setBranch(source.branch);
      setSemester(source.semester);
      setIsIeeeMember(source.isIeeeMember);
      setIeeeMembershipId(source.ieeeMembershipId);
      if (draft) setCustomFields((current) => ({ ...current, ...draft.customFields }));
      setMemoryReady(true);
    };

    void getRegistrationMemory()
      .then((memory) => apply(memory.found ? memory.profile : localProfile))
      .catch(() => apply(localProfile));

    return () => { active = false; };
  }, [event, user?.id, user?.name]);

  useEffect(() => {
    if (!memoryReady || !user?.id || !event) return;
    const timer = window.setTimeout(() => {
      const profile: RegistrationProfileMemory = { name, phone, college, branch, semester, isIeeeMember, ieeeMembershipId };
      saveRegistrationProfile(user.id, profile);
      saveRegistrationDraft(user.id, event.id, { ...profile, customFields });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [branch, college, customFields, event, ieeeMembershipId, isIeeeMember, memoryReady, name, phone, semester, user?.id]);

  useEffect(() => {
    if (authStatus !== "authenticated" || !user?.id || !event) {
      setRegistrationState(null);
      setRegistrationStateLoading(false);
      return;
    }
    let active = true;
    setRegistrationStateLoading(true);
    void getMyEventRegistration(event.id)
      .then((state) => { if (active) setRegistrationState(state); })
      .catch(() => { if (active) setRegistrationState(null); })
      .finally(() => { if (active) setRegistrationStateLoading(false); });
    return () => { active = false; };
  }, [authStatus, event, user?.id]);

  useEffect(() => {
    if (authStatus !== "authenticated" || !user?.id || !event?.waitlistEnabled || event.maxCapacity <= 0) {
      setWaitlistState(null);
      setWaitlistLoading(false);
      return;
    }
    let active = true;
    setWaitlistLoading(true);
    void getEventWaitlist(event.id)
      .then((state) => { if (active) setWaitlistState(state); })
      .catch(() => { if (active) setWaitlistState(null); })
      .finally(() => { if (active) setWaitlistLoading(false); });
    return () => { active = false; };
  }, [authStatus, event, user?.id]);

  const email = user?.email || "";
  const occupiedSeats = (event?.registeredCount || 0) + (event?.waitlistReservedCount || 0);
  const capacityFull = !!event?.maxCapacity && occupiedSeats >= event.maxCapacity;
  const hasWaitlistOffer = waitlistState?.state?.status === "offered";
  const action = useMemo(
    () => registrationAction(registrationState, !!event?.registrationOpen && (!capacityFull || hasWaitlistOffer)),
    [capacityFull, event?.registrationOpen, hasWaitlistOffer, registrationState],
  );

  const handleApplyCoupon = async () => {
    if (!event || !couponCode.trim()) {
      setCouponPreview(null);
      setCouponError(couponCode.trim() ? null : "Enter a coupon code");
      return;
    }
    setCouponApplying(true);
    setCouponError(null);
    try {
      const preview = await previewCoupon(event.id, couponCode);
      setCouponCode(preview.code);
      setCouponPreview(preview);
    } catch (error) {
      setCouponPreview(null);
      setCouponError(requestErrorMessage(error, "Coupon could not be applied"));
    } finally {
      setCouponApplying(false);
    }
  };

  const refreshWaitlist = async () => {
    if (!event?.waitlistEnabled || !user?.id) return;
    try { setWaitlistState(await getEventWaitlist(event.id)); } catch { /* keep last known state */ }
  };

  const handleJoinWaitlist = async () => {
    if (!event || !user?.id) return;
    setWaitlistBusy(true);
    try {
      await joinEventWaitlist(event.id);
      await refreshWaitlist();
      toast.success("You joined the waitlist");
    } catch (err) {
      toast.error(requestErrorMessage(err, "Could not join the waitlist"));
      await refreshWaitlist();
    } finally { setWaitlistBusy(false); }
  };

  const handleLeaveWaitlist = async () => {
    if (!event || !user?.id) return;
    setWaitlistBusy(true);
    try {
      await leaveEventWaitlist(event.id);
      await refreshWaitlist();
      toast.success("You left the waitlist");
    } catch (err) {
      toast.error(requestErrorMessage(err, "Could not leave the waitlist"));
    } finally { setWaitlistBusy(false); }
  };

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = "Full name is required";
    if (!email.trim()) next.email = "Your signed-in account needs an email address";
    if (!phone.trim()) next.phone = "Phone number is required";
    if (!college.trim()) next.college = "College or institution is required";
    for (const field of event?.formFields || []) {
      if (!field.required) continue;
      const value = customFields[field.id];
      if (!value || (field.type === "checkbox" && value !== "true")) next[field.id] = `${field.label} is required`;
    }
    if (event?.isPaid && couponCode.trim() && !couponPreview) next.coupon = "Apply or clear the coupon code before continuing";
    if (!acceptedTerms) next.terms = "Please confirm the information before continuing";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (submitEvent: React.FormEvent) => {
    submitEvent.preventDefault();
    if (!event || !user?.id || !validate()) return;
    setSubmitting(true);
    try {
      const result = await createRegistration({
        userId: user.id,
        eventId: event.id,
        couponCode: couponPreview?.code || undefined,
        formResponses: {
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim(),
          college: college.trim(),
          branch: branch.trim(),
          semester: semester.trim(),
          isIeeeMember,
          ieeeMembershipId: ieeeMembershipId.trim() || undefined,
          ...customFields,
        },
      });
      saveRegistrationProfile(user.id, { name: name.trim(), phone: phone.trim(), college: college.trim(), branch: branch.trim(), semester: semester.trim(), isIeeeMember, ieeeMembershipId: ieeeMembershipId.trim() });
      clearRegistrationDraft(user.id, event.id);
      if (result.paymentRequired) {
        toast.info("Details saved. Complete payment to confirm your registration.");
        navigate(`/payment/${result.registrationId}`, { replace: true });
      } else if (result.ticketId) {
        toast.success("Registration confirmed");
        navigate(`/ticket/${result.ticketId}`, { replace: true });
      } else {
        throw new Error("Registration was saved but no ticket was returned");
      }
    } catch (err) {
      toast.error(requestErrorMessage(err, "Something went wrong"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleReceipt = async () => {
    if (!registrationState?.registrationId) return;
    try { await downloadRegistrationReceipt(registrationState.registrationId); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Receipt could not be downloaded"); }
  };

  if (loading) {
    return <div className="grid min-h-dvh place-items-center bg-[#f4f2ed]"><Loader2 className="h-8 w-8 animate-spin text-[#00629B]" /></div>;
  }
  if (error || !event) {
    return (
      <div className="grid min-h-dvh place-items-center bg-[#f4f2ed] px-5 text-[#111315]">
        <div className="w-full max-w-lg border-y border-black/15 py-10 text-center">
          <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-rose-700">Registration unavailable</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-[-0.055em]">{error || "Event not found"}</h1>
          <p className="mt-3 text-sm text-black/50">This event is unavailable or has been removed.</p>
          <Link to="/events" className="mt-7 inline-flex items-center gap-2 font-bold text-[#00629B]">Browse events <ArrowRight className="h-4 w-4" /></Link>
        </div>
      </div>
    );
  }

  const eventHref = event.slug ? `/events/${event.slug}` : "/events";
  const seatsLeft = event.maxCapacity > 0 ? Math.max(0, event.maxCapacity - occupiedSeats) : null;
  const effectiveAmount = couponPreview?.amount ?? event.price;
  const effectivePaid = effectiveAmount > 0;

  return (
    <div className="min-h-dvh bg-[#f4f2ed] text-[#111315] selection:bg-[#00629B] selection:text-white">
      <header className="border-b border-black/12">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-5 px-5 py-5 sm:px-8 lg:px-12">
          <Link to="/" className="text-[10px] font-black uppercase tracking-[0.22em]">IEEE Sahrdaya</Link>
          <BookingProgress paid={effectivePaid} />
        </div>
      </header>

      <main className="mx-auto max-w-[1440px] px-5 pb-28 pt-8 sm:px-8 lg:px-12 lg:pb-20 lg:pt-12">
        <Link to={eventHref} className="group inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.17em] text-black/42 transition hover:text-[#00629B]">
          <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" /> Back to event
        </Link>

        <div className="mt-8 grid gap-12 border-t border-black/12 pt-8 lg:grid-cols-[minmax(280px,0.72fr)_minmax(0,1.55fr)] lg:gap-20 lg:pt-12">
          <aside className="h-fit lg:sticky lg:top-8">
            <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#00629B]">Registration</p>
            <h1 className="mt-4 max-w-lg text-4xl font-semibold leading-[0.96] tracking-[-0.06em] sm:text-5xl lg:text-6xl">{event.title}</h1>

            <div className="mt-8 grid grid-cols-2 gap-x-6 gap-y-7 border-y border-black/12 py-6 lg:grid-cols-1">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-black/35">When</p>
                <p className="mt-2 text-sm font-semibold">{formatDate(event.date)}</p>{event.timeTbc && <p className="mt-1 text-xs font-medium text-[#00629B]">Time to be confirmed</p>}
              </div>
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-black/35">Where</p>
                <p className="mt-2 text-sm font-semibold leading-snug">{event.venue}</p>
              </div>
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-black/35">Entry</p>
                <div className="mt-2 flex items-baseline gap-2">
                  <p className="text-3xl font-semibold tracking-[-0.05em]">{effectivePaid ? `₹${effectiveAmount}` : "Free"}</p>
                  {couponPreview && couponPreview.discountAmount > 0 && <span className="text-xs text-black/35 line-through">₹{event.price}</span>}
                </div>
              </div>
              {seatsLeft !== null && (
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-black/35">Availability</p>
                  <p className="mt-2 text-sm font-semibold">{seatsLeft} seats left</p>
                </div>
              )}
            </div>

            {memoryReady && user && action === "register" && (
              <p className="mt-5 text-xs leading-5 text-black/42">Your reusable attendee details are remembered after you register. This event draft stays on this device while you type.</p>
            )}
          </aside>

          <section className="min-w-0">
            {authStatus === "loading" || registrationStateLoading || (Boolean(user) && capacityFull && event.waitlistEnabled && waitlistLoading) ? (
              <div className="border-y border-black/12 py-12"><Loader2 className="h-7 w-7 animate-spin text-[#00629B]" /><p className="mt-4 text-sm text-black/45">Checking your registration…</p></div>
            ) : !user ? (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="border-y border-black/12 py-10">
                <ShieldCheck className="h-8 w-8 text-[#00629B]" />
                <p className="mt-7 text-[9px] font-bold uppercase tracking-[0.18em] text-[#00629B]">Before we continue</p>
                <h2 className="mt-3 text-4xl font-semibold tracking-[-0.055em]">Sign in once.</h2>
                <p className="mt-3 max-w-xl text-sm leading-6 text-black/52">Your account keeps the registration, payment and ticket tied to you and prevents duplicate bookings.</p>
                <button type="button" onClick={signIn} className="group mt-7 inline-flex items-center gap-3 border-y border-[#00629B] py-4 text-lg font-bold text-[#00629B]">Sign in with Google <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" /></button>
              </motion.div>
            ) : registrationState?.found ? (
              <StatusCard event={event} state={registrationState} onReceipt={() => void handleReceipt()} />
            ) : action === "closed" ? (
              capacityFull && event.waitlistEnabled ? (
                <div className="border-y border-black/12 py-10">
                  <Clock3 className={`h-8 w-8 ${waitlistState?.state?.status === "waiting" ? "text-[#00629B]" : "text-black/35"}`} />
                  <p className="mt-7 text-[9px] font-bold uppercase tracking-[0.18em] text-[#00629B]">Waitlist</p>
                  <h2 className="mt-3 text-4xl font-semibold tracking-[-0.055em]">{waitlistState?.state?.status === "waiting" ? "You’re in line." : "Event full."}</h2>
                  <p className="mt-3 max-w-xl text-sm leading-6 text-black/50">
                    {waitlistState?.state?.status === "waiting"
                      ? `Your current position is ${waitlistState.state.position || "being calculated"}. When a place opens, it is reserved for you for a limited time.`
                      : "All available seats are reserved. Join the waitlist and the system will hold a released place for you before offering it to anyone else."}
                  </p>
                  {waitlistState?.state?.status === "waiting" ? (
                    <button type="button" disabled={waitlistBusy} onClick={() => void handleLeaveWaitlist()} className="mt-7 min-h-11 border-y border-black/20 py-3 text-sm font-bold text-black/45 transition hover:text-rose-700 disabled:opacity-40">{waitlistBusy ? "Updating…" : "Leave waitlist"}</button>
                  ) : (
                    <button type="button" disabled={waitlistBusy} onClick={() => void handleJoinWaitlist()} className="group mt-7 inline-flex min-h-11 items-center gap-3 border-y border-[#00629B] py-4 text-lg font-bold text-[#00629B] disabled:opacity-40">
                      {waitlistBusy ? "Joining…" : "Join waitlist"} {!waitlistBusy && <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />}
                    </button>
                  )}
                </div>
              ) : (
                <div className="border-y border-black/12 py-10">
                  <Clock3 className="h-8 w-8 text-black/35" />
                  <h2 className="mt-5 text-4xl font-semibold tracking-[-0.055em]">{capacityFull ? "Event full." : "Registration closed."}</h2>
                  <p className="mt-3 text-sm leading-6 text-black/50">{capacityFull ? "All available seats are currently reserved." : "This event is no longer accepting new registrations."}</p>
                </div>
              )
            ) : (
              <form onSubmit={handleSubmit}>
                {hasWaitlistOffer && waitlistState?.state && (
                  <div className="mb-8 border-y border-emerald-600/30 bg-emerald-50/60 py-5 text-emerald-900">
                    <p className="text-[9px] font-bold uppercase tracking-[0.18em]">Reserved waitlist place</p>
                    <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">A seat is held for you.</h2>
                    <p className="mt-2 max-w-xl text-sm leading-6">Complete this registration before {waitlistState.state.offerExpiresAt ? new Date(waitlistState.state.offerExpiresAt).toLocaleString("en-IN") : "the offer expires"}. Other registrations cannot take this reserved place.</p>
                  </div>
                )}
                <motion.section initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: MOTION_DURATION.reveal, ease: MOTION_EASE }} className="border-t border-black/12 py-8 sm:py-10">
                  <div className="grid gap-6 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-10">
                    <div>
                      <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#00629B]">01 / Attendee</p>
                      <h2 className="mt-3 text-2xl font-semibold tracking-[-0.04em]">Your details</h2>
                    </div>
                    <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
                      <label className="sm:col-span-2"><FieldLabel label="Full name *" complete={name.trim().length >= 2 && !errors.name} /><input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" className={`${fieldClass} ${errors.name ? "border-rose-500" : ""}`} placeholder="Your full name" />{errors.name && <span className="mt-1.5 block text-xs text-rose-600">{errors.name}</span>}</label>
                      <label><FieldLabel label="Email" complete={Boolean(email)} /><input value={email} readOnly autoComplete="email" className={fieldClass} /><span className="mt-1 block text-[10px] text-black/35">From your signed-in account</span></label>
                      <label><FieldLabel label="Phone *" complete={phone.replace(/\D/g, "").length >= 10 && !errors.phone} /><input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" inputMode="tel" autoComplete="tel" className={`${fieldClass} ${errors.phone ? "border-rose-500" : ""}`} placeholder="+91 98765 43210" />{errors.phone && <span className="mt-1.5 block text-xs text-rose-600">{errors.phone}</span>}</label>
                      <label className="sm:col-span-2"><FieldLabel label="College / Institution *" complete={college.trim().length >= 2 && !errors.college} /><input value={college} onChange={(e) => setCollege(e.target.value)} autoComplete="organization" className={`${fieldClass} ${errors.college ? "border-rose-500" : ""}`} placeholder="Your college or institution" />{errors.college && <span className="mt-1.5 block text-xs text-rose-600">{errors.college}</span>}</label>
                      <label><FieldLabel label="Branch / Department" complete={Boolean(branch.trim())} /><input value={branch} onChange={(e) => setBranch(e.target.value)} className={fieldClass} placeholder="Computer Science" /></label>
                      <label><FieldLabel label="Semester" complete={Boolean(semester.trim())} /><input value={semester} onChange={(e) => setSemester(e.target.value)} className={fieldClass} placeholder="S6" /></label>
                    </div>
                  </div>

                  {event.collectIeeeMember && (
                    <div className="mt-8 grid gap-6 border-t border-black/10 pt-7 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-10">
                      <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-black/35">IEEE membership</p>
                      <div>
                        <label className="flex cursor-pointer items-center gap-3"><input type="checkbox" checked={isIeeeMember} onChange={(e) => setIsIeeeMember(e.target.checked)} className="h-4 w-4 accent-[#00629B]" /><span className="text-sm font-semibold">I am an IEEE member</span></label>
                        <AnimatePresence initial={false}>{isIeeeMember && <motion.label initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mt-5 block overflow-hidden"><span className="block text-xs font-bold">IEEE Membership ID</span><input value={ieeeMembershipId} onChange={(e) => setIeeeMembershipId(e.target.value)} className={fieldClass} placeholder="Membership ID" /></motion.label>}</AnimatePresence>
                      </div>
                    </div>
                  )}
                </motion.section>

                {event.formFields.length > 0 && (
                  <motion.section initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: MOTION_DURATION.reveal, ease: MOTION_EASE, delay: 0.06 }} className="border-t border-black/12 py-8 sm:py-10">
                    <div className="grid gap-6 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-10">
                      <div>
                        <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#00629B]">02 / Event</p>
                        <h2 className="mt-3 text-2xl font-semibold tracking-[-0.04em]">Event questions</h2>
                      </div>
                      <div className="space-y-7">
                        {event.formFields.map((field) => (
                          <div key={field.id}>
                            {field.type !== "checkbox" && <label htmlFor={field.id}><FieldLabel label={`${field.label}${field.required ? " *" : ""}`} complete={Boolean(customFields[field.id]) && !errors[field.id]} /></label>}
                            <DynamicField field={field} value={customFields[field.id] || ""} onChange={(value) => setCustomFields((current) => ({ ...current, [field.id]: value }))} error={errors[field.id]} />
                            {errors[field.id] && <p className="mt-1.5 text-xs text-rose-600">{errors[field.id]}</p>}
                          </div>
                        ))}
                      </div>
                    </div>
                  </motion.section>
                )}

                <motion.section initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: MOTION_DURATION.reveal, ease: MOTION_EASE, delay: 0.1 }} className="border-y border-black/12 py-8 sm:py-10">
                  <div className="grid gap-7 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-10">
                    <div>
                      <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#00629B]">{event.formFields.length > 0 ? "03" : "02"} / Confirm</p>
                      <h2 className="mt-3 text-2xl font-semibold tracking-[-0.04em]">Review & continue</h2>
                    </div>
                    <div>
                      {event.isPaid && (
                        <div className="mb-7 border-y border-black/12 py-5">
                          <div className="flex items-start gap-3">
                            <BadgePercent className="mt-0.5 h-5 w-5 text-[#00629B]" />
                            <div>
                              <p className="text-sm font-bold">Have a coupon?</p>
                              <p className="mt-1 text-xs leading-5 text-black/42">Apply it before continuing to see the amount you will actually pay.</p>
                            </div>
                          </div>
                          <div className="mt-4 flex max-w-lg gap-3">
                            <input
                              value={couponCode}
                              onChange={(e) => { setCouponCode(e.target.value.toUpperCase()); setCouponPreview(null); setCouponError(null); setErrors((current) => { const next = { ...current }; delete next.coupon; return next; }); }}
                              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void handleApplyCoupon(); } }}
                              autoComplete="off"
                              spellCheck={false}
                              placeholder="COUPON CODE"
                              className={`${fieldClass} min-w-0 flex-1 font-mono uppercase`}
                            />
                            <button
                              type="button"
                              onClick={() => void handleApplyCoupon()}
                              disabled={couponApplying || !couponCode.trim()}
                              className="shrink-0 border-b border-[#00629B] px-2 text-xs font-bold uppercase tracking-[0.12em] text-[#00629B] disabled:border-black/15 disabled:text-black/25"
                            >
                              {couponApplying ? "Checking…" : "Apply"}
                            </button>
                          </div>
                          {(couponError || errors.coupon) && <p className="mt-2 text-xs font-medium text-rose-600">{couponError || errors.coupon}</p>}
                          {couponPreview && (
                            <div className="mt-4 flex max-w-lg items-center justify-between gap-4 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                              <span><strong>{couponPreview.code}</strong> · {couponPreview.discountPercent}% off</span>
                              <span className="shrink-0 font-bold">₹{couponPreview.amount}</span>
                            </div>
                          )}
                        </div>
                      )}
                      <label className="flex cursor-pointer items-start gap-3"><input type="checkbox" checked={acceptedTerms} onChange={(e) => setAcceptedTerms(e.target.checked)} className="mt-1 h-4 w-4 accent-[#00629B]" /><span className="text-sm leading-6 text-black/55">I confirm that the information above is accurate and agree to the event terms.</span></label>
                      {errors.terms && <p className="mt-2 text-xs text-rose-600">{errors.terms}</p>}

                      <motion.button
                        type="submit"
                        disabled={submitting}
                        whileHover={submitting ? undefined : { x: 2 }}
                        whileTap={submitting ? undefined : { scale: 0.99 }}
                        transition={{ duration: MOTION_DURATION.micro, ease: MOTION_EASE }}
                        className="group relative mt-7 flex w-full items-center justify-between overflow-hidden border-y border-[#00629B] py-4 text-left text-lg font-bold text-[#00629B] transition disabled:border-black/15 disabled:text-black/30 sm:max-w-lg"
                      >
                        <span>{submitting ? "Reserving your seat…" : effectivePaid ? `Continue to payment · ₹${effectiveAmount}` : "Confirm free registration"}</span>
                        {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : effectivePaid ? <CreditCard className="h-5 w-5 transition-transform duration-200 group-hover:translate-x-0.5" /> : <Ticket className="h-5 w-5 transition-transform group-hover:translate-x-1" />}
                        {submitting && (
                          <motion.span
                            className="absolute inset-x-0 bottom-0 h-0.5 origin-left bg-[#00629B]"
                            initial={{ scaleX: 0 }}
                            animate={{ scaleX: 1 }}
                            transition={{ duration: 1.2, ease: MOTION_EASE }}
                          />
                        )}
                      </motion.button>
                      <p className="mt-4 max-w-lg text-xs leading-5 text-black/38">{effectivePaid ? "Your ticket is issued only after payment is captured. Coupons are revalidated when you continue." : "Your ticket is created immediately after confirmation."}</p>
                    </div>
                  </div>
                </motion.section>
              </form>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
