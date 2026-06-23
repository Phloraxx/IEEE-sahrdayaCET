"use client";

import { useState, useEffect } from "react";
import type { Resolver } from "react-hook-form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Loader2, X, ImageUp } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CustomFieldBuilder } from "@/components/admin/CustomFieldBuilder";
import { CouponManager } from "@/components/admin/CouponManager";
import type { FormField as CustomFormField } from "@/components/admin/CustomFieldBuilder";
import type { Coupon } from "@/types";

// ─── Helpers ────────────────────────────────────────────────────────────────
export function toDatetimeLocal(dateStr: string): string {
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
  return new Date(`${localStr}:00`).toISOString();
}

// ─── Form Schema ────────────────────────────────────────────────────────────
const EventFormSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional().default(""),
  date: z.string().min(1, "Start date is required"),
  endDate: z.string().optional().default(""),
  venue: z.string().optional().default(""),
  society: z.string().optional().default(""),
  price: z.string().optional().default("0"),
  maxCapacity: z.string().optional().default(""),
  registrationOpen: z.boolean().default(true),
  checkInEnabled: z.boolean().default(true),
  collectIeeeMember: z.boolean().default(false),
  status: z.string().default("draft"),
  registrationStart: z.string().optional().default(""),
  registrationDeadline: z.string().optional().default(""),
  contactEmail: z.string().optional().default(""),
  contactPhone: z.string().optional().default(""),
  whatsappLink: z.string().optional().default(""),
  externalLink: z.string().optional().default(""),
  tags: z.string().optional().default(""),
  externalFormUrl: z.string().optional().default(""),
});

type EventFormValues = z.output<typeof EventFormSchema>;

// ─── Types ───────────────────────────────────────────────────────────────────

export interface EventFormData {
  title: string;
  description: string;
  date: string;
  endDate: string;
  venue: string;
  price: string;
  status: string;
  maxCapacity: string;
  registrationOpen: boolean;
  societyId: string;
  contactEmail: string;
  contactPhone: string;
  registrationDeadline: string;
  // Additional fields used internally
  checkInEnabled: boolean;
  collectIeeeMember: boolean;
  registrationStart: string;
  whatsappLink: string;
  externalLink: string;
  tags: string;
  externalFormUrl: string;
  bannerUrl?: string;
  formTemplate?: CustomFormField[];
  coupons?: Coupon[];
}

export interface FormValues {
  title: string;
  description: string;
  date: string;
  endDate: string;
  venue: string;
  society: string | undefined;
  price: number;
  maxCapacity: number | null;
  registrationOpen: boolean;
  checkInEnabled: boolean;
  collectIeeeMember: boolean;
  status: string;
  registrationStart: string;
  registrationDeadline: string;
  contactEmail: string;
  contactPhone: string;
  whatsappLink: string;
  externalLink: string;
  tags: string;
  externalFormUrl: string | undefined;
  formTemplate: CustomFormField[] | null;
  coupons: Coupon[] | null;
  bannerFile: File | null;
}

interface EventFormProps {
  mode: "create" | "edit";
  initialData?: EventFormData;
  onSubmit: (data: FormValues) => Promise<void>;
  eventId?: string;
}

// ─── Input className helper ─────────────────────────────────────────────────
const inputCls =
  "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring/50";

// ─── Component ──────────────────────────────────────────────────────────────

