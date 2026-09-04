import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router";
import { AlertTriangle, CalendarDays, Check, CircleDollarSign, Eye, ExternalLink, Loader2, MapPin, MessageCircle, ShieldCheck, TicketCheck, Users, WalletCards, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fromAppDateOnly, fromAppDateTimeLocal, formatEventDateTime, getAppDayBounds, toAppDateOnly, toAppDateTimeLocal } from "@/lib/dates";
import { ImageUpload } from "@/components/admin/image-upload";
import { CustomFieldBuilder, type FormField } from "@/components/admin/custom-field-builder";
import { CouponManager } from "@/components/admin/coupon-manager";
import type { Coupon } from "@/types";
import {
  getAdminEvent,
  getAdminEventPrivateDetails,
  listEventCoupons,
  saveAdminEvent,
  saveAdminEventPrivateDetails,
  type AdminEventPrivateDetails,
} from "@/lib/data/admin-events.client";
import { listAdminSocieties } from "@/lib/data/admin-societies.client";
import { getEventAttendanceMode, type EventAttendanceMode } from "@/lib/event-presentation";
import { normalizeEligibleProgrammes, normalizeEligibleSemesters } from "@/lib/event-audience";
import { EventAudienceEditor } from "@/features/admin/events/event-audience-editor";

