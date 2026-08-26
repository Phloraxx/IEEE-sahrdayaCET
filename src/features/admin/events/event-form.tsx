import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EVENT_STATUS } from "@/lib/constants";
import { getRegistrationMode, type EventRegistrationMode } from "@/lib/event-lifecycle";
import { fromAppDateTimeLocal, toAppDateTimeLocal } from "@/lib/dates";
import { FormSection } from "@/features/admin/shared/form-section";
import { ImageUpload } from "@/components/admin/image-upload";
import { CustomFieldBuilder } from "@/components/admin/custom-field-builder";
import type { FormField } from "@/components/admin/custom-field-builder";
import { CouponManager } from "@/components/admin/coupon-manager";
import type { Coupon } from "@/types";
import { getAdminEvent, listEventCoupons, saveAdminEvent } from "@/lib/data/admin-events.client";
import { listAdminSocieties } from "@/lib/data/admin-societies.client";

interface SocietyOption {
  id: string;
  name: string;
}

interface EventFormState {
  title: string;
  description: string;
  date: string;
  endDate: string;
  venue: string;
  price: string;
  paymentProvider: "razorpay" | "kotak";
  maxCapacity: string;
  status: string;
  society: string;
  registrationMode: EventRegistrationMode;
  checkInEnabled: boolean;
  collectIeeeMember: boolean;
  registrationStart: string;
  registrationDeadline: string;
  contactEmail: string;
  contactPhone: string;
  externalLink: string;
  whatsappLink: string;
  tags: string;
  externalFormUrl: string;
}

const EMPTY_STATE: EventFormState = {
  title: "",
  description: "",
  date: "",
  endDate: "",
  venue: "",
  price: "0",
  paymentProvider: "razorpay",
  maxCapacity: "",
  status: "draft",
  society: "",
  registrationMode: "internal",
  checkInEnabled: true,
  collectIeeeMember: false,
  registrationStart: "",
  registrationDeadline: "",
  contactEmail: "",
  contactPhone: "",
  externalLink: "",
  whatsappLink: "",
  tags: "",
  externalFormUrl: "",
};

interface EventFormProps {
  mode: "create" | "edit";
  eventId?: string;
  initialSocietyId?: string;
  allowDirectStatus?: boolean;
}

