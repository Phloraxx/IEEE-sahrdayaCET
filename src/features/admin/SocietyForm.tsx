"use client";

import { useState, useEffect } from "react";
import type { Resolver } from "react-hook-form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Search, Plus, ImageUp, X, Loader2 } from "lucide-react";
import { Link } from "@tanstack/react-router";
import {
  Card,
  CardContent,
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

// ─── Types ───────────────────────────────────────────────────────────────────

interface User {
  id: string;
  name: string;
  email: string;
}

export interface SocietyFormData {
  name: string;
  slug: string;
  bio: string;
  defaultWhatsappLink: string;
  isHidden: boolean;
}

export interface SocietyFormSubmitData extends SocietyFormData {
  chairs: string[];
  logoFile: File | null;
  bannerFile: File | null;
}

interface SocietyFormProps {
  mode: "create" | "edit";
  initialData?: {
    name: string;
    slug: string;
    bio: string;
    defaultWhatsappLink: string;
    isHidden: boolean;
    chairs: string[];
    logoUrl?: string;
    bannerUrl?: string;
  };
  onSubmit: (data: SocietyFormSubmitData) => Promise<void>;
}

// ─── Schema ──────────────────────────────────────────────────────────────────

const SocietyFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  slug: z.string().min(1, "Slug is required"),
  bio: z.string().optional().default(""),
  defaultWhatsappLink: z.string().optional().default(""),
  isHidden: z.boolean().default(false),
});

type SocietyFormValues = z.output<typeof SocietyFormSchema>;

// Explicit runtime reference needed by zodResolver
void SocietyFormSchema;

// ─── Component ───────────────────────────────────────────────────────────────