type RegistrationMethod = "internal" | "external" | "closed";
type SetupSection = "details" | "registration" | "fees" | "communication" | "preview";
type Availability = "open" | "scheduled" | "paused";
interface SocietyOption { id: string; name: string; }
interface EventFormProps { mode: "create" | "edit"; eventId?: string; initialSocietyId?: string; allowSocietyTransfer?: boolean; }
interface EventFormState {
  title: string; description: string; date: string; endDate: string; timeTbc: boolean; venue: string; timezone: string; attendanceMode: EventAttendanceMode; locationAddress: string; price: string;
  paymentProvider: "razorpay" | "kotak"; maxCapacity: string; status: string; society: string;
  registrationMode: RegistrationMethod; registrationOpen: boolean; checkInEnabled: boolean; collectIeeeMember: boolean;
  eligibleSemesters: string[]; eligibleProgrammes: string[];
  registrationStart: string; registrationDeadline: string; allowSelfCancellation: boolean; selfCancellationUntil: string;
  refundRequestUntil: string; refundPolicy: string; waitlistEnabled: boolean; waitlistOfferMinutes: string; contactEmail: string; contactPhone: string;
  externalLink: string; whatsappLink: string; tags: string; externalFormUrl: string;
}
interface BaselineState { form: EventFormState; customFields: FormField[]; coupons: Coupon[]; }
const EMPTY_PRIVATE_DETAILS: AdminEventPrivateDetails = { virtualJoinUrl: "", joinInstructions: "" };
const EMPTY_STATE: EventFormState = {
  title: "", description: "", date: "", endDate: "", timeTbc: false, venue: "", timezone: "Asia/Kolkata", attendanceMode: "onsite", locationAddress: "", price: "0", paymentProvider: "razorpay",
  maxCapacity: "", status: "draft", society: "", registrationMode: "internal", registrationOpen: true,
  checkInEnabled: true, collectIeeeMember: false, eligibleSemesters: [], eligibleProgrammes: [], registrationStart: "", registrationDeadline: "",
  allowSelfCancellation: false, selfCancellationUntil: "", refundRequestUntil: "", refundPolicy: "", waitlistEnabled: false, waitlistOfferMinutes: "360",
  contactEmail: "", contactPhone: "", externalLink: "", whatsappLink: "", tags: "", externalFormUrl: "",
};
const SECTIONS: Array<{ id: SetupSection; label: string; description: string; icon: typeof CalendarDays }> = [
  { id: "details", label: "Event details", description: "Public information", icon: CalendarDays },
  { id: "registration", label: "Registration", description: "How people join", icon: Users },
  { id: "fees", label: "Fees & discounts", description: "Money and coupons", icon: WalletCards },
  { id: "communication", label: "Communication", description: "Contacts and links", icon: MessageCircle },
  { id: "preview", label: "Review", description: "Before submission", icon: Eye },
];
const STANDARD_FIELDS = [
  ["Full name", "Required"], ["Email", "From account"], ["Phone", "Required"],
  ["College / institution", "Required"], ["Branch / department", "Optional"], ["Semester", "Optional"],
] as const;
function safeMode(value: unknown, open: unknown, external: unknown): RegistrationMethod {
  if (value === "internal" || value === "external" || value === "closed") return value;
  if (String(external || "")) return "external";
  return open === false ? "closed" : "internal";
}
function timestamp(value: string) { const normalized = fromAppDateTimeLocal(value); return normalized ? Date.parse(normalized) : Number.NaN; }
function eventStartTimestamp(form: EventFormState) {
  const normalized = form.timeTbc ? fromAppDateOnly(form.date) : fromAppDateTimeLocal(form.date);
  return normalized ? Date.parse(normalized) : Number.NaN;
}
function eventEndTimestamp(form: EventFormState) {
  if (!form.timeTbc && form.endDate) return timestamp(form.endDate);
  const start = eventStartTimestamp(form);
  if (!Number.isFinite(start)) return Number.NaN;
  return form.timeTbc ? Date.parse(getAppDayBounds(new Date(start)).endIso) : start;
}
function same(a: unknown, b: unknown) { return JSON.stringify(a) === JSON.stringify(b); }
function requestErrorMessage(error: unknown, fallback: string) {
  if (error && typeof error === "object") {
    const response = (error as { response?: { error?: unknown; message?: unknown; data?: { error?: unknown; message?: unknown } } }).response;
    const detail = response?.error ?? response?.data?.error ?? response?.data?.message ?? response?.message;
    if (typeof detail === "string" && detail.trim()) return detail;
  }
  return error instanceof Error && error.message && error.message !== "Something went wrong." ? error.message : fallback;
}
function choice(active: boolean) {
  return `flex min-h-24 cursor-pointer flex-col justify-between rounded-xl border p-4 text-left transition-colors ${active ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "border-border bg-background hover:bg-muted/35"}`;
}
function SectionTitle({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <div className="border-b border-border pb-5"><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">{eyebrow}</p><h2 className="mt-2 text-2xl font-semibold tracking-tight">{title}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p></div>;
}
function TagsEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const tags = value.split(",").map((tag) => tag.trim()).filter(Boolean); const [draft, setDraft] = useState("");
  const add = () => { const next = draft.trim().replace(/^#/, ""); if (next && !tags.includes(next)) onChange([...tags, next].join(", ")); setDraft(""); };
  return <div className="space-y-2"><div className="flex flex-wrap gap-2">{tags.map((tag) => <span key={tag} className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/35 px-2.5 py-1 text-xs">{tag}<button type="button" aria-label={`Remove ${tag}`} onClick={() => onChange(tags.filter((item) => item !== tag).join(", "))}><X className="h-3 w-3 text-muted-foreground" /></button></span>)}</div><Input value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={add} onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); } }} placeholder="Type a tag and press Enter" /></div>;
}
function QuestionPreview({ field }: { field: FormField }) {
  return <div className="space-y-2"><div className="text-xs font-semibold">{field.label || "Untitled question"}{field.required ? " *" : ""}</div>{field.type === "textarea" ? <div className="h-20 rounded-lg border border-input bg-muted/20" /> : field.type === "radio" || field.type === "boolean" ? <div className="grid gap-2 sm:grid-cols-2">{(field.type === "boolean" ? ["Yes", "No"] : field.options).filter(Boolean).slice(0, 4).map((option) => <div key={option} className="rounded-lg border border-input px-3 py-2 text-xs text-muted-foreground">{option}</div>)}</div> : field.type === "checkbox" ? <div className="flex items-center gap-2 rounded-lg border border-input px-3 py-3 text-xs text-muted-foreground"><span className="h-4 w-4 rounded border border-input" />{field.defaultValue || field.label || "Checkbox"}</div> : <div className="h-10 rounded-lg border border-input bg-muted/20" />}</div>;
}
export function EventForm({ mode, eventId, initialSocietyId, allowSocietyTransfer = false }: EventFormProps) {
  const navigate = useNavigate(); const queryClient = useQueryClient(); const [searchParams, setSearchParams] = useSearchParams();
  const isEdit = mode === "edit"; const requested = searchParams.get("section") as SetupSection | null;
  const section: SetupSection = requested && SECTIONS.some((item) => item.id === requested) ? requested : "details";
  const [form, setForm] = useState<EventFormState>(() => ({ ...EMPTY_STATE, society: initialSocietyId || "" }));
  const [bannerFile, setBannerFile] = useState<File | null>(null); const [removeBanner, setRemoveBanner] = useState(false);
  const [customFields, setCustomFields] = useState<FormField[]>([]); const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [privateDetails, setPrivateDetails] = useState<AdminEventPrivateDetails>(EMPTY_PRIVATE_DETAILS);
  const [privateDirty, setPrivateDirty] = useState(false);
  const [baseline, setBaseline] = useState<BaselineState | null>(null); const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null); const [dirty, setDirty] = useState(false);
  const [availabilityChoice, setAvailabilityChoice] = useState<Availability | null>(null); const [feeChoice, setFeeChoice] = useState<"free" | "paid" | null>(null);
  const { data: societies } = useQuery<{ societies: SocietyOption[] }>({ queryKey: ["admin-societies-options"], queryFn: () => listAdminSocieties({ perPage: 200 }), staleTime: 60_000 });
  const { data: existing, isLoading: existingLoading } = useQuery<{ event: Record<string, unknown> }>({ queryKey: ["admin-event", eventId], queryFn: () => getAdminEvent(eventId!), enabled: isEdit && Boolean(eventId) });
  const { data: existingCoupons } = useQuery<{ coupons: Coupon[] }>({ queryKey: ["admin-event-coupons", eventId], queryFn: () => listEventCoupons(eventId!), enabled: isEdit && Boolean(eventId) });
  const { data: existingPrivateDetails } = useQuery<AdminEventPrivateDetails>({ queryKey: ["admin-event-private-details", eventId], queryFn: () => getAdminEventPrivateDetails(eventId!), enabled: isEdit && Boolean(eventId), staleTime: 30_000 });
  useEffect(() => {
    if (!isEdit || !existing?.event) return; const e = existing.event;
    const timeTbc = Boolean(e.timeTbc);
    const hydrated: EventFormState = {
      title: String(e.title ?? ""), description: String(e.description ?? ""), date: timeTbc ? toAppDateOnly(e.date as string | undefined) : toAppDateTimeLocal(e.date as string | undefined), endDate: timeTbc ? "" : toAppDateTimeLocal(e.endDate as string | undefined), timeTbc, venue: String(e.venue ?? ""), timezone: String(e.timezone ?? "") || "Asia/Kolkata", attendanceMode: getEventAttendanceMode({ attendanceMode: String(e.attendanceMode ?? ""), venue: String(e.venue ?? "") }), locationAddress: String(e.locationAddress ?? ""),
      price: String(e.price ?? "0"), paymentProvider: String(e.paymentProvider ?? "razorpay") === "kotak" ? "kotak" : "razorpay", maxCapacity: e.maxCapacity != null && Number(e.maxCapacity) > 0 ? String(e.maxCapacity) : "", status: String(e.status ?? "draft"), society: String(e.society ?? ""),
      registrationMode: safeMode(e.registrationMode, e.registrationOpen, e.externalFormUrl), registrationOpen: e.registrationOpen !== false, checkInEnabled: e.checkInEnabled !== false, collectIeeeMember: Boolean(e.collectIeeeMember),
      eligibleSemesters: normalizeEligibleSemesters(Array.isArray(e.eligibleSemesters) ? e.eligibleSemesters as string[] : []), eligibleProgrammes: normalizeEligibleProgrammes(Array.isArray(e.eligibleProgrammes) ? e.eligibleProgrammes as string[] : []),
      registrationStart: toAppDateTimeLocal(e.registrationStart as string | undefined), registrationDeadline: toAppDateTimeLocal(e.registrationDeadline as string | undefined),
      allowSelfCancellation: Boolean(e.allowSelfCancellation), selfCancellationUntil: toAppDateTimeLocal(e.selfCancellationUntil as string | undefined),
      refundRequestUntil: toAppDateTimeLocal(e.refundRequestUntil as string | undefined), refundPolicy: String(e.refundPolicy ?? ""), waitlistEnabled: Boolean(e.waitlistEnabled), waitlistOfferMinutes: String(Number(e.waitlistOfferMinutes) || 360),
      contactEmail: String(e.contactEmail ?? ""), contactPhone: String(e.contactPhone ?? ""),
      externalLink: String(e.externalLink ?? ""), whatsappLink: String(e.whatsappLink ?? ""), tags: String(e.tags ?? ""), externalFormUrl: String(e.externalFormUrl ?? ""),
    };
    const fields = Array.isArray(e.formTemplate) ? e.formTemplate as FormField[] : [];
    setForm(hydrated); setCustomFields(fields); setAvailabilityChoice(null); setFeeChoice(null); setBaseline((current) => ({ form: hydrated, customFields: fields, coupons: current?.coupons ?? [] })); setDirty(false);
  }, [existing, isEdit]);
  useEffect(() => { if (!isEdit || !existingCoupons?.coupons) return; setCoupons(existingCoupons.coupons); setBaseline((current) => current ? { ...current, coupons: existingCoupons.coupons } : current); }, [existingCoupons, isEdit]);
  useEffect(() => { if (!isEdit || !existingPrivateDetails || privateDirty) return; setPrivateDetails(existingPrivateDetails); }, [existingPrivateDetails, isEdit, privateDirty]);
  useEffect(() => { if (!dirty) return; const handler = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; }; window.addEventListener("beforeunload", handler); return () => window.removeEventListener("beforeunload", handler); }, [dirty]);
  const setSection = (next: SetupSection) => { const params = new URLSearchParams(searchParams); params.set("section", next); setSearchParams(params, { replace: true }); };
  const patch = <K extends keyof EventFormState>(key: K, value: EventFormState[K]) => { setDirty(true); setForm((current) => ({ ...current, [key]: value })); };
  const setTimeTbc = (checked: boolean) => {
    setDirty(true);
    setForm((current) => ({
      ...current,
      timeTbc: checked,
      date: current.date ? (checked ? current.date.slice(0, 10) : `${current.date.slice(0, 10)}T09:00`) : "",
      endDate: checked ? "" : current.endDate,
    }));
  };
  const availability: Availability = useMemo(() => availabilityChoice ?? (!form.registrationOpen ? "paused" : form.registrationStart && timestamp(form.registrationStart) > Date.now() ? "scheduled" : "open"), [availabilityChoice, form.registrationOpen, form.registrationStart]);
  const feeMode: "free" | "paid" = feeChoice ?? (Number(form.price) > 0 ? "paid" : "free");
  const existingRecord = existing?.event ?? null; const approvalStatus = String(existingRecord?.approvalStatus ?? "draft");
  const financeApprovalStatus = String(existingRecord?.financeApprovalStatus ?? "not_required"); const hasApproval = approvalStatus === "approved" || financeApprovalStatus === "approved";
  const impact = useMemo(() => {
    if (!baseline) return { operational: false, finance: false };
    const operationalKeys: Array<keyof EventFormState> = ["date", "endDate", "timeTbc", "venue", "timezone", "attendanceMode", "locationAddress", "maxCapacity", "registrationMode", "registrationOpen", "registrationStart", "registrationDeadline", "externalFormUrl", "checkInEnabled", "collectIeeeMember", "eligibleSemesters", "eligibleProgrammes", "allowSelfCancellation", "selfCancellationUntil", "refundRequestUntil", "refundPolicy", "waitlistEnabled", "waitlistOfferMinutes"];
    const financeKeys: Array<keyof EventFormState> = ["price", "paymentProvider"];
    operationalKeys.push("society");
    return { operational: operationalKeys.some((key) => form[key] !== baseline.form[key]) || !same(customFields, baseline.customFields), finance: financeKeys.some((key) => form[key] !== baseline.form[key]) || !same(coupons, baseline.coupons) };
  }, [baseline, coupons, customFields, form]);
  const sensitiveChanged = impact.operational || impact.finance;
  const setupChanged = !isEdit || Boolean(bannerFile) || removeBanner || Boolean(baseline && (!same(form, baseline.form) || !same(customFields, baseline.customFields) || !same(coupons, baseline.coupons)));
  const publishedSensitiveBlock = isEdit && form.status === "published" && sensitiveChanged;
  const validate = () => {
    if (!form.title.trim()) return ["details", "Enter an event name."] as const; if (!form.society) return ["details", "Select the host society."] as const;
    if (!form.date) return ["details", "Set the event start date and time."] as const; if (form.attendanceMode !== "online" && !form.venue.trim()) return ["details", "Enter the event venue."] as const;
    if (!form.timeTbc && form.endDate && timestamp(form.endDate) <= eventStartTimestamp(form)) return ["details", "Event end time must be after the start time."] as const;
    if (!isEdit && (form.timeTbc ? form.date < toAppDateOnly(new Date().toISOString()) : eventStartTimestamp(form) < Date.now() - 300000)) return ["details", "A new event cannot start in the past."] as const;
    if (form.registrationMode === "external" && !form.externalFormUrl.trim()) return ["registration", "Add the external registration URL."] as const;
    if (form.registrationMode !== "closed") {
      if (availability === "scheduled" && !form.registrationStart) return ["registration", "Set when scheduled registration should open."] as const;
      if (form.registrationStart && timestamp(form.registrationStart) >= eventEndTimestamp(form)) return ["registration", "Registration must open before the event ends."] as const;
      if (form.registrationStart && form.registrationDeadline && timestamp(form.registrationStart) >= timestamp(form.registrationDeadline)) return ["registration", "Registration must close after it opens."] as const;
      if (form.registrationDeadline && timestamp(form.registrationDeadline) > eventEndTimestamp(form)) return ["registration", "Registration deadline cannot be after the event ends."] as const;
    }
    if (form.registrationMode === "internal") {
      if (form.allowSelfCancellation && form.selfCancellationUntil && timestamp(form.selfCancellationUntil) > eventEndTimestamp(form)) return ["registration", "Self-cancellation deadline cannot be after the event ends."] as const;
      if (form.allowSelfCancellation && form.refundRequestUntil && timestamp(form.refundRequestUntil) > eventEndTimestamp(form)) return ["registration", "Refund-request deadline cannot be after the event ends."] as const;
      if (form.waitlistEnabled && (!form.maxCapacity || Number(form.maxCapacity) <= 0)) return ["registration", "Set a finite capacity before enabling the waitlist."] as const;
      if (form.waitlistEnabled && (Number(form.waitlistOfferMinutes) < 15 || Number(form.waitlistOfferMinutes) > 10080)) return ["registration", "Waitlist offer time must be between 15 minutes and 7 days."] as const;
      const invalidQuestion = customFields.find((field) => !field.label.trim() || ((field.type === "select" || field.type === "radio") && !field.options.some((option) => option.trim())));
      if (invalidQuestion) return ["registration", "Finish every event question and provide at least one option for choice questions."] as const;
      if (Number(form.price) < 0) return ["fees", "Registration fee cannot be negative."] as const;
      if (feeMode === "paid" && Number(form.price) <= 0) return ["fees", "Enter a registration fee greater than ₹0."] as const;
    }
    return null;
  };
  const buildPayload = () => { const effectivePrice = form.registrationMode === "internal" ? Number(form.price) || 0 : 0; return ({ title: form.title.trim(), description: form.description, venue: form.attendanceMode === "online" ? "" : form.venue.trim(), timezone: form.timezone || "Asia/Kolkata", attendanceMode: form.attendanceMode, locationAddress: form.attendanceMode === "online" ? "" : form.locationAddress.trim(), price: effectivePrice,
    paymentProvider: form.paymentProvider, baseFeePaise: Math.max(0, Math.round(effectivePrice * 100)), status: form.status,
    society: form.society, registrationMode: form.registrationMode, registrationOpen: form.registrationMode !== "closed" && form.registrationOpen,
    checkInEnabled: form.checkInEnabled, collectIeeeMember: form.collectIeeeMember, eligibleSemesters: form.registrationMode === "internal" ? form.eligibleSemesters : [], eligibleProgrammes: form.registrationMode === "internal" ? form.eligibleProgrammes : [], timeTbc: form.timeTbc, date: form.timeTbc ? fromAppDateOnly(form.date) : fromAppDateTimeLocal(form.date), endDate: form.timeTbc ? "" : fromAppDateTimeLocal(form.endDate) || "",
    registrationStart: fromAppDateTimeLocal(form.registrationStart) || "", registrationDeadline: fromAppDateTimeLocal(form.registrationDeadline) || "",
    allowSelfCancellation: form.registrationMode === "internal" && form.allowSelfCancellation, selfCancellationUntil: fromAppDateTimeLocal(form.selfCancellationUntil) || "",
    refundRequestUntil: fromAppDateTimeLocal(form.refundRequestUntil) || "", refundPolicy: form.refundPolicy.trim(),
    waitlistEnabled: form.registrationMode === "internal" && form.waitlistEnabled, waitlistOfferMinutes: Math.max(15, Number(form.waitlistOfferMinutes) || 360),
    contactEmail: form.contactEmail.trim(), contactPhone: form.contactPhone.trim(), externalLink: form.externalLink.trim(), whatsappLink: form.whatsappLink.trim(), tags: form.tags.trim(), externalFormUrl: form.externalFormUrl.trim(),
    formTemplate: customFields, maxCapacity: form.maxCapacity ? Number(form.maxCapacity) : 0, coupons }); };
  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault(); setSubmitError(null); const validation = validate();
    if (validation) { setSubmitError(validation[1]); if (isEdit) setSection(validation[0]); return; }
    if (publishedSensitiveBlock) { setSubmitError("Return this published event to draft before changing operational, registration, or financial settings."); return; }
    setSubmitting(true);
    try {
      let savedEventId = eventId || "";
      let persistedCoupons = coupons;
      if (setupChanged) {
        const result = await saveAdminEvent({ id: isEdit ? eventId : undefined, payload: buildPayload(), bannerFile, removeBanner });
        savedEventId = result.event.id;
        persistedCoupons = result.coupons ?? [];
      }
      if (isEdit && privateDirty) {
        await saveAdminEventPrivateDetails(savedEventId, form.attendanceMode === "onsite" ? EMPTY_PRIVATE_DETAILS : privateDetails);
      }
      const savedForm: EventFormState = { ...form, venue: form.attendanceMode === "online" ? "" : form.venue, locationAddress: form.attendanceMode === "online" ? "" : form.locationAddress, price: form.registrationMode === "internal" ? String(Number(form.price) || 0) : "0", registrationOpen: form.registrationMode !== "closed" && form.registrationOpen };
      setForm(savedForm); setCoupons(persistedCoupons); setBaseline({ form: savedForm, customFields: [...customFields], coupons: [...persistedCoupons] }); setDirty(false); setPrivateDirty(false); setBannerFile(null); setRemoveBanner(false); setAvailabilityChoice(null); setFeeChoice(null);
      await Promise.all([queryClient.invalidateQueries({ queryKey: ["admin-events"] }), queryClient.invalidateQueries({ queryKey: ["admin-event"] }), queryClient.invalidateQueries({ queryKey: ["admin-event-coupons"] }), queryClient.invalidateQueries({ queryKey: ["admin-event-private-details"] }), queryClient.invalidateQueries({ queryKey: ["admin-event-operations"] }), queryClient.invalidateQueries({ queryKey: ["admin-stats"] })]);
      if (!isEdit) { toast.success("Draft created. Finish the setup before submitting it for review."); navigate(`/admin/events/${savedEventId}/edit?section=details`, { replace: true }); }
      else toast.success(sensitiveChanged && hasApproval ? "Changes saved. Approval was returned to review." : privateDirty && !setupChanged ? "Private attendee access saved" : "Event settings saved");
    } catch (error) { setSubmitError(requestErrorMessage(error, "Could not save the event")); } finally { setSubmitting(false); }
  };
  const leaveEditor = () => { if (dirty && !window.confirm("Discard your unsaved changes?")) return; navigate(eventId ? `/admin/events/${eventId}` : "/admin/events"); };
  if (isEdit && existingLoading) return <div className="space-y-4"><Skeleton className="h-20" /><Skeleton className="h-[520px]" /></div>;
  if (!isEdit) return <form onSubmit={handleSubmit} className="mx-auto max-w-4xl"><div className="overflow-hidden rounded-2xl border border-border bg-card">
    <div className="border-b border-border bg-muted/20 px-6 py-5 sm:px-8"><div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.14em] text-primary"><span className="grid h-7 w-7 place-items-center rounded-full bg-primary text-primary-foreground">1</span>Start a draft</div><h2 className="mt-4 text-3xl font-semibold tracking-tight">Give the event its essentials.</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Create the draft first. Registration, fees, attendee questions, communication and approval come next inside the event.</p></div>
    <div className="grid gap-6 p-6 sm:p-8"><div className="grid gap-2"><Label htmlFor="draft-title">Event name *</Label><Input id="draft-title" value={form.title} onChange={(e) => patch("title", e.target.value)} placeholder="e.g. Introduction to Hardware Security" maxLength={200} autoFocus /></div>
      <div className="grid gap-6 md:grid-cols-2"><div className="grid gap-2"><Label>Host society *</Label><Select value={form.society || "__none__"} onValueChange={(value) => patch("society", value === "__none__" ? "" : value)}><SelectTrigger><SelectValue placeholder="Select society" /></SelectTrigger><SelectContent><SelectItem value="__none__">Select a society...</SelectItem>{(societies?.societies ?? []).map((society) => <SelectItem key={society.id} value={society.id}>{society.name}</SelectItem>)}</SelectContent></Select></div>
      <div className="grid gap-2"><Label htmlFor="draft-date">{form.timeTbc ? "Event date *" : "Starts *"}</Label><Input id="draft-date" type={form.timeTbc ? "date" : "datetime-local"} min={form.timeTbc ? toAppDateOnly(new Date().toISOString()) : toAppDateTimeLocal(new Date().toISOString())} value={form.date} onChange={(e) => patch("date", e.target.value)} /><label className="flex items-start gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={form.timeTbc} onChange={(e) => setTimeTbc(e.target.checked)} className="mt-0.5" /><span><strong className="text-foreground">Time to be confirmed</strong><span className="block mt-0.5">Publish the date without presenting a placeholder midnight time.</span></span></label></div></div>
      <div className="grid gap-2"><Label>Attendance *</Label><Select value={form.attendanceMode} onValueChange={(value: EventAttendanceMode) => patch("attendanceMode", value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="onsite">On site</SelectItem><SelectItem value="online">Online</SelectItem><SelectItem value="hybrid">Hybrid</SelectItem></SelectContent></Select><p className="text-xs text-muted-foreground">Event times are stored in Asia/Kolkata (IST). You can add private online access after the draft is created.</p></div>
      {form.attendanceMode !== "online" && <div className="grid gap-2"><Label htmlFor="draft-venue">Venue *</Label><Input id="draft-venue" value={form.venue} onChange={(e) => patch("venue", e.target.value)} placeholder="AI Lab, Decennial Block…" /></div>}
      {submitError && <p role="alert" className="rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive">{submitError}</p>}</div>
    <div className="flex flex-col-reverse gap-3 border-t border-border bg-muted/15 px-6 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8"><Button type="button" variant="ghost" onClick={leaveEditor}>Cancel</Button><Button type="submit" disabled={submitting} className="gap-2">{submitting && <Loader2 className="h-4 w-4 animate-spin" />}Create draft & continue</Button></div>
  </div></form>;
  const bannerUrl = existingRecord?.bannerUrl as string | undefined;
  return <form onSubmit={handleSubmit} className="pb-24"><div className="grid gap-6 xl:grid-cols-[260px_minmax(0,1fr)]">
    <nav className="flex gap-2 overflow-x-auto rounded-xl border border-border bg-card p-2 xl:hidden" aria-label="Event setup sections">{SECTIONS.map((item) => <button key={item.id} type="button" onClick={() => setSection(item.id)} className={`shrink-0 rounded-lg px-3 py-2 text-sm font-medium ${section === item.id ? "bg-foreground text-background" : "text-muted-foreground"}`}>{item.label}</button>)}</nav>
    <aside className="hidden h-fit xl:sticky xl:top-24 xl:block"><div className="overflow-hidden rounded-xl border border-border bg-card"><div className="border-b border-border px-4 py-4"><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Event setup</p><p className="mt-1 truncate text-sm font-semibold">{form.title || "Untitled event"}</p></div>
      <nav className="p-2" aria-label="Event setup sections">{SECTIONS.map((item) => { const Icon = item.icon; const active = section === item.id; return <button key={item.id} type="button" onClick={() => setSection(item.id)} className={`flex w-full items-start gap-3 rounded-lg px-3 py-3 text-left transition-colors ${active ? "bg-foreground text-background" : "text-foreground hover:bg-muted"}`}><Icon className={`mt-0.5 h-4 w-4 shrink-0 ${active ? "text-background" : "text-primary"}`} /><span><span className="block text-sm font-medium">{item.label}</span><span className={`mt-0.5 block text-[11px] ${active ? "text-background/65" : "text-muted-foreground"}`}>{item.description}</span></span></button>; })}</nav></div>
      </aside>
    <main className="min-w-0"><div className="rounded-2xl border border-border bg-card p-6 sm:p-8">
      {publishedSensitiveBlock && <div className="mb-6 flex gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" /><div><p className="font-semibold">This published event has operational changes.</p><p className="mt-1 leading-6 text-muted-foreground">Return it to draft before changing date, venue, registration, attendee questions, fees, payment settings or discounts.</p></div></div>}
      {!publishedSensitiveBlock && sensitiveChanged && hasApproval && <div className="mb-6 flex gap-3 rounded-xl border border-primary/25 bg-primary/5 p-4 text-sm"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><div><p className="font-semibold">These changes affect an approved setup.</p><p className="mt-1 leading-6 text-muted-foreground">Saving will return the changed setup to review before publication.</p></div></div>}
      {section === "details" && <div className="space-y-7"><SectionTitle eyebrow="01 · Event details" title="Describe the event" description="Keep public programme information together: identity, artwork, schedule and location." />
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)]"><div className="space-y-6">
          <div className="grid gap-2"><Label htmlFor="evt-title">Event name *</Label><Input id="evt-title" value={form.title} onChange={(e) => patch("title", e.target.value)} maxLength={200} /></div>
          <div className="grid gap-2"><Label htmlFor="evt-description">Description</Label><Textarea id="evt-description" rows={9} value={form.description} onChange={(e) => patch("description", e.target.value)} placeholder="What is the event about? What should participants expect?" /><p className="text-xs text-muted-foreground">This is the main content on the public event page.</p></div>
          <div className="space-y-3"><div className="grid gap-4 sm:grid-cols-2"><div className="grid gap-2"><Label htmlFor="evt-date">{form.timeTbc ? "Event date *" : "Start *"}</Label><Input id="evt-date" type={form.timeTbc ? "date" : "datetime-local"} value={form.date} onChange={(e) => patch("date", e.target.value)} /></div>{!form.timeTbc && <div className="grid gap-2"><Label htmlFor="evt-end">End</Label><Input id="evt-end" type="datetime-local" min={form.date || undefined} value={form.endDate} onChange={(e) => patch("endDate", e.target.value)} /></div>}</div><label className="flex items-start gap-3 rounded-xl border border-border px-4 py-3"><input type="checkbox" checked={form.timeTbc} onChange={(e) => setTimeTbc(e.target.checked)} className="mt-1" /><span><span className="block text-sm font-medium">Time to be confirmed</span><span className="mt-0.5 block text-xs leading-5 text-muted-foreground">Treat this as a date-only event until organisers publish the exact time. Public pages will never show a placeholder 12:00 am.</span></span></label></div>
          <div className="space-y-3"><Label>Attendance</Label><div className="grid gap-2 sm:grid-cols-3">{(["onsite", "online", "hybrid"] as EventAttendanceMode[]).map((value) => <button key={value} type="button" onClick={() => patch("attendanceMode", value)} className={`rounded-lg border px-3 py-3 text-left text-sm ${form.attendanceMode === value ? "border-primary bg-primary/5 font-semibold" : "border-border"}`}>{value === "onsite" ? "On site" : value === "online" ? "Online" : "Hybrid"}</button>)}</div><p className="text-xs text-muted-foreground">Schedule is stored in Asia/Kolkata (IST). Online access for attendees is kept private below, never in the public event record.</p></div>
          {form.attendanceMode !== "online" && <><div className="grid gap-2"><Label htmlFor="evt-venue">Venue *</Label><div className="relative"><MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input id="evt-venue" className="pl-9" value={form.venue} onChange={(e) => patch("venue", e.target.value)} placeholder="AI Lab / Main Auditorium" /></div></div><div className="grid gap-2"><Label htmlFor="evt-address">Public address</Label><Input id="evt-address" value={form.locationAddress} onChange={(e) => patch("locationAddress", e.target.value)} placeholder="Optional full address for directions and search" maxLength={500} /><p className="text-xs text-muted-foreground">Keep this public. Do not place meeting credentials or attendee-only instructions here.</p></div></>}
          <div className="grid gap-2"><Label>Host society *</Label><Select value={form.society || "__none__"} disabled={!allowSocietyTransfer} onValueChange={(value) => patch("society", value === "__none__" ? "" : value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{(societies?.societies ?? []).map((society) => <SelectItem key={society.id} value={society.id}>{society.name}</SelectItem>)}</SelectContent></Select>{!allowSocietyTransfer && <p className="text-xs text-muted-foreground">The host society is fixed after creation. A platform administrator can transfer it when necessary.</p>}</div>
        </div><div className="space-y-3"><Label>Event banner</Label><ImageUpload label="" currentUrl={bannerUrl} onChange={(file) => { setDirty(true); setBannerFile(file); if (file) setRemoveBanner(false); }} onRemove={() => { setDirty(true); setRemoveBanner(true); }} previewClassName="aspect-[16/7] h-auto w-full object-cover" /><div className="rounded-xl bg-muted/35 p-4 text-xs leading-5 text-muted-foreground"><strong className="text-foreground">Recommended:</strong> 1600 × 700 px or a similar wide 16:7 crop. Keep important text and faces away from the edges.</div></div></div>
      </div>}
      {section === "registration" && <div className="space-y-7"><SectionTitle eyebrow="02 · Registration" title="How will people join?" description="Method and availability are separate. Pausing registration never deletes its setup." />
        <div><Label>Registration method</Label><div className="mt-3 grid gap-3 md:grid-cols-3">
          <button type="button" className={choice(form.registrationMode === "internal")} onClick={() => patch("registrationMode", "internal")}><div><TicketCheck className="h-5 w-5 text-primary" /><p className="mt-3 font-semibold">IEEE website</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Tickets, capacity, payment and QR check-in stay in one system.</p></div>{form.registrationMode === "internal" && <Check className="mt-3 h-4 w-4 text-primary" />}</button>
          <button type="button" className={choice(form.registrationMode === "external")} onClick={() => patch("registrationMode", "external")}><div><ExternalLink className="h-5 w-5 text-primary" /><p className="mt-3 font-semibold">External form</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Send attendees to another registration service.</p></div>{form.registrationMode === "external" && <Check className="mt-3 h-4 w-4 text-primary" />}</button>
          <button type="button" className={choice(form.registrationMode === "closed")} onClick={() => patch("registrationMode", "closed")}><div><CalendarDays className="h-5 w-5 text-primary" /><p className="mt-3 font-semibold">No registration</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Publish an informational event without a registration action.</p></div>{form.registrationMode === "closed" && <Check className="mt-3 h-4 w-4 text-primary" />}</button>
        </div></div>
        {form.registrationMode !== "closed" && <div className="rounded-xl border border-border p-5"><Label>Availability</Label><div className="mt-3 grid gap-2 sm:grid-cols-3">{(["open", "scheduled", "paused"] as Availability[]).map((value) => <button key={value} type="button" onClick={() => { setDirty(true); setAvailabilityChoice(value); setForm((current) => ({ ...current, registrationOpen: value !== "paused", registrationStart: value === "open" ? "" : current.registrationStart })); }} className={`rounded-lg border px-3 py-3 text-left text-sm ${availability === value ? "border-primary bg-primary/5 font-semibold" : "border-border"}`}>{value === "open" ? "Accepting now" : value === "scheduled" ? "Opens later" : "Paused"}</button>)}</div>
          {availability === "scheduled" && <div className="mt-4 grid gap-2"><Label htmlFor="evt-reg-start">Opens at *</Label><Input id="evt-reg-start" type="datetime-local" value={form.registrationStart} onChange={(e) => { setAvailabilityChoice("scheduled"); patch("registrationStart", e.target.value); }} /></div>}
          <div className="mt-4 grid gap-2"><Label htmlFor="evt-reg-deadline">Closes automatically</Label><Input id="evt-reg-deadline" type="datetime-local" value={form.registrationDeadline} onChange={(e) => patch("registrationDeadline", e.target.value)} /><p className="text-xs text-muted-foreground">Optional. Leave empty to keep registration available until the event ends or you pause it.</p></div></div>}
        {form.registrationMode === "external" && <div className="grid gap-2"><Label htmlFor="external-form">External registration URL *</Label><Input id="external-form" type="url" value={form.externalFormUrl} onChange={(e) => patch("externalFormUrl", e.target.value)} placeholder="https://forms.google.com/..." /><p className="text-xs text-muted-foreground">Responses, payments and check-in are managed outside this website.</p></div>}
        {form.registrationMode === "internal" && <div className="space-y-7"><div className="grid gap-5 rounded-xl border border-border p-5 lg:grid-cols-2">
          <div className="grid gap-2"><Label htmlFor="capacity">Capacity</Label><Input id="capacity" type="number" min="1" value={form.maxCapacity} onChange={(e) => patch("maxCapacity", e.target.value)} placeholder="Unlimited" /><p className="text-xs text-muted-foreground">Leave empty for unlimited registrations.</p></div>
          <div className="space-y-3"><Label>Event operations</Label><label className="flex items-center justify-between gap-4 rounded-lg border border-border px-4 py-3"><span><span className="block text-sm font-medium">QR check-in</span><span className="mt-0.5 block text-xs text-muted-foreground">Issue scannable tickets after confirmation.</span></span><input type="checkbox" checked={form.checkInEnabled} onChange={(e) => patch("checkInEnabled", e.target.checked)} /></label>
          <label className="flex items-center justify-between gap-4 rounded-lg border border-border px-4 py-3"><span><span className="block text-sm font-medium">IEEE membership</span><span className="mt-0.5 block text-xs text-muted-foreground">Ask attendee membership status and Membership ID.</span></span><input type="checkbox" checked={form.collectIeeeMember} onChange={(e) => patch("collectIeeeMember", e.target.checked)} /></label></div></div>
          <EventAudienceEditor
            eligibleSemesters={form.eligibleSemesters}
            eligibleProgrammes={form.eligibleProgrammes}
            onSemestersChange={(value) => patch("eligibleSemesters", value)}
            onProgrammesChange={(value) => patch("eligibleProgrammes", value)}
          />
          <div className="space-y-5 rounded-xl border border-border p-5"><div><Label>Attendee changes</Label><p className="mt-1 text-xs leading-5 text-muted-foreground">Keep cancellation and full-capacity handling explicit. Paid cancellations become finance requests; they never move money automatically.</p></div>
            <label className="flex items-center justify-between gap-4 rounded-lg border border-border px-4 py-3"><span><span className="block text-sm font-medium">Allow self-cancellation</span><span className="mt-0.5 block text-xs text-muted-foreground">Free or unpaid registrations can release their seat. Paid registrations create a refund request for finance.</span></span><input type="checkbox" checked={form.allowSelfCancellation} onChange={(e) => patch("allowSelfCancellation", e.target.checked)} /></label>
            {form.allowSelfCancellation && <div className="grid gap-4 md:grid-cols-2"><div className="grid gap-2"><Label htmlFor="self-cancel-until">Self-cancellation until</Label><Input id="self-cancel-until" type="datetime-local" value={form.selfCancellationUntil} onChange={(e) => patch("selfCancellationUntil", e.target.value)} /><p className="text-xs text-muted-foreground">Optional. Falls back to registration close, then event start.</p></div>{feeMode === "paid" && <div className="grid gap-2"><Label htmlFor="refund-request-until">Refund requests until</Label><Input id="refund-request-until" type="datetime-local" value={form.refundRequestUntil} onChange={(e) => patch("refundRequestUntil", e.target.value)} /><p className="text-xs text-muted-foreground">Optional separate deadline for paid attendees.</p></div>}</div>}
            {form.allowSelfCancellation && feeMode === "paid" && <div className="grid gap-2"><Label htmlFor="refund-policy">Refund policy shown to attendees</Label><Textarea id="refund-policy" rows={3} value={form.refundPolicy} onChange={(e) => patch("refundPolicy", e.target.value)} placeholder="Example: Approved refunds are processed after organizer review." maxLength={4000} /></div>}
            <label className="flex items-center justify-between gap-4 rounded-lg border border-border px-4 py-3"><span><span className="block text-sm font-medium">Waitlist when full</span><span className="mt-0.5 block text-xs text-muted-foreground">Offers reserve capacity so a promised seat cannot be taken by another registration.</span></span><input type="checkbox" checked={form.waitlistEnabled} onChange={(e) => patch("waitlistEnabled", e.target.checked)} /></label>
            {form.waitlistEnabled && <div className="grid max-w-sm gap-2"><Label htmlFor="waitlist-offer-minutes">Seat-offer window (minutes)</Label><Input id="waitlist-offer-minutes" type="number" min="15" max="10080" value={form.waitlistOfferMinutes} onChange={(e) => patch("waitlistOfferMinutes", e.target.value)} /><p className="text-xs text-muted-foreground">Default 360 minutes. Expired offers automatically move to the next person.</p></div>}
          </div>
          <div><Label>Standard attendee details</Label><p className="mt-1 text-xs text-muted-foreground">These match the real registration form and reusable attendee memory.</p><div className="mt-3 overflow-hidden rounded-xl border border-border">{STANDARD_FIELDS.map(([name, behavior]) => <div key={name} className="flex items-center justify-between gap-4 border-b border-border px-4 py-3 text-sm last:border-b-0"><span>{name}</span><span className="text-xs text-muted-foreground">{behavior}</span></div>)}{form.collectIeeeMember && <div className="flex items-center justify-between gap-4 border-t border-border px-4 py-3 text-sm"><span>IEEE Membership ID</span><span className="text-xs text-muted-foreground">Shown to members</span></div>}</div></div>
          <div className="border-t border-border pt-7"><div className="mb-4"><Label>Additional event questions</Label><p className="mt-1 text-xs leading-5 text-muted-foreground">Ask only what is specific to this event. Standard details above do not need to be recreated.</p></div><CustomFieldBuilder fields={customFields} onChange={(fields) => { setDirty(true); setCustomFields(fields); }} /></div>
        </div>}
      </div>}
      {section === "fees" && <div className="space-y-7"><SectionTitle eyebrow="03 · Fees & discounts" title="Keep payment setup simple" description="Organizers decide whether an IEEE-site registration is free or paid. Infrastructure stays in Advanced settings." />
        {form.registrationMode !== "internal" ? <div className="rounded-xl border border-dashed border-border px-5 py-10 text-center"><CircleDollarSign className="mx-auto h-6 w-6 text-muted-foreground" /><p className="mt-3 font-semibold">IEEE payment is not used for this registration method.</p><p className="mt-1 text-sm text-muted-foreground">External forms handle their own fees. Informational events have no registration payment.</p></div> : <>
          <div className="grid gap-3 sm:grid-cols-2"><button type="button" className={choice(feeMode === "free")} onClick={() => { setFeeChoice("free"); patch("price", "0"); }}><div><p className="font-semibold">Free event</p><p className="mt-1 text-xs text-muted-foreground">Ticket is confirmed immediately after registration.</p></div>{feeMode === "free" && <Check className="h-4 w-4 text-primary" />}</button><button type="button" className={choice(feeMode === "paid")} onClick={() => { setFeeChoice("paid"); if (Number(form.price) <= 0) patch("price", ""); }}><div><p className="font-semibold">Paid event</p><p className="mt-1 text-xs text-muted-foreground">Registration is held until payment is confirmed.</p></div>{feeMode === "paid" && <Check className="h-4 w-4 text-primary" />}</button></div>
          {feeMode === "paid" && <div className="space-y-5 rounded-xl border border-border p-5"><div className="grid max-w-sm gap-2"><Label htmlFor="price">Registration fee (₹) *</Label><Input id="price" type="number" min="0" step="0.01" value={form.price} onChange={(e) => { setFeeChoice("paid"); patch("price", e.target.value); }} placeholder="150" /></div>
            <details className="rounded-lg border border-border bg-muted/20 p-4"><summary className="cursor-pointer text-sm font-medium">Advanced payment processing</summary><div className="mt-4 grid gap-2"><Label>Payment provider</Label><Select value={form.paymentProvider} onValueChange={(value: "razorpay" | "kotak") => patch("paymentProvider", value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="razorpay">Razorpay</SelectItem><SelectItem value="kotak">Kotak direct UPI</SelectItem></SelectContent></Select><p className="text-xs leading-5 text-muted-foreground">Change this only when finance/operations needs new payment sessions routed differently.</p></div></details>
            <div className="border-t border-border pt-5"><div className="mb-3"><Label>Discount codes</Label><p className="mt-1 text-xs text-muted-foreground">Used coupons cannot be deleted; deactivate them instead.</p></div><CouponManager coupons={coupons} onChange={(next) => { setDirty(true); setCoupons(next); }} /></div>
          </div>}
        </>}
      </div>}
      {section === "communication" && <div className="space-y-7"><SectionTitle eyebrow="04 · Communication" title="Give attendees the right ways to reach you" description="Keep contact information and public links separate from workflow status." />
        <div className="grid gap-6 md:grid-cols-2"><div className="grid gap-2"><Label htmlFor="contact-email">Contact email</Label><Input id="contact-email" type="email" value={form.contactEmail} onChange={(e) => patch("contactEmail", e.target.value)} placeholder="ieee@sahrdaya.ac.in" /></div><div className="grid gap-2"><Label htmlFor="contact-phone">Contact phone</Label><Input id="contact-phone" type="tel" value={form.contactPhone} onChange={(e) => patch("contactPhone", e.target.value)} placeholder="+91 …" /></div>
        <div className="grid gap-2"><Label htmlFor="whatsapp">Attendee WhatsApp group</Label><Input id="whatsapp" type="url" value={form.whatsappLink} onChange={(e) => patch("whatsappLink", e.target.value)} placeholder="https://chat.whatsapp.com/..." /><p className="text-xs text-muted-foreground">Use this for the event-specific participant group, if there is one.</p></div><div className="grid gap-2"><Label htmlFor="external-link">Public supporting link</Label><Input id="external-link" type="url" value={form.externalLink} onChange={(e) => patch("externalLink", e.target.value)} placeholder="https://..." /><p className="text-xs text-muted-foreground">Shown publicly from the event page. Never put a private meeting URL or attendee credentials here.</p></div></div>
        {(form.attendanceMode === "online" || form.attendanceMode === "hybrid") && <div className="rounded-xl border border-primary/20 bg-primary/[0.03] p-5"><div><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">Private attendee access</p><p className="mt-2 text-sm leading-6 text-muted-foreground">Only confirmed attendees can retrieve this through the protected event-access endpoint. It is excluded from public PocketBase event fields, SSR and search metadata.</p></div><div className="mt-5 grid gap-5"><div className="grid gap-2"><Label htmlFor="private-join-url">Meeting / join URL</Label><Input id="private-join-url" type="url" value={privateDetails.virtualJoinUrl} onChange={(e) => { setDirty(true); setPrivateDirty(true); setPrivateDetails((current) => ({ ...current, virtualJoinUrl: e.target.value })); }} placeholder="https://meet.google.com/..." /></div><div className="grid gap-2"><Label htmlFor="private-join-instructions">Joining instructions</Label><Textarea id="private-join-instructions" rows={4} value={privateDetails.joinInstructions} onChange={(e) => { setDirty(true); setPrivateDirty(true); setPrivateDetails((current) => ({ ...current, joinInstructions: e.target.value })); }} placeholder="Optional attendee-only instructions" maxLength={4000} /></div></div></div>}
        <div className="grid gap-2"><Label>Tags</Label><TagsEditor value={form.tags} onChange={(value) => patch("tags", value)} /><p className="text-xs text-muted-foreground">Use a few useful search labels such as workshop, cybersecurity or ieee-day.</p></div>
      </div>}
      {section === "preview" && <div className="space-y-7"><SectionTitle eyebrow="05 · Review" title="See the setup before you submit it" description="This is an organizer preview. Publishing and approval actions stay in the event workspace." />
        <div className="overflow-hidden rounded-2xl border border-border bg-background">{bannerUrl && <img src={bannerUrl} alt="" className="aspect-[16/6] w-full object-cover" />}<div className="p-6 sm:p-8"><div className="flex flex-wrap gap-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"><span>{form.status}</span><span>·</span><span>{form.registrationMode === "internal" ? "IEEE registration" : form.registrationMode === "external" ? "External registration" : "No registration"}</span></div><h3 className="mt-3 text-3xl font-semibold tracking-tight">{form.title || "Untitled event"}</h3><div className="mt-5 grid gap-4 text-sm sm:grid-cols-3"><div><p className="text-xs text-muted-foreground">When</p><p className="mt-1 font-medium">{form.date ? formatEventDateTime((form.timeTbc ? fromAppDateOnly(form.date) : fromAppDateTimeLocal(form.date)) || "", form.timeTbc) : "Not set"}</p></div><div><p className="text-xs text-muted-foreground">Where</p><p className="mt-1 font-medium">{form.attendanceMode === "online" ? "Online" : form.venue || "Not set"}</p><p className="mt-1 text-xs capitalize text-muted-foreground">{form.attendanceMode.replace("onsite", "on site")}</p></div><div><p className="text-xs text-muted-foreground">Entry</p><p className="mt-1 font-medium">{form.registrationMode === "internal" && Number(form.price) > 0 ? `₹${form.price}` : "Free / external"}</p></div></div></div></div>
        {form.registrationMode === "internal" && <div className="rounded-2xl border border-border p-6 sm:p-8"><div className="border-b border-border pb-5"><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">Audience</p><p className="mt-2 text-sm font-semibold">{form.eligibleSemesters.length || form.eligibleProgrammes.length ? "Restricted registration" : "Open to all programmes and semesters"}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{form.eligibleSemesters.length ? `Semesters: ${form.eligibleSemesters.join(", ")}` : "All semesters"} · {form.eligibleProgrammes.length ? `${form.eligibleProgrammes.length} programme${form.eligibleProgrammes.length === 1 ? "" : "s"}` : "All programmes"}</p></div><div className="mt-6 flex items-center justify-between gap-4"><div><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">Attendee form</p><h3 className="mt-2 text-xl font-semibold">What participants will be asked</h3></div><span className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground">{customFields.length} custom</span></div><div className="mt-6 grid gap-5 sm:grid-cols-2">{STANDARD_FIELDS.map(([name]) => <div key={name} className="space-y-2"><div className="text-xs font-semibold">{name}</div><div className="h-10 rounded-lg border border-input bg-muted/20" /></div>)}</div>{customFields.length > 0 && <div className="mt-7 space-y-5 border-t border-border pt-7">{customFields.map((field) => <QuestionPreview key={field.id} field={field} />)}</div>}</div>}
        <div className="grid gap-3 md:grid-cols-3"><div className="rounded-xl border border-border p-4"><p className="text-xs text-muted-foreground">Organisation approval</p><p className="mt-2 font-semibold capitalize">{approvalStatus.replaceAll("_", " ")}</p></div><div className="rounded-xl border border-border p-4"><p className="text-xs text-muted-foreground">Finance approval</p><p className="mt-2 font-semibold capitalize">{Number(form.price) > 0 ? financeApprovalStatus.replaceAll("_", " ") : "Not required"}</p></div><div className="rounded-xl border border-border p-4"><p className="text-xs text-muted-foreground">Next step</p><p className="mt-2 font-semibold">{approvalStatus === "draft" || approvalStatus === "changes_requested" ? "Save, then submit for review" : form.status === "published" ? "Operate the event" : "Continue workflow"}</p></div></div>
        {Boolean(existingRecord?.slug) && <Button type="button" variant="outline" asChild className="gap-2"><Link to={`/events/${String(existingRecord?.slug ?? "")}`} target="_blank">Open public page <ExternalLink className="h-4 w-4" /></Link></Button>}
      </div>}
      {submitError && <p role="alert" className="mt-6 rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive">{submitError}</p>}
    </div></main></div>
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 lg:left-64 backdrop-blur supports-[backdrop-filter]:bg-background/85"><div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-4 py-3 sm:px-6"><div className="min-w-0"><p className="truncate text-sm font-medium">{dirty ? "Unsaved changes" : "All changes saved"}</p><p className="hidden text-xs text-muted-foreground sm:block">Publishing and approval actions stay in the event workspace.</p></div><div className="flex shrink-0 gap-2"><Button type="button" variant="outline" onClick={leaveEditor}>Back to workspace</Button><Button type="submit" disabled={submitting || !dirty || publishedSensitiveBlock} className="gap-2">{submitting && <Loader2 className="h-4 w-4 animate-spin" />}Save changes</Button></div></div></div>
  </form>;
}
