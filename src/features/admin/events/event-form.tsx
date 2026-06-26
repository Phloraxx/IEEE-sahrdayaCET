import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
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
import { FormSection } from "@/features/admin/shared/form-section";
import { ImageUpload } from "@/components/admin/image-upload";
import { CustomFieldBuilder } from "@/components/admin/custom-field-builder";
import type { FormField } from "@/components/admin/custom-field-builder";
import { CouponManager } from "@/components/admin/coupon-manager";
import type { Coupon } from "@/types";

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
  maxCapacity: string;
  status: string;
  society: string;
  registrationOpen: boolean;
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
  maxCapacity: "",
  status: "draft",
  society: "",
  registrationOpen: true,
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

function toLocalInput(dateString: string | undefined): string {
  if (!dateString) return "";
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toIso(value: string): string | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

function csrfToken(): string {
  if (typeof document === "undefined") return "";
  return (
    document.cookie
      .split("; ")
      .find((c) => c.startsWith("csrf="))
      ?.split("=")[1] ?? ""
  );
}

interface EventFormProps {
  mode: "create" | "edit";
  eventId?: string;
}

export function EventForm({ mode, eventId }: EventFormProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isEdit = mode === "edit";
  const [form, setForm] = useState<EventFormState>(EMPTY_STATE);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [customFields, setCustomFields] = useState<FormField[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Societies dropdown
  const { data: societies } = useQuery<{ societies: SocietyOption[] }>({
    queryKey: ["admin-societies-options"],
    queryFn: async () => {
      const res = await fetch("/api/admin/societies?perPage=200", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load societies");
      return res.json();
    },
    staleTime: 60_000,
  });

  // Existing event (edit mode only)
  const { data: existing, isLoading: existingLoading } = useQuery<{
    event: Record<string, unknown>;
  }>({
    queryKey: ["admin-event", eventId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/events/${eventId}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load event");
      return res.json();
    },
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
        date: toLocalInput(e.date as string | undefined),
        endDate: toLocalInput(e.endDate as string | undefined),
        venue: String(e.venue ?? ""),
        price: String(e.price ?? "0"),
        maxCapacity:
          e.maxCapacity != null && Number(e.maxCapacity) > 0
            ? String(e.maxCapacity)
            : "",
        status: String(e.status ?? "draft"),
        society: String(e.society ?? ""),
        registrationOpen: e.registrationOpen !== false,
        checkInEnabled: e.checkInEnabled !== false,
        collectIeeeMember: Boolean(e.collectIeeeMember),
        registrationStart: toLocalInput(
          e.registrationStart as string | undefined,
        ),
        registrationDeadline: toLocalInput(
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
      if (e.coupons && Array.isArray(e.coupons)) {
        setCoupons(e.coupons as Coupon[]);
      }
    }
  }, [existing, isEdit]);

  // Submit handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setSubmitting(true);

    try {
      const payload: Record<string, unknown> = {
        title: form.title.trim(),
        description: form.description,
        venue: form.venue,
        price: Number(form.price) || 0,
        status: form.status,
        society: form.society || undefined,
        registrationOpen: form.registrationOpen,
        checkInEnabled: form.checkInEnabled,
        collectIeeeMember: form.collectIeeeMember,
        date: toIso(form.date),
        endDate: toIso(form.endDate),
        registrationStart: toIso(form.registrationStart),
        registrationDeadline: toIso(form.registrationDeadline),
        contactEmail: form.contactEmail || undefined,
        contactPhone: form.contactPhone || undefined,
        externalLink: form.externalLink || undefined,
        whatsappLink: form.whatsappLink || undefined,
        tags: form.tags || undefined,
        externalFormUrl: !form.registrationOpen
          ? form.externalFormUrl || undefined
          : undefined,
        formTemplate:
          customFields.length > 0 ? customFields : null,
        coupons: coupons.length > 0 ? coupons : null,
      };
      if (form.maxCapacity) {
        payload.maxCapacity = Number(form.maxCapacity);
      }

      // Clean undefined keys
      Object.keys(payload).forEach((k) => {
        if (payload[k] === undefined || payload[k] === "")
          delete payload[k];
      });

      const url = isEdit
        ? `/api/admin/events/${eventId}`
        : "/api/admin/events";

      let res: Response;
      if (bannerFile) {
        const fd = new FormData();
        Object.entries(payload).forEach(([key, val]) => {
          if (val !== undefined && val !== null) {
            fd.append(
              key,
              typeof val === "object" ? JSON.stringify(val) : String(val),
            );
          }
        });
        fd.append("banner", bannerFile);
        res = await fetch(url, {
          method: isEdit ? "PUT" : "POST",
          credentials: "include",
          headers: { "x-csrf-token": csrfToken() },
          body: fd,
        });
      } else {
        res = await fetch(url, {
          method: isEdit ? "PUT" : "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            "x-csrf-token": csrfToken(),
          },
          body: JSON.stringify(payload),
        });
      }

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Request failed (${res.status})`);
      }

      queryClient.invalidateQueries({ queryKey: ["admin-events"] });
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
      navigate({ to: "/admin/events" });
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
    ) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

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
                    onChange={setBannerFile}
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
                    />
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
                  <Label htmlFor="evt-venue">Venue</Label>
                  <Input
                    id="evt-venue"
                    value={form.venue}
                    onChange={update("venue")}
                    placeholder="Main Auditorium"
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
                  onChange={setCustomFields}
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
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.registrationOpen}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        registrationOpen: e.target.checked,
                      }))
                    }
                    className="rounded border-input"
                  />
                  <span className="text-sm font-medium">
                    Enable Registration
                  </span>
                </label>

                {form.registrationOpen ? (
                  <>
                    <div className="grid gap-1.5">
                      <Label htmlFor="evt-price">Price (₹)</Label>
                      <Input
                        id="evt-price"
                        type="number"
                        min="0"
                        value={form.price}
                        onChange={update("price")}
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="evt-capacity">Max Capacity</Label>
                      <Input
                        id="evt-capacity"
                        type="number"
                        min="1"
                        value={form.maxCapacity}
                        onChange={update("maxCapacity")}
                        placeholder="Unlimited"
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="evt-reg-start">
                        Registration Start
                      </Label>
                      <Input
                        id="evt-reg-start"
                        type="datetime-local"
                        value={form.registrationStart}
                        onChange={update("registrationStart")}
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="evt-deadline">
                        Registration Deadline
                      </Label>
                      <Input
                        id="evt-deadline"
                        type="datetime-local"
                        value={form.registrationDeadline}
                        onChange={update("registrationDeadline")}
                      />
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.checkInEnabled}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            checkInEnabled: e.target.checked,
                          }))
                        }
                        className="rounded border-input"
                      />
                      <span className="text-sm font-medium">
                        Enable QR Check-in
                      </span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.collectIeeeMember}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            collectIeeeMember: e.target.checked,
                          }))
                        }
                        className="rounded border-input"
                      />
                      <span className="text-sm font-medium">
                        Collect IEEE Membership ID
                      </span>
                    </label>
                  </>
                ) : (
                  <div className="grid gap-1.5">
                    <Label htmlFor="evt-external-form">
                      External Registration URL
                    </Label>
                    <Input
                      id="evt-external-form"
                      type="url"
                      value={form.externalFormUrl}
                      onChange={update("externalFormUrl")}
                      placeholder="https://docs.google.com/forms/..."
                    />
                    <p className="text-xs text-muted-foreground">
                      Users will be redirected here instead
                    </p>
                  </div>
                )}
              </FormSection>
            </CardContent>
          </Card>

          {/* Society */}
          <Card>
            <CardContent className="p-6">
              <FormSection title="Society">
                <div className="grid gap-1.5">
                  <Label>Host Society</Label>
                  <Select
                    key={form.society || "__none__"}
                    value={form.society || "__none__"}
                    onValueChange={(v) =>
                      setForm((prev) => ({
                        ...prev,
                        society: v === "__none__" ? "" : v,
                      }))
                    }
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
                  <Select
                    key={form.status || "draft"}
                    value={form.status}
                    onValueChange={(v) =>
                      setForm((prev) => ({ ...prev, status: v }))
                    }
                  >
                    <SelectTrigger id="evt-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {EVENT_STATUS.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s.charAt(0).toUpperCase() + s.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </FormSection>
            </CardContent>
          </Card>

          {/* Coupons */}
          {form.registrationOpen && (
            <Card>
              <CardContent className="p-6">
                <FormSection title="Coupons">
                  <CouponManager
                    coupons={coupons}
                    onChange={setCoupons}
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
              onClick={() => navigate({ to: "/admin/events" })}
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