export function EventForm({ mode, eventId, initialSocietyId, allowDirectStatus = false }: EventFormProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isEdit = mode === "edit";
  const [form, setForm] = useState<EventFormState>(() => ({
    ...EMPTY_STATE,
    society: initialSocietyId || "",
  }));
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [removeBanner, setRemoveBanner] = useState(false);
  const [customFields, setCustomFields] = useState<FormField[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  // Societies dropdown
  const { data: societies } = useQuery<{ societies: SocietyOption[] }>({
    queryKey: ["admin-societies-options"],
    queryFn: () => listAdminSocieties({ perPage: 200 }),
    staleTime: 60_000,
  });

  // Existing event (edit mode only)
  const { data: existing, isLoading: existingLoading } = useQuery<{
    event: Record<string, unknown>;
  }>({
    queryKey: ["admin-event", eventId],
    queryFn: () => getAdminEvent(eventId!),
    enabled: isEdit && Boolean(eventId),
  });

  // Coupons for this event (edit mode) — loaded from the `coupons` collection,
  // which is the single source of truth (not the event JSON field).
  const { data: existingCoupons } = useQuery<{ coupons: Coupon[] }>({
    queryKey: ["admin-event-coupons", eventId],
    queryFn: () => listEventCoupons(eventId!),
    enabled: isEdit && Boolean(eventId),
  });

  // Populate form from existing event
  useEffect(() => {
    if (!isEdit) return;
    if (existing?.event) {
      const e = existing.event as Record<string, unknown>;
      setForm({
        title: String(e.title ?? ""),
        description: String(e.description ?? ""),
        date: toAppDateTimeLocal(e.date as string | undefined),
        endDate: toAppDateTimeLocal(e.endDate as string | undefined),
        venue: String(e.venue ?? ""),
        price: String(e.price ?? "0"),
        paymentProvider: String(e.paymentProvider ?? "razorpay") === "kotak" ? "kotak" : "razorpay",
        maxCapacity:
          e.maxCapacity != null && Number(e.maxCapacity) > 0
            ? String(e.maxCapacity)
            : "",
        status: String(e.status ?? "draft"),
        society: String(e.society ?? ""),
        registrationMode: getRegistrationMode({
          registrationMode: String(e.registrationMode ?? ""),
          registrationOpen: e.registrationOpen !== false,
          externalFormUrl: String(e.externalFormUrl ?? ""),
        }),
        checkInEnabled: e.checkInEnabled !== false,
        collectIeeeMember: Boolean(e.collectIeeeMember),
        registrationStart: toAppDateTimeLocal(
          e.registrationStart as string | undefined,
        ),
        registrationDeadline: toAppDateTimeLocal(
          e.registrationDeadline as string | undefined,
        ),
        contactEmail: String(e.contactEmail ?? ""),
        contactPhone: String(e.contactPhone ?? ""),
        externalLink: String(e.externalLink ?? ""),
        whatsappLink: String(e.whatsappLink ?? ""),
        tags: String(e.tags ?? ""),
        externalFormUrl: String(e.externalFormUrl ?? ""),
      });
      if (e.formTemplate && Array.isArray(e.formTemplate)) {
        setCustomFields(e.formTemplate as FormField[]);
      }
    }
  }, [existing, isEdit]);

  // Populate coupons from the `coupons` collection (separate query).
  useEffect(() => {
    if (!isEdit) return;
    if (existingCoupons?.coupons) {
      setCoupons(existingCoupons.coupons);
    }
  }, [existingCoupons, isEdit]);
  // Warn before navigating away / closing tab with unsaved changes
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setDateError(null);

    // Validate end date >= start date
    if (form.date && form.endDate) {
      const start = fromAppDateTimeLocal(form.date);
      const end = fromAppDateTimeLocal(form.endDate);
      if (!start || !end || Date.parse(end) <= Date.parse(start)) {
        setDateError("End date must be after the start date");
        setSubmitting(false);
        return;
      }
    }

    if (!form.venue.trim()) {
      setSubmitError("Please enter a venue");
      setSubmitting(false);
      return;
    }

    // Validate society is selected
    if (!form.society) {
      setSubmitError("Please select a host society");
      setSubmitting(false);
      return;
    }

    if (form.registrationMode === "external" && !form.externalFormUrl.trim()) {
      setSubmitError("Please enter the external registration URL");
      setSubmitting(false);
      return;
    }

    setSubmitting(true);

    try {
      const isInternal = form.registrationMode === "internal";
      const payload: Record<string, unknown> = {
        title: form.title.trim(),
        description: form.description,
        venue: form.venue.trim(),
        price: Number(form.price) || 0,
        paymentProvider: form.paymentProvider,
        baseFeePaise: Math.max(0, Math.round((Number(form.price) || 0) * 100)),
        status: form.status,
        society: form.society,
        registrationMode: form.registrationMode,
        registrationOpen: form.registrationMode !== "closed",
        checkInEnabled: isInternal ? form.checkInEnabled : false,
        collectIeeeMember: isInternal ? form.collectIeeeMember : false,
        date: fromAppDateTimeLocal(form.date),
        endDate: fromAppDateTimeLocal(form.endDate) || "",
        registrationStart: fromAppDateTimeLocal(form.registrationStart) || "",
        registrationDeadline: fromAppDateTimeLocal(form.registrationDeadline) || "",
        contactEmail: form.contactEmail.trim(),
        contactPhone: form.contactPhone.trim(),
        externalLink: form.externalLink.trim(),
        whatsappLink: form.whatsappLink.trim(),
        tags: form.tags.trim(),
        externalFormUrl: form.registrationMode === "external" ? form.externalFormUrl.trim() : "",
        formTemplate: isInternal ? customFields : [],
        maxCapacity: isInternal && form.maxCapacity ? Number(form.maxCapacity) : 0,
        coupons,
      };

      await saveAdminEvent({
        id: isEdit ? eventId : undefined,
        payload,
        bannerFile,
        removeBanner,
      });



      setDirty(false);
      queryClient.invalidateQueries({ queryKey: ["admin-events"] });
      queryClient.invalidateQueries({ queryKey: ["admin-event-coupons"] });
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
      navigate("/admin/events" );
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "An error occurred",
      );
    } finally {
      setSubmitting(false);
    }
  };

  // Loading skeleton
  if (isEdit && existingLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-8 w-8 rounded-lg" />
          <div className="space-y-1">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            {Array.from({ length: 2 }).map((_, i) => (
              <div
                key={i}
                className="rounded-lg border border-border bg-card p-6 space-y-3"
              >
                <Skeleton className="h-5 w-36" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-32 w-full" />
              </div>
            ))}
          </div>
          <div className="space-y-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="rounded-lg border border-border bg-card p-6 space-y-3"
              >
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const update = (field: keyof EventFormState) =>
    (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >,
    ) => {
      setDirty(true);
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
    };

  return (
    <form onSubmit={handleSubmit}>
      <div className="grid gap-6 lg:grid-cols-3">
        {/* ─── Main column (2/3) ──────────────────────────── */}
        <div className="lg:col-span-2 space-y-6">
          {/* Basic Information */}
          <Card>
            <CardContent className="p-6">
              <FormSection title="Basic Information">
                <div className="grid gap-1.5">
                  <Label htmlFor="evt-title">Title *</Label>
                  <Input
                    id="evt-title"
                    value={form.title}
                    onChange={update("title")}
                    placeholder="e.g. WIE Workshop on AI Ethics"
                    maxLength={200}
                    required
                  />
                </div>

                <div className="grid gap-1.5">
                  <Label>Banner Image</Label>
                  <ImageUpload
                    label=""
                    currentUrl={
                      isEdit && existing?.event
                        ? (existing.event as Record<string, unknown>)
                            .bannerUrl as string
                        : undefined
                    }
                    onChange={(file) => {
                      setDirty(true);
                      setBannerFile(file);
                      if (file) setRemoveBanner(false);
                    }}
                    onRemove={() => { setDirty(true); setRemoveBanner(true); }}
                  />
                </div>

                <div className="grid gap-1.5">
                  <Label htmlFor="evt-description">Description</Label>
                  <Textarea
                    id="evt-description"
                    rows={5}
                    value={form.description}
                    onChange={update("description")}
                    placeholder="What is this event about?"
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label htmlFor="evt-date">Start Date *</Label>
                    <Input
                      id="evt-date"
                      type="datetime-local"
                      value={form.date}
                      onChange={update("date")}
                      min={isEdit ? undefined : new Date().toISOString().slice(0, 16)}
                      required
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="evt-end-date">End Date</Label>
                    <Input
                      id="evt-end-date"
                      type="datetime-local"
                      value={form.endDate}
                      onChange={update("endDate")}
                      min={form.date || undefined}
                      className={dateError ? "border-destructive" : ""}
                    />
                    {dateError && (
                      <p className="text-xs text-destructive">{dateError}</p>
                    )}
                  </div>
                </div>

                <div className="grid gap-1.5">
                  <Label htmlFor="evt-tags">Tags</Label>
                  <Input
                    id="evt-tags"
                    value={form.tags}
                    onChange={update("tags")}
                    placeholder="e.g. workshop, technical, ieee-day"
                  />
                  <p className="text-xs text-muted-foreground">
                    Comma-separated tags for search &amp; filtering
                  </p>
                </div>

                <div className="grid gap-1.5">
                  <Label htmlFor="evt-venue">Venue *</Label>
                  <Input
                    id="evt-venue"
                    value={form.venue}
                    onChange={update("venue")}
                    placeholder="Main Auditorium"
                    required
                  />
                </div>
              </FormSection>
            </CardContent>
          </Card>

          {/* Custom Registration Fields */}
          <Card>
            <CardContent className="p-6">
              <FormSection title="Custom Registration Fields">
                <CustomFieldBuilder
                  fields={customFields}
                  onChange={(v) => { setDirty(true); setCustomFields(v); }}
                />
                {customFields.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-border/50">
                    <details className="group">
                      <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors select-none">
                        Preview registration form
                      </summary>
                      <div className="mt-3 space-y-3 pointer-events-none opacity-70">
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-muted-foreground">
                            Full Name *
                          </label>
                          <div className="h-9 rounded-lg border border-input bg-muted/30" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-muted-foreground">
                            Email *
                          </label>
                          <div className="h-9 rounded-lg border border-input bg-muted/30" />
                        </div>
                        {customFields.map((field) => (
                          <div key={field.id} className="space-y-1">
                            <label className="text-xs font-medium text-muted-foreground">
                              {field.label}{" "}
                              {field.required && "*"}
                            </label>
                            {field.type === "textarea" ? (
                              <div className="h-16 rounded-lg border border-input bg-muted/30" />
                            ) : field.type === "select" ||
                              field.type === "radio" ? (
                              <div className="h-9 rounded-lg border border-input bg-muted/30 flex items-center px-3 text-xs text-muted-foreground">
                                {field.options[0] || "Select..."}
                              </div>
                            ) : (
                              <div className="h-9 rounded-lg border border-input bg-muted/30" />
                            )}
                          </div>
                        ))}
                        <div className="h-10 rounded-lg bg-muted/50 flex items-center justify-center">
                          <span className="text-xs text-muted-foreground">
                            Submit
                          </span>
                        </div>
                      </div>
                    </details>
                  </div>
                )}
              </FormSection>
            </CardContent>
          </Card>
        </div>

        {/* ─── Sidebar column (1/3) ────────────────────────── */}
        <div className="space-y-6">
          {/* Registration */}
          <Card>
            <CardContent className="p-6">
              <FormSection title="Registration">
                <div className="grid gap-1.5">
                  <Label htmlFor="evt-registration-mode">Registration mode</Label>
                  <Select
                    value={form.registrationMode}
                    onValueChange={(value: EventRegistrationMode) => {
                      setDirty(true);
                      setForm((prev) => ({ ...prev, registrationMode: value }));
                    }}
                  >
                    <SelectTrigger id="evt-registration-mode"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="internal">IEEE website</SelectItem>
                      <SelectItem value="external">External form</SelectItem>
                      <SelectItem value="closed">Closed</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs leading-5 text-muted-foreground">
                    Internal registrations use IEEE capacity, coupons, payments, tickets and check-in. External mode only sends visitors to the URL below.
                  </p>
                </div>

                {form.registrationMode === "external" && (
                  <div className="grid gap-1.5">
                    <Label htmlFor="evt-external-form">External Registration URL *</Label>
                    <Input id="evt-external-form" type="url" value={form.externalFormUrl} onChange={update("externalFormUrl")} placeholder="https://docs.google.com/forms/..." required />
                    <p className="text-xs text-muted-foreground">IEEE will not automatically track responses, payment, capacity or check-in for this form.</p>
                  </div>
                )}

                {form.registrationMode === "internal" && (
                  <>
                    <div className="grid gap-1.5">
                      <Label htmlFor="evt-price">Price (₹)</Label>
                      <Input id="evt-price" type="number" min="0" step="0.01" value={form.price} onChange={update("price")} />
                    </div>
                    {Number(form.price) > 0 && (
                      <div className="grid gap-1.5">
                        <Label htmlFor="evt-payment-provider">Payment provider</Label>
                        <Select
                          value={form.paymentProvider}
                          onValueChange={(value: "razorpay" | "kotak") => {
                            setDirty(true);
                            setForm((prev) => ({ ...prev, paymentProvider: value }));
                          }}
                        >
                          <SelectTrigger id="evt-payment-provider"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="razorpay">Razorpay · default</SelectItem>
                            <SelectItem value="kotak">Kotak direct UPI · temporary</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-xs leading-5 text-muted-foreground">
                          Kotak uses PayGate bank-SMS verification while Razorpay UPI Intent is pending. It requires a whole-rupee final amount and can be switched back later without changing existing payment sessions.
                        </p>
                      </div>
                    )}
                    <div className="grid gap-1.5">
                      <Label htmlFor="evt-capacity">Max Capacity</Label>
                      <Input id="evt-capacity" type="number" min="1" value={form.maxCapacity} onChange={update("maxCapacity")} placeholder="Unlimited" />
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={form.checkInEnabled} onChange={(e) => { setDirty(true); setForm((prev) => ({ ...prev, checkInEnabled: e.target.checked })); }} className="rounded border-input" />
                      <span className="text-sm font-medium">Enable QR Check-in</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={form.collectIeeeMember} onChange={(e) => { setDirty(true); setForm((prev) => ({ ...prev, collectIeeeMember: e.target.checked })); }} className="rounded border-input" />
                      <span className="text-sm font-medium">Collect IEEE Membership ID</span>
                    </label>
                  </>
                )}

                {form.registrationMode !== "closed" && (
                  <>
                    <div className="grid gap-1.5">
                      <Label htmlFor="evt-reg-start">Registration Start</Label>
                      <Input id="evt-reg-start" type="datetime-local" value={form.registrationStart} onChange={update("registrationStart")} />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="evt-deadline">Registration Deadline</Label>
                      <Input id="evt-deadline" type="datetime-local" value={form.registrationDeadline} onChange={update("registrationDeadline")} />
                    </div>
                  </>
                )}
              </FormSection>
            </CardContent>
          </Card>

          {/* Society */}
          <Card>
            <CardContent className="p-6">
              <FormSection title="Society">
                <div className="grid gap-1.5">
                  <Label>Host Society *</Label>
                  <Select
                    key={form.society || "__none__"}
                    value={form.society || "__none__"}
                    onValueChange={(v) => {
                      setDirty(true);
                      setForm((prev) => ({
                        ...prev,
                        society: v === "__none__" ? "" : v,
                      }));
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a society..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">
                        Select a society...
                      </SelectItem>
                      {(societies?.societies ?? []).map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </FormSection>
            </CardContent>
          </Card>

          {/* Contact & Status */}
          <Card>
            <CardContent className="p-6">
              <FormSection title="Contact & Status">
                <div className="grid gap-1.5">
                  <Label htmlFor="evt-contact-email">
                    Contact Email
                  </Label>
                  <Input
                    id="evt-contact-email"
                    type="email"
                    value={form.contactEmail}
                    onChange={update("contactEmail")}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="evt-contact-phone">
                    Contact Phone
                  </Label>
                  <Input
                    id="evt-contact-phone"
                    type="tel"
                    value={form.contactPhone}
                    onChange={update("contactPhone")}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="evt-external">External Link</Label>
                  <Input
                    id="evt-external"
                    type="url"
                    value={form.externalLink}
                    onChange={update("externalLink")}
                    placeholder="https://example.com/event-page"
                  />
                  <p className="text-xs text-muted-foreground">
                    Public event page link (shown on event cards)
                  </p>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="evt-whatsapp">WhatsApp Link</Label>
                  <Input
                    id="evt-whatsapp"
                    type="url"
                    value={form.whatsappLink}
                    onChange={update("whatsappLink")}
                    placeholder="https://chat.whatsapp.com/..."
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="evt-status">Status</Label>
                  {allowDirectStatus ? (
                    <Select
                      key={form.status || "draft"}
                      value={form.status}
                      onValueChange={(v) => {
                        setDirty(true);
                        setForm((prev) => ({ ...prev, status: v }));
                      }}
                    >
                      <SelectTrigger id="evt-status"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {EVENT_STATUS.filter((status) => status !== "cancelled" || form.status === "cancelled").map((status) => (
                          <SelectItem key={status} value={status}>{status.charAt(0).toUpperCase() + status.slice(1)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <div id="evt-status" className="rounded-md border border-input bg-muted/30 px-3 py-2 text-sm">
                      {form.status.charAt(0).toUpperCase() + form.status.slice(1)}
                    </div>
                  )}
                  <p className="text-xs leading-5 text-muted-foreground">
                    {allowDirectStatus ? "Platform administrators retain an emergency status override." : "Publishing is controlled from the event approval workflow after you save these details."}
                  </p>
                </div>
              </FormSection>
            </CardContent>
          </Card>

          {/* Coupons */}
          {form.registrationMode === "internal" && (
            <Card>
              <CardContent className="p-6">
                <FormSection title="Coupons">
                  <CouponManager
                    coupons={coupons}
                    onChange={(v) => { setDirty(true); setCoupons(v); }}
                  />
                </FormSection>
              </CardContent>
            </Card>
          )}

          {/* Error */}
          {submitError && (
            <p
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            >
              {submitError}
            </p>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3">
            <Button
              type="submit"
              disabled={submitting}
              className="flex-1"
            >
              {submitting && (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              )}
              {isEdit ? "Save Changes" : "Create Event"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (
                  dirty &&
                  !window.confirm(
                    "You have unsaved changes. Discard them?",
                  )
                )
                  return;
                navigate("/admin/events" );
              }}
              disabled={submitting}
            >
              Cancel
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}
