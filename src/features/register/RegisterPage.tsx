import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  CreditCard,
  Loader2,
  MapPin,
  ShieldCheck,
  Ticket,
} from "lucide-react";
import { toast } from "sonner";

import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import { useAuth } from "@/lib/auth-context";
import {
  createRegistration,
  getMyEventRegistration,
  getPublicEvent,
  type PublicRegistrationEvent,
} from "@/lib/data/public-client";
import { downloadRegistrationReceipt } from "@/lib/data/receipt.client";
import { formatDate } from "@/lib/dates";
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

const fieldClass =
  "w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-ieee-blue/60 focus:ring-4 focus:ring-ieee-blue/10 disabled:bg-slate-50 disabled:text-slate-500";

function BookingProgress({ paid, stage = "details" }: { paid: boolean; stage?: "details" | "payment" | "ticket" }) {
  const steps = paid ? ["Details", "Payment", "Ticket"] : ["Details", "Ticket"];
  const stageIndex = paid
    ? { details: 0, payment: 1, ticket: 2 }[stage]
    : stage === "ticket" ? 1 : 0;

  return (
    <div className="flex items-center gap-2" aria-label="Registration progress">
      {steps.map((step, index) => (
        <div key={step} className="contents">
          {index > 0 && <div className={`h-px w-5 sm:w-8 ${index <= stageIndex ? "bg-ieee-blue" : "bg-white/30"}`} />}
          <div className={`flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] ${index <= stageIndex ? "text-white" : "text-white/55"}`}>
            <span className={`flex h-5 w-5 items-center justify-center rounded-full border ${index < stageIndex ? "border-white bg-white text-ieee-blue" : index === stageIndex ? "border-white bg-white/15" : "border-white/30"}`}>
              {index < stageIndex ? <Check className="h-3 w-3" /> : index + 1}
            </span>
            <span className="hidden sm:inline">{step}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function EventHero({ event }: { event: PublicRegistrationEvent }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative min-h-[310px] overflow-hidden rounded-[2rem] bg-slate-950 shadow-2xl shadow-slate-300/40 sm:min-h-[390px] lg:min-h-[450px]"
    >
      {event.bannerUrl ? (
        <img src={event.bannerUrl} alt={event.title} className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,#0ea5e9_0,transparent_35%),linear-gradient(135deg,#00629B,#0f172a_70%)]" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/35 to-slate-950/5" />
      <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-4 p-5 sm:p-7">
        <span className="rounded-full border border-white/20 bg-black/20 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-md">
          {event.isPaid ? `₹${event.price}` : "Free event"}
        </span>
        <BookingProgress paid={event.isPaid} />
      </div>
      <div className="absolute inset-x-0 bottom-0 p-6 sm:p-8 lg:p-10">
        <h1 className="max-w-4xl text-3xl font-black leading-[1.05] tracking-tight text-white sm:text-4xl lg:text-5xl">
          {event.title}
        </h1>
        <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm font-medium text-white/85">
          <span className="inline-flex items-center gap-2"><CalendarDays className="h-4 w-4" />{formatDate(event.date)}</span>
          <span className="inline-flex items-center gap-2"><MapPin className="h-4 w-4" />{event.venue}</span>
          {event.maxCapacity > 0 && (
            <span className="inline-flex items-center gap-2"><Ticket className="h-4 w-4" />{Math.max(0, event.maxCapacity - event.registeredCount)} seats left</span>
          )}
        </div>
      </div>
    </motion.section>
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
      <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4">
        <input id={field.id} type="checkbox" checked={value === "true"} onChange={(e) => onChange(e.target.checked ? "true" : "false")} className="mt-0.5 h-4 w-4 accent-ieee-blue" />
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
            <label key={option} className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-medium transition ${value === normalized ? "border-ieee-blue bg-ieee-blue/5 text-ieee-blue" : "border-slate-200 bg-white text-slate-700"}`}>
              <input type="radio" name={`field-${field.id}`} value={normalized} checked={value === normalized} onChange={() => onChange(normalized)} className="accent-ieee-blue" />
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
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="rounded-[2rem] border border-amber-200 bg-white p-7 shadow-sm sm:p-9">
        <Clock3 className="h-11 w-11 text-amber-500" />
        <h2 className="mt-5 text-2xl font-black text-slate-950">Payment under review</h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">
          We received payment information for this event, but an organizer needs to review it before a ticket can be issued. Please don&apos;t register or pay again.
        </p>
      </motion.div>
    );
  }
  if (action === "payment") {
    return (
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="rounded-[2rem] border border-sky-200 bg-white p-7 shadow-sm sm:p-9">
        <CreditCard className="h-11 w-11 text-ieee-blue" />
        <h2 className="mt-5 text-2xl font-black text-slate-950">Your registration is waiting for payment</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">Your details are already saved. Continue the existing payment instead of registering again.</p>
        <Link to={`/payment/${state.registrationId}`} className="mt-6 inline-flex w-full items-center justify-center rounded-2xl bg-ieee-blue px-5 py-3.5 font-bold text-white sm:w-auto sm:min-w-56">
          Continue payment
        </Link>
      </motion.div>
    );
  }
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="rounded-[2rem] border border-emerald-200 bg-white p-7 shadow-sm sm:p-9">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50"><CheckCircle2 className="h-7 w-7 text-emerald-600" /></div>
      <h2 className="mt-5 text-2xl font-black text-slate-950">You&apos;re registered</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        {isPast ? "This event has ended, but your ticket and payment receipt remain available here." : "Your place is confirmed. Keep your ticket ready for event check-in."}
      </p>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <Link to={`/ticket/${state.ticketId}`} className="inline-flex items-center justify-center rounded-2xl bg-ieee-blue px-5 py-3.5 font-bold text-white">View ticket</Link>
        {state.receiptAvailable && (
          <button type="button" onClick={onReceipt} className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-3.5 font-bold text-slate-800 hover:bg-slate-50">Download receipt</button>
        )}
      </div>
    </motion.div>
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
    const profile = loadRegistrationProfile(user.id);
    const draft = loadRegistrationDraft(user.id, event.id);
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

  const email = user?.email || "";
  const capacityFull = !!event?.maxCapacity && event.registeredCount >= event.maxCapacity;
  const action = useMemo(
    () => registrationAction(registrationState, !!event?.registrationOpen && !capacityFull),
    [capacityFull, event?.registrationOpen, registrationState],
  );

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
      toast.error(err instanceof Error ? err.message : "Something went wrong");
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
    return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><Loader2 className="h-10 w-10 animate-spin text-ieee-blue" /></div>;
  }
  if (error || !event) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="max-w-md rounded-3xl border border-rose-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-xl font-black text-slate-950">{error || "Event not found"}</h1>
          <p className="mt-2 text-sm text-slate-600">This event is unavailable or has been removed.</p>
          <Link to="/events" className="mt-6 inline-flex rounded-xl bg-ieee-blue px-5 py-3 font-bold text-white">Browse events</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F7FA] text-slate-900">
      <Navbar />
      <main className="mx-auto max-w-6xl px-4 pb-24 pt-24 sm:px-6 lg:px-8">
        <Link to="/events" className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-900"><ArrowLeft className="h-4 w-4" />Back to events</Link>
        <EventHero event={event} />

        <div className="mt-8 grid gap-7 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div>
            {authStatus === "loading" || registrationStateLoading ? (
              <div className="rounded-[2rem] border border-slate-200 bg-white p-10 text-center"><Loader2 className="mx-auto h-8 w-8 animate-spin text-ieee-blue" /><p className="mt-3 text-sm text-slate-500">Checking your registration…</p></div>
            ) : !user ? (
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="rounded-[2rem] border border-slate-200 bg-white p-8 text-center shadow-sm sm:p-10">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-ieee-blue/10"><ShieldCheck className="h-7 w-7 text-ieee-blue" /></div>
                <h2 className="mt-5 text-2xl font-black">Sign in to register</h2>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">Your Google account keeps your registration and ticket tied to you and lets us prevent duplicate registrations.</p>
                <button type="button" onClick={signIn} className="mt-6 rounded-2xl bg-ieee-blue px-6 py-3.5 font-bold text-white">Sign in with Google</button>
              </motion.div>
            ) : registrationState?.found ? (
              <StatusCard event={event} state={registrationState} onReceipt={() => void handleReceipt()} />
            ) : action === "closed" ? (
              <div className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm">
                <Clock3 className="h-10 w-10 text-slate-400" />
                <h2 className="mt-4 text-2xl font-black">{capacityFull ? "Event full" : "Registration closed"}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">{capacityFull ? "All available seats are currently reserved." : "This event is no longer accepting new registrations."}</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6">
                <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
                  <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-ieee-blue">Your details</p>
                  <h2 className="mt-2 text-2xl font-black">Tell us who&apos;s attending</h2>
                  <p className="mt-1 text-sm text-slate-500">Saved securely in this browser for your next IEEE event too.</p>
                  <div className="mt-6 grid gap-5 sm:grid-cols-2">
                    <label className="sm:col-span-2"><span className="mb-2 block text-sm font-semibold">Full name *</span><input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" className={`${fieldClass} ${errors.name ? "border-rose-400" : ""}`} placeholder="Your full name" />{errors.name && <span className="mt-1.5 block text-xs text-rose-600">{errors.name}</span>}</label>
                    <label><span className="mb-2 block text-sm font-semibold">Email</span><input value={email} readOnly autoComplete="email" className={fieldClass} /><span className="mt-1.5 block text-xs text-slate-400">From your signed-in Google account</span></label>
                    <label><span className="mb-2 block text-sm font-semibold">Phone *</span><input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" inputMode="tel" autoComplete="tel" className={`${fieldClass} ${errors.phone ? "border-rose-400" : ""}`} placeholder="+91 98765 43210" />{errors.phone && <span className="mt-1.5 block text-xs text-rose-600">{errors.phone}</span>}</label>
                    <label className="sm:col-span-2"><span className="mb-2 block text-sm font-semibold">College / Institution *</span><input value={college} onChange={(e) => setCollege(e.target.value)} autoComplete="organization" className={`${fieldClass} ${errors.college ? "border-rose-400" : ""}`} placeholder="Your college or institution" />{errors.college && <span className="mt-1.5 block text-xs text-rose-600">{errors.college}</span>}</label>
                    <label><span className="mb-2 block text-sm font-semibold">Branch / Department</span><input value={branch} onChange={(e) => setBranch(e.target.value)} className={fieldClass} placeholder="Computer Science" /></label>
                    <label><span className="mb-2 block text-sm font-semibold">Semester</span><input value={semester} onChange={(e) => setSemester(e.target.value)} className={fieldClass} placeholder="S6" /></label>
                  </div>

                  {event.collectIeeeMember && (
                    <div className="mt-6 border-t border-slate-100 pt-6">
                      <label className="flex cursor-pointer items-center gap-3"><input type="checkbox" checked={isIeeeMember} onChange={(e) => setIsIeeeMember(e.target.checked)} className="h-4 w-4 accent-ieee-blue" /><span className="text-sm font-semibold">I am an IEEE member</span></label>
                      <AnimatePresence initial={false}>{isIeeeMember && <motion.label initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mt-4 block overflow-hidden"><span className="mb-2 block text-sm font-semibold">IEEE Membership ID</span><input value={ieeeMembershipId} onChange={(e) => setIeeeMembershipId(e.target.value)} className={fieldClass} placeholder="Membership ID" /></motion.label>}</AnimatePresence>
                    </div>
                  )}
                </motion.section>

                {event.formFields.length > 0 && (
                  <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
                    <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-ieee-blue">Event questions</p>
                    <h2 className="mt-2 text-2xl font-black">A few more details</h2>
                    <div className="mt-6 space-y-5">
                      {event.formFields.map((field) => (
                        <div key={field.id}>
                          {field.type !== "checkbox" && <label htmlFor={field.id} className="mb-2 block text-sm font-semibold">{field.label}{field.required ? " *" : ""}</label>}
                          <DynamicField field={field} value={customFields[field.id] || ""} onChange={(value) => setCustomFields((current) => ({ ...current, [field.id]: value }))} error={errors[field.id]} />
                          {errors[field.id] && <p className="mt-1.5 text-xs text-rose-600">{errors[field.id]}</p>}
                        </div>
                      ))}
                    </div>
                  </motion.section>
                )}

                <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="sticky bottom-3 z-20 rounded-[2rem] border border-slate-200 bg-white/95 p-5 shadow-xl shadow-slate-300/30 backdrop-blur sm:static sm:p-6">
                  <label className="flex cursor-pointer items-start gap-3"><input type="checkbox" checked={acceptedTerms} onChange={(e) => setAcceptedTerms(e.target.checked)} className="mt-0.5 h-4 w-4 accent-ieee-blue" /><span className="text-sm leading-6 text-slate-600">I confirm that the information above is accurate and agree to the event terms.</span></label>
                  {errors.terms && <p className="mt-2 text-xs text-rose-600">{errors.terms}</p>}
                  <button type="submit" disabled={submitting} className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-ieee-blue px-5 py-4 font-black text-white transition hover:-translate-y-0.5 hover:shadow-lg disabled:translate-y-0 disabled:bg-slate-300 disabled:shadow-none">
                    {submitting ? <><Loader2 className="h-5 w-5 animate-spin" />Saving your details…</> : event.isPaid ? <><CreditCard className="h-5 w-5" />Continue to payment · ₹{event.price}</> : <><Ticket className="h-5 w-5" />Confirm free registration</>}
                  </button>
                </motion.section>
              </form>
            )}
          </div>

          <aside className="h-fit rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm lg:sticky lg:top-24">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-slate-400">Registration summary</p>
            <h3 className="mt-3 text-lg font-black leading-snug">{event.title}</h3>
            <div className="mt-5 space-y-3 text-sm text-slate-600">
              <div className="flex gap-3"><CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-ieee-blue" /><span>{formatDate(event.date)}</span></div>
              <div className="flex gap-3"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-ieee-blue" /><span>{event.venue}</span></div>
            </div>
            <div className="mt-6 border-t border-dashed border-slate-200 pt-5"><div className="flex items-end justify-between"><span className="text-sm text-slate-500">Registration fee</span><strong className="text-2xl font-black">{event.isPaid ? `₹${event.price}` : "Free"}</strong></div></div>
            {memoryReady && user && action === "register" && <p className="mt-5 rounded-2xl bg-sky-50 px-4 py-3 text-xs leading-5 text-sky-800">Your form is automatically saved on this device while you type.</p>}
          </aside>
        </div>
      </main>
      <Footer />
    </div>
  );
}
