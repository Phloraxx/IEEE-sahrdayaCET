"use client";

import { useState, useEffect } from "react";
import { useNavigate, Link } from "@tanstack/react-router";
import { ArrowLeft, Loader2, X, ImageUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { CustomFieldBuilder } from "@/components/admin/CustomFieldBuilder";
import { CouponManager } from "@/components/admin/CouponManager";
import type { FormField } from "@/components/admin/CustomFieldBuilder";
import type { Coupon } from "@/types";

interface PageProps {
  params: Promise<{ id: string }>;
}

function toDatetimeLocal(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function fromDatetimeLocal(localStr: string): string {
  if (!localStr) return localStr;
  return new Date(localStr + ":00").toISOString();
}

export default function EditEventPage({ params }: PageProps) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [eventId, setEventId] = useState<string>("");
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [customFields, setCustomFields] = useState<FormField[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [societies, setSocieties] = useState<{ id: string; name: string }[]>(
    [],
  );

  useEffect(() => {
    fetch("/api/admin/societies")
      .then((res) => res.json())
      .then((data) => setSocieties(data.societies || []))
      .catch(() => {});
  }, []);

  const [form, setForm] = useState({
    title: "",
    description: "",
    date: "",
    endDate: "",
    venue: "",
    society: "",
    price: "0",
    maxCapacity: "",
    registrationOpen: true,
    checkInEnabled: true,
    collectIeeeMember: false,
    status: "draft",
    registrationStart: "",
    registrationDeadline: "",
    contactEmail: "",
    contactPhone: "",
    whatsappLink: "",
    externalLink: "",
    tags: "",
    externalFormUrl: "",
  });

  useEffect(() => {
    params.then(({ id }) => {
      setEventId(id);
      fetch(`/api/admin/events/${id}`)
        .then((r) => r.json())
        .then((data) => {
          const e = data.event;
          setForm({
            title: e.title || "",
            description: e.description || "",
            date: e.date ? toDatetimeLocal(e.date) : "",
            endDate: e.endDate ? toDatetimeLocal(e.endDate) : "",
            venue: e.venue || "",
            society: e.society || "",
            price: String(e.price || 0),
            maxCapacity: e.maxCapacity ? String(e.maxCapacity) : "",
            registrationOpen: !!e.registrationOpen,
            checkInEnabled: e.checkInEnabled !== false, // default true
            collectIeeeMember: !!e.collectIeeeMember,
            status: e.status || "draft",
            registrationStart: e.registrationStart
              ? toDatetimeLocal(e.registrationStart)
              : "",
            registrationDeadline: e.registrationDeadline
              ? toDatetimeLocal(e.registrationDeadline)
              : "",
            contactEmail: e.contactEmail || "",
            contactPhone: e.contactPhone || "",
            whatsappLink: e.whatsappLink || "",
            externalLink: e.externalLink || "",
            tags: e.tags || "",
            externalFormUrl: e.externalFormUrl || "",
          });
          if (e.bannerUrl) setBannerPreview(e.bannerUrl);
          if (e.formTemplate && Array.isArray(e.formTemplate))
            setCustomFields(e.formTemplate);
          if (e.coupons && Array.isArray(e.coupons)) setCoupons(e.coupons);
          setLoading(false);
        })
        .catch(() => {
          setError("Failed to load event");
          setLoading(false);
        });
    });
  }, [params]);

  const handleBannerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBannerFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setBannerPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const body: Record<string, unknown> = {
        title: form.title,
        description: form.description,
        date: fromDatetimeLocal(form.date),
        endDate: fromDatetimeLocal(form.endDate),
        venue: form.venue,
        society: form.society || undefined,
        price: Number(form.price),
        maxCapacity: form.maxCapacity ? Number(form.maxCapacity) : null,
        registrationOpen: form.registrationOpen,
        checkInEnabled: form.checkInEnabled,
        collectIeeeMember: form.collectIeeeMember,
        status: form.status,
        registrationStart: fromDatetimeLocal(form.registrationStart),
        registrationDeadline: fromDatetimeLocal(form.registrationDeadline),
        contactEmail: form.contactEmail,
        contactPhone: form.contactPhone,
        whatsappLink: form.whatsappLink || "",
        externalLink: form.externalLink || "",
        tags: form.tags || "",
        externalFormUrl: !form.registrationOpen
          ? form.externalFormUrl
          : undefined,
        formTemplate: customFields.length > 0 ? customFields : null,
        coupons: coupons.length > 0 ? coupons : null,
      };

      if (bannerFile) {
        const arrayBuffer = await bannerFile.arrayBuffer();
        const blob = new Blob([arrayBuffer], { type: bannerFile.type });
        const fd = new FormData();
        fd.append("banner", blob, bannerFile.name);
        Object.entries(body).forEach(([key, val]) => {
          if (val !== undefined && val !== null) {
            fd.append(
              key,
              typeof val === "object" ? JSON.stringify(val) : String(val),
            );
          }
        });
        const res = await fetch(`/api/admin/events/${eventId}`, {
          method: "PUT",
          body: fd,
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(
            data.error || data.details?.message || "Failed to update event",
          );
        }
      } else {
        const res = await fetch(`/api/admin/events/${eventId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(
            data.error || data.details?.message || "Failed to update event",
          );
        }
      }

      toast.success("Event updated");
      navigate({ to: "/admin/events/$id", params: { id: eventId } });
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setSaving(false);
    }
  };

  const update =
    (field: string) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((prev) => ({ ...prev, [field]: e.target.value }));

  if (loading) {
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
              <div key={i} className="rounded-xl border bg-card p-6 space-y-3">
                <Skeleton className="h-5 w-36" />
                <Skeleton className="h-4 w-56" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-32 w-full" />
              </div>
            ))}
          </div>
          <div className="space-y-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-xl border bg-card p-6 space-y-3">
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

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link
          to="/admin/events/$id" params={{ id: eventId }}
          className="inline-flex items-center justify-center rounded-lg border border-border p-2 text-muted-foreground hover:bg-muted transition-colors"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Edit Event</h1>
          <p className="text-sm text-muted-foreground mt-1">{form.title}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Main — 2 cols */}
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Basic Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Title *</label>
                  <input
                    required
                    value={form.title}
                    onChange={update("title")}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring/50"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Banner Image</label>
                  <div className="relative">
                    {bannerPreview ? (
                      <div className="relative rounded-lg overflow-hidden border border-border">
                        <img
                          src={bannerPreview}
                          alt="Banner"
                          className="w-full h-48 object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setBannerPreview(null);
                            setBannerFile(null);
                          }}
                          className="absolute top-2 right-2 rounded-full bg-background/80 p-1 hover:bg-background"
                        >
                          <X className="size-4" />
                        </button>
                      </div>
                    ) : (
                      <label className="flex flex-col items-center justify-center h-32 rounded-lg border-2 border-dashed border-border bg-muted/30 cursor-pointer hover:bg-muted/50">
                        <ImageUp className="size-6 text-muted-foreground/60 mb-1" />
                        <span className="text-xs text-muted-foreground">
                          Click to upload banner
                        </span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleBannerChange}
                          className="hidden"
                        />
                      </label>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Description</label>
                  <textarea
                    value={form.description}
                    onChange={update("description")}
                    rows={5}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring/50 resize-y min-h-[120px]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Start Date *</label>
                    <input
                      type="datetime-local"
                      required
                      value={form.date}
                      onChange={update("date")}
                      className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring/50"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">End Date</label>
                    <input
                      type="datetime-local"
                      value={form.endDate}
                      onChange={update("endDate")}
                      className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring/50"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Tags</label>
                  <input
                    value={form.tags}
                    onChange={update("tags")}
                    placeholder="e.g. workshop, technical, ieee-day"
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring/50"
                  />
                  <p className="text-xs text-muted-foreground">
                    Comma-separated tags for search &amp; filtering
                  </p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Venue</label>
                  <input
                    value={form.venue}
                    onChange={update("venue")}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring/50"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Custom Registration Fields */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Custom Registration Fields
                </CardTitle>
              </CardHeader>
              <CardContent>
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
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-muted-foreground">
                            Phone
                          </label>
                          <div className="h-9 rounded-lg border border-input bg-muted/30" />
                        </div>
                        {customFields.map((field) => (
                          <div key={field.id} className="space-y-1">
                            <label className="text-xs font-medium text-muted-foreground">
                              {field.label} {field.required && "*"}
                            </label>
                            {field.type === "textarea" ? (
                              <div className="h-16 rounded-lg border border-input bg-muted/30" />
                            ) : field.type === "select" ||
                              field.type === "radio" ? (
                              <div className="h-9 rounded-lg border border-input bg-muted/30 flex items-center px-3 text-xs text-muted-foreground">
                                {field.options[0] || "Select..."}
                              </div>
                            ) : field.type === "checkbox" ||
                              field.type === "boolean" ? (
                              <div className="flex items-center gap-2">
                                <div className="size-4 rounded border border-input bg-muted/30" />
                                <span className="text-xs text-muted-foreground">
                                  {field.defaultValue || field.label}
                                </span>
                              </div>
                            ) : (
                              <div className="h-9 rounded-lg border border-input bg-muted/30" />
                            )}
                          </div>
                        ))}
                        <div className="h-10 rounded-xl bg-muted/50 flex items-center justify-center">
                          <span className="text-xs text-muted-foreground">
                            Submit
                          </span>
                        </div>
                      </div>
                    </details>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Sidebar — 1 col */}
          <div className="space-y-6">
            {/* Registration */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Registration</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
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
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Price (₹)</label>
                      <input
                        type="number"
                        min="0"
                        value={form.price}
                        onChange={update("price")}
                        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">
                        Max Capacity
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={form.maxCapacity}
                        onChange={update("maxCapacity")}
                        placeholder="Unlimited"
                        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">
                        Registration Start
                      </label>
                      <input
                        type="datetime-local"
                        value={form.registrationStart}
                        onChange={update("registrationStart")}
                        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">
                        Registration Deadline
                      </label>
                      <input
                        type="datetime-local"
                        value={form.registrationDeadline}
                        onChange={update("registrationDeadline")}
                        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none"
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
                  <div className="space-y-2">
                    <label className="text-sm font-medium">
                      External Registration URL
                    </label>
                    <input
                      value={form.externalFormUrl}
                      onChange={update("externalFormUrl")}
                      placeholder="https://docs.google.com/forms/..."
                      className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none"
                    />
                    <p className="text-xs text-muted-foreground">
                      Users will be redirected here instead
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Society */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Society</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Host Society</label>
                  <select
                    value={form.society}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, society: e.target.value }))
                    }
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none"
                  >
                    <option value="">Select a society...</option>
                    {societies.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </CardContent>
            </Card>

            {/* Contact & Status */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Contact & Status</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Contact Email</label>
                  <input
                    type="email"
                    value={form.contactEmail}
                    onChange={update("contactEmail")}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Contact Phone</label>
                  <input
                    value={form.contactPhone}
                    onChange={update("contactPhone")}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">External Link</label>
                  <input
                    value={form.externalLink}
                    onChange={update("externalLink")}
                    placeholder="https://example.com/event-page"
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none"
                  />
                  <p className="text-xs text-muted-foreground">
                    Public event page link (shown on event cards)
                  </p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">WhatsApp Link</label>
                  <input
                    value={form.whatsappLink}
                    onChange={update("whatsappLink")}
                    placeholder="https://chat.whatsapp.com/..."
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Status</label>
                  <select
                    value={form.status}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, status: e.target.value }))
                    }
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none"
                  >
                    <option value="draft">Draft</option>
                    <option value="published">Published</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>
              </CardContent>
            </Card>

            {/* Coupons */}
            {form.registrationOpen && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Coupons</CardTitle>
                </CardHeader>
                <CardContent>
                  <CouponManager coupons={coupons} onChange={setCoupons} />
                </CardContent>
              </Card>
            )}

            {error && (
              <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={saving}
                className="flex-1 inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/80 px-6 py-2.5 text-sm font-medium disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <Loader2 className="size-4 mr-2 animate-spin" /> Saving...
                  </>
                ) : (
                  "Save Changes"
                )}
              </button>
              <Link
                to="/admin/events/$id" params={{ id: eventId }}
                className="inline-flex items-center justify-center rounded-lg border border-border px-6 py-2.5 text-sm font-medium hover:bg-muted"
              >
                Cancel
              </Link>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
