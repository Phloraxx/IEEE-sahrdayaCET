"use client";

import { useState, useEffect } from "react";
import type { Resolver } from "react-hook-form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Link } from "@tanstack/react-router";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";

// ─── Types ───────────────────────────────────────────────────────────────────

interface SocietyOption {
  id: string;
  name: string;
}

export interface ExecomFormData {
  name: string;
  position: string;
  department: string;
  batch: string;
  section: string;
  sectionId: string;
  order: number;
  linkedin: string;
  instagram: string;
  email: string;
  phone: string;
  society: string;
}

interface ExecomFormProps {
  mode: "create" | "edit";
  initialData?: ExecomFormData;
  onSubmit: (data: ExecomFormData) => Promise<void>;
}

// ─── Schema ──────────────────────────────────────────────────────────────────

const ExecomFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  position: z.string().min(1, "Position is required"),
  department: z.string().optional().default(""),
  batch: z.string().optional().default(""),
  section: z.string().optional().default(""),
  sectionId: z.string().optional().default(""),
  order: z.coerce.number().optional().default(0),
  linkedin: z.string().optional().default(""),
  instagram: z.string().optional().default(""),
  email: z.string().optional().default(""),
  phone: z.string().optional().default(""),
  society: z.string().optional().default(""),
});

type ExecomFormValues = z.output<typeof ExecomFormSchema>;

// ─── Component ───────────────────────────────────────────────────────────────

export function ExecomForm({ mode, initialData, onSubmit }: ExecomFormProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [societies, setSocieties] = useState<SocietyOption[]>([]);

  const form = useForm<ExecomFormValues>({
    resolver: zodResolver(ExecomFormSchema) as Resolver<ExecomFormValues>,
    defaultValues: {
      name: "",
      position: "",
      department: "",
      batch: "",
      section: "",
      sectionId: "",
      order: 0,
      linkedin: "",
      instagram: "",
      email: "",
      phone: "",
      society: "",
    },
  });

  const isCreate = mode === "create";

  // Fetch societies on mount
  useEffect(() => {
    const abortController = new AbortController();
    fetch("/api/admin/societies", { signal: abortController.signal })
      .then((r) => r.json())
      .then((data) => {
        if (abortController.signal.aborted) return;
        setSocieties(
          (data.societies || []).map((s: { id: string; name: string }) => ({
            id: s.id,
            name: s.name,
          })),
        );
      })
      .catch(() => {
        if (abortController.signal.aborted) return;
      });
    return () => abortController.abort();
  }, []);

  // Populate from initialData (edit mode)
  useEffect(() => {
    if (!initialData) return;
    form.reset({
      name: initialData.name || "",
      position: initialData.position || "",
      department: initialData.department || "",
      batch: initialData.batch || "",
      section: initialData.section || "",
      sectionId: initialData.sectionId || "",
      order: initialData.order || 0,
      linkedin: initialData.linkedin || "",
      instagram: initialData.instagram || "",
      email: initialData.email || "",
      phone: initialData.phone || "",
      society: initialData.society || "",
    });
  }, [initialData, form]);

  const onFormSubmit = async (values: Record<string, unknown>) => {
    setError(null);

    try {
      await onSubmit({
        ...(values as unknown as ExecomFormData),
        order: Number(values.order) || 0,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setSaving(false);
    }
  };

  const submitLabel = isCreate ? "Create Member" : "Save Changes";
  const submittingLabel = isCreate ? "Creating..." : "Saving...";

  const inputCls =
    "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring/50";

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-4">
        <Link
          to="/admin/execom"
          className="inline-flex items-center justify-center rounded-lg border border-border p-2 text-muted-foreground hover:bg-muted transition-colors"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {isCreate ? "Add Execom Member" : "Edit Execom Member"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isCreate
              ? "Add a new executive committee member"
              : initialData?.name || "Loading..."}
          </p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onFormSubmit)} className="space-y-4">
          <div className="rounded-xl border bg-card p-6 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name *</FormLabel>
                    <FormControl>
                      <Input {...field} required />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="position"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Position *</FormLabel>
                    <FormControl>
                      <Input {...field} required />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="department"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Department</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="batch"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Batch</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="e.g. 2024-28" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="section"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Section</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="sectionId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Section ID</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Society</label>
                <select
                  value={form.watch("society")}
                  onChange={(e) => form.setValue("society", e.target.value)}
                  className={inputCls}
                >
                  <option value="">— No society —</option>
                  {societies.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <FormField
                control={form.control}
                name="order"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Display Order</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="number"
                        min="0"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>

          <div className="rounded-xl border bg-card p-6 space-y-4">
            <h3 className="text-sm font-medium">Contact & Social</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input {...field} type="email" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="linkedin"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>LinkedIn</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="https://linkedin.com/in/..."
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="instagram"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Instagram</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="https://instagram.com/..."
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>

          {error && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/80 px-6 py-2.5 text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
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
            <Link
              to="/admin/execom"
              className="inline-flex items-center justify-center rounded-lg border border-border px-6 py-2.5 text-sm font-medium hover:bg-muted transition-colors"
            >
              Cancel
            </Link>
          </div>
        </form>
      </Form>
    </div>
  );
}