export function SocietyForm({ mode, initialData, onSubmit }: SocietyFormProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chairs, setChairs] = useState<string[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);

  const form = useForm<SocietyFormValues>({
    resolver: zodResolver(SocietyFormSchema) as Resolver<SocietyFormValues>,
    defaultValues: {
      name: "",
      slug: "",
      bio: "",
      defaultWhatsappLink: "",
      isHidden: false,
    },
  });

  const isCreate = mode === "create";

  // Fetch users on mount
  useEffect(() => {
    const abortController = new AbortController();
    fetch("/api/admin/users", { signal: abortController.signal })
      .then((r) => r.json())
      .then((data) => {
        if (abortController.signal.aborted) return;
        setUsers(data.users || []);
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
      slug: initialData.slug || "",
      bio: initialData.bio || "",
      defaultWhatsappLink: initialData.defaultWhatsappLink || "",
      isHidden: !!initialData.isHidden,
    });
    setChairs(initialData.chairs || []);
    if (initialData.logoUrl) setLogoPreview(initialData.logoUrl);
    if (initialData.bannerUrl) setBannerPreview(initialData.bannerUrl);
  }, [initialData, form]);

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setLogoPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleBannerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBannerFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setBannerPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const addChair = (userId: string) => {
    if (!chairs.includes(userId)) {
      setChairs((prev) => [...prev, userId]);
    }
    setUserSearch("");
  };

  const removeChair = (userId: string) => {
    setChairs((prev) => prev.filter((id) => id !== userId));
  };

  const filteredUsers = users.filter(
    (u) =>
      !chairs.includes(u.id) &&
      (u.name?.toLowerCase().includes(userSearch.toLowerCase()) ||
        u.email?.toLowerCase().includes(userSearch.toLowerCase())),
  );

  const getChairUser = (id: string) => users.find((u) => u.id === id);

  const onFormSubmit = async (values: Record<string, unknown>) => {
    setError(null);

    try {
      await onSubmit({
        ...(values as unknown as SocietyFormSubmitData),
        chairs,
        logoFile,
        bannerFile,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setSaving(false);
    }
  };

  const submitLabel = isCreate ? "Create Society" : "Save Changes";
  const submittingLabel = isCreate ? "Creating..." : "Saving...";

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onFormSubmit)} className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Basic Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
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
              name="slug"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Slug *</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      required
                      className="font-mono"
                      placeholder="e.g. ieee-cs"
                    />
                  </FormControl>
                  <p className="text-xs text-muted-foreground">
                    URL-friendly identifier (e.g. &quot;ieee-cs&quot;)
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="space-y-2">
              <label className="text-sm font-medium">Logo</label>
              <div className="relative">
                {logoPreview ? (
                  <div className="relative rounded-lg overflow-hidden border border-border w-32 h-32">
                    <img
                      src={logoPreview}
                      alt="Logo"
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setLogoPreview(null);
                        setLogoFile(null);
                      }}
                      className="absolute top-1 right-1 rounded-full bg-white/80 p-0.5 hover:bg-white"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center h-32 w-32 rounded-lg border-2 border-dashed border-border bg-muted/30 cursor-pointer hover:bg-muted/50">
                    <ImageUp className="size-5 text-muted-foreground/60 mb-1" />
                    <span className="text-[10px] text-muted-foreground">
                      Upload logo
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleLogoChange}
                      className="hidden"
                    />
                  </label>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Banner</label>
              <div className="relative">
                {bannerPreview ? (
                  <div className="relative rounded-lg overflow-hidden border border-border">
                    <img
                      src={bannerPreview}
                      alt="Banner"
                      className="w-full h-32 object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setBannerPreview(null);
                        setBannerFile(null);
                      }}
                      className="absolute top-2 right-2 rounded-full bg-white/80 p-1 hover:bg-white"
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
            <FormField
              control={form.control}
              name="bio"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Bio</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      rows={3}
                      className="resize-y"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="defaultWhatsappLink"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Default WhatsApp Link</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="https://chat.whatsapp.com/..."
                    />
                  </FormControl>
                  <p className="text-xs text-muted-foreground">
                    Fallback link for events under this society
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="isHidden"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center gap-2">
                    <FormControl>
                      <input
                        type="checkbox"
                        id="isHidden"
                        checked={field.value}
                        onChange={field.onChange}
                        className="rounded border-input"
                      />
                    </FormControl>
                    <FormLabel htmlFor="isHidden" className="!mt-0 cursor-pointer">
                      Hidden (not shown publicly)
                    </FormLabel>
                  </div>
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Society Chairs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Current Chairs</label>
              {chairs.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No chairs assigned.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {chairs.map((id) => {
                    const u = getChairUser(id);
                    return (
                      <div
                        key={id}
                        className="flex items-center justify-between rounded-lg border border-border/50 px-3 py-2 text-sm"
                      >
                        <div>
                          <span className="font-medium">
                            {u?.name || "Unknown user"}
                          </span>
                          {u?.email && (
                            <span className="text-muted-foreground ml-2 text-xs">
                              {u.email}
                            </span>
                          )}
                          {!isCreate && (
                            <span className="text-muted-foreground ml-2 font-mono text-[10px]">
                              {id}
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => removeChair(id)}
                          className="p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                        >
                          <X className="size-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Add a Chair</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <input
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Search users by name or email..."
                  className="w-full rounded-lg border border-input bg-white pl-9 pr-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring/50"
                />
              </div>
              {userSearch && (
                <div className="max-h-48 overflow-y-auto rounded-lg border border-border/50 bg-card divide-y divide-border/30">
                  {filteredUsers.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-muted-foreground">
                      No matching users.
                    </div>
                  ) : (
                    filteredUsers.slice(0, 10).map((u) => (
                      <button
                        type="button"
                        key={u.id}
                        onClick={() => addChair(u.id)}
                        className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-muted/50 transition-colors text-left"
                      >
                        <div>
                          <span className="font-medium">{u.name}</span>
                          <span className="text-muted-foreground ml-2 text-xs">
                            {u.email}
                          </span>
                        </div>
                        <Plus className="size-3.5 text-muted-foreground shrink-0" />
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

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
                <Loader2 className="size-4 mr-2 animate-spin" /> {submittingLabel}
              </>
            ) : (
              submitLabel
            )}
          </button>
          <Link
            to="/admin/societies"
            className="inline-flex items-center justify-center rounded-lg border border-border px-6 py-2.5 text-sm font-medium hover:bg-muted transition-colors"
          >
            Cancel
          </Link>
        </div>
      </form>
    </Form>
  );
}