export function EventForm({ mode, initialData, onSubmit, eventId }: EventFormProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [customFields, setCustomFields] = useState<CustomFormField[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [societies, setSocieties] = useState<{ id: string; name: string }[]>([]);

  const form = useForm<EventFormValues>({
    resolver: zodResolver(EventFormSchema) as Resolver<EventFormValues>,
    defaultValues: {
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
    },
  });

  // Fetch societies on mount
  useEffect(() => {
    const abortController = new AbortController();
    fetch("/api/admin/societies", { signal: abortController.signal })
      .then((res) => res.json())
      .then((data) => {
        if (abortController.signal.aborted) return;
        setSocieties(data.societies || []);
      })
      .catch(() => {
        if (abortController.signal.aborted) return;
      });
    return () => abortController.abort();
  }, []);

  // Populate form from initialData (edit mode)
  useEffect(() => {
    if (!initialData) return;
    form.reset({
      title: initialData.title || "",
      description: initialData.description || "",
      date: initialData.date || "",
      endDate: initialData.endDate || "",
      venue: initialData.venue || "",
      society: initialData.societyId || "",
      price: initialData.price || "0",
      maxCapacity: initialData.maxCapacity || "",
      registrationOpen: initialData.registrationOpen !== false,
      checkInEnabled: initialData.checkInEnabled !== false,
      collectIeeeMember: !!initialData.collectIeeeMember,
      status: initialData.status || "draft",
      registrationStart: initialData.registrationStart || "",
      registrationDeadline: initialData.registrationDeadline || "",
      contactEmail: initialData.contactEmail || "",
      contactPhone: initialData.contactPhone || "",
      whatsappLink: initialData.whatsappLink || "",
      externalLink: initialData.externalLink || "",
      tags: initialData.tags || "",
      externalFormUrl: initialData.externalFormUrl || "",
    });
    if (initialData.bannerUrl) setBannerPreview(initialData.bannerUrl);
    if (initialData.formTemplate) setCustomFields(initialData.formTemplate);
    if (initialData.coupons) setCoupons(initialData.coupons);
  }, [initialData, form]);

  const handleBannerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBannerFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setBannerPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const onFormSubmit = async (values: Record<string, unknown>) => {
    setSaving(true);
    setError(null);

    try {
      const data: FormValues = {
        title: values.title as string,
        description: values.description as string,
        date: fromDatetimeLocal(values.date as string),
        endDate: fromDatetimeLocal(values.endDate as string),
        venue: values.venue as string,
        society: (values.society as string) || undefined,
        price: Number(values.price),
        maxCapacity: values.maxCapacity ? Number(values.maxCapacity) : null,
        registrationOpen: values.registrationOpen as boolean,
        checkInEnabled: values.checkInEnabled as boolean,
        collectIeeeMember: values.collectIeeeMember as boolean,
        status: values.status as string,
        registrationStart: fromDatetimeLocal(values.registrationStart as string),
        registrationDeadline: fromDatetimeLocal(values.registrationDeadline as string),
        contactEmail: values.contactEmail as string,
        contactPhone: values.contactPhone as string,
        whatsappLink: (values.whatsappLink as string) || "",
        externalLink: (values.externalLink as string) || "",
        tags: (values.tags as string) || "",
        externalFormUrl: !values.registrationOpen ? values.externalFormUrl as string : undefined,
        formTemplate: customFields.length > 0 ? customFields : null,
        coupons: coupons.length > 0 ? coupons : null,
        bannerFile,
      };

      await onSubmit(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setSaving(false);
    }
  };

  const isCreate = mode === "create";
  const submitLabel = isCreate ? "Create Event" : "Save Changes";
  const submittingLabel = isCreate ? "Creating..." : "Saving...";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        {isCreate ? (
          <Link
            to="/admin/events"
            className="inline-flex items-center justify-center rounded-lg border border-border p-2 text-muted-foreground hover:bg-muted transition-colors"
          >
            <ArrowLeft className="size-4" />
          </Link>
        ) : (
          <Link
            to="/admin/events/$id"
            params={{ id: eventId! }}
            className="inline-flex items-center justify-center rounded-lg border border-border p-2 text-muted-foreground hover:bg-muted transition-colors"
          >
            <ArrowLeft className="size-4" />
          </Link>
        )}
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {isCreate ? "Create Event" : "Edit Event"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isCreate ? "Add a new IEEE Sahrdaya event." : initialData?.title || ""}
          </p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onFormSubmit)}>
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Main content — 2 columns */}
            <div className="lg:col-span-2 space-y-6">
              {/* ── Basic Information ── */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Basic Information</CardTitle>
                  {isCreate && (
                    <CardDescription>
                      Core event details visible to attendees
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Title *</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            required
                            placeholder="e.g. AI Workshop 2025"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Banner upload */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Banner Image</label>
                    <div className="relative">
                      {bannerPreview ? (
                        <div className="relative rounded-lg overflow-hidden border border-border">
                          <img
                            src={bannerPreview}
                            alt="Banner preview"
                            className="w-full h-48 object-cover"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setBannerPreview(null);
                              setBannerFile(null);
                            }}
                            className="absolute top-2 right-2 rounded-full bg-background/80 p-1 hover:bg-background transition-colors"
                          >
                            <X className="size-4" />
                          </button>
                        </div>
                      ) : (
                        <label className="flex flex-col items-center justify-center h-32 rounded-lg border-2 border-dashed border-border bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors">
                          <ImageUp className="size-6 text-muted-foreground/60 mb-1" />
                          <span className="text-xs text-muted-foreground">
                            Click to upload banner image
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

                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description</FormLabel>
                        <FormControl>
                          <Textarea
                            {...field}
                            rows={5}
                            placeholder="Describe what the event is about..."
                            className="resize-y min-h-[120px]"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="date"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Start Date *</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              type="datetime-local"
                              required
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="endDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>End Date</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              type="datetime-local"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="tags"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tags</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="e.g. workshop, technical, ieee-day"
                          />
                        </FormControl>
                        <p className="text-xs text-muted-foreground">
                          Comma-separated tags for search &amp; filtering
                        </p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="venue"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Venue</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="e.g. Seminar Hall, Block A"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              {/* ── Custom Registration Fields ── */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Custom Registration Fields</CardTitle>
                  <CardDescription>
                    Add custom questions for registrants
                  </CardDescription>
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

            {/* Sidebar — 1 column */}
            <div className="space-y-6">
              {/* ── Registration ── */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Registration</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="registrationOpen"
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex items-center gap-2">
                          <FormControl>
                            <input
                              type="checkbox"
                              checked={field.value}
                              onChange={field.onChange}
                              className="rounded border-input"
                            />
                          </FormControl>
                          <FormLabel className="!mt-0 cursor-pointer">
                            Enable Registration
                          </FormLabel>
                        </div>
                      </FormItem>
                    )}
                  />

                  {form.watch("registrationOpen") ? (
                    <>
                      <FormField
                        control={form.control}
                        name="price"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Price (₹)</FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                type="number"
                                min="0"
                              />
                            </FormControl>
                            <p className="text-xs text-muted-foreground">
                              Set 0 for free events
                            </p>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="maxCapacity"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Max Capacity</FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                type="number"
                                min="1"
                                placeholder="Unlimited"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="registrationStart"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Registration Start</FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                type="datetime-local"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="registrationDeadline"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Registration Deadline</FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                type="datetime-local"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="checkInEnabled"
                        render={({ field }) => (
                          <FormItem>
                            <div className="flex items-center gap-2">
                              <FormControl>
                                <input
                                  type="checkbox"
                                  checked={field.value}
                                  onChange={field.onChange}
                                  className="rounded border-input"
                                />
                              </FormControl>
                              <FormLabel className="!mt-0 cursor-pointer">
                                Enable QR Check-in
                              </FormLabel>
                            </div>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="collectIeeeMember"
                        render={({ field }) => (
                          <FormItem>
                            <div className="flex items-center gap-2">
                              <FormControl>
                                <input
                                  type="checkbox"
                                  checked={field.value}
                                  onChange={field.onChange}
                                  className="rounded border-input"
                                />
                              </FormControl>
                              <FormLabel className="!mt-0 cursor-pointer">
                                Collect IEEE Membership ID
                              </FormLabel>
                            </div>
                          </FormItem>
                        )}
                      />
                    </>
                  ) : (
                    <FormField
                      control={form.control}
                      name="externalFormUrl"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>External Registration URL</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              placeholder="https://docs.google.com/forms/..."
                            />
                          </FormControl>
                          <p className="text-xs text-muted-foreground">
                            Users will be redirected here instead
                          </p>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </CardContent>
              </Card>

              {/* ── Society ── */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Society</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="society"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Host Society</FormLabel>
                        <FormControl>
                          <select
                            value={field.value}
                            onChange={field.onChange}
                            className={inputCls}
                          >
                            <option value="">Select a society...</option>
                            {societies.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name}
                              </option>
                            ))}
                          </select>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              {/* ── Contact & Status ── */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Contact & Status</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="contactEmail"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Contact Email</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="email"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="contactPhone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Contact Phone</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="externalLink"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>External Link</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="https://example.com/event-page"
                          />
                        </FormControl>
                        <p className="text-xs text-muted-foreground">
                          Public event page link (shown on event cards)
                        </p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="whatsappLink"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>WhatsApp Link</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="https://chat.whatsapp.com/..."
                          />
                        </FormControl>
                        <p className="text-xs text-muted-foreground">
                          Shown to registrants on confirmation
                        </p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="status"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Status</FormLabel>
                        <FormControl>
                          <select
                            value={field.value}
                            onChange={field.onChange}
                            className={inputCls}
                          >
                            <option value="draft">Draft</option>
                            <option value="published">Published</option>
                            <option value="completed">Completed</option>
                          </select>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              {/* ── Coupons ── */}
              {form.watch("registrationOpen") && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Coupons</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CouponManager coupons={coupons} onChange={setCoupons} />
                  </CardContent>
                </Card>
              )}

              {/* ── Error ── */}
              {error && (
                <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
                  {error}
                </div>
              )}

              {/* ── Submit / Cancel ── */}
              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/80 px-6 py-2.5 text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? (
                    <>
                      <Loader2 className="size-4 mr-2 animate-spin" />{" "}
                      {submittingLabel}
                    </>
                  ) : (
                    submitLabel
                  )}
                </button>
                {isCreate ? (
                  <Link
                    to="/admin/events"
                    className="inline-flex items-center justify-center rounded-lg border border-border px-6 py-2.5 text-sm font-medium hover:bg-muted transition-colors"
                  >
                    Cancel
                  </Link>
                ) : (
                  <Link
                    to="/admin/events/$id"
                    params={{ id: eventId! }}
                    className="inline-flex items-center justify-center rounded-lg border border-border px-6 py-2.5 text-sm font-medium hover:bg-muted transition-colors"
                  >
                    Cancel
                  </Link>
                )}
              </div>
            </div>
          </div>
        </form>
      </Form>
    </div>
  );
}
