"use client";

import { useState, useEffect, useMemo } from "react";
import { useNavigate, Link } from "@tanstack/react-router";
import { X, Plus, Search, Loader2, ArrowLeft } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
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

const societySchema = z.object({
  name: z.string().min(1, "Society name is required"),
  slug: z.string().optional(),
  bio: z.string().optional(),
});

type SocietyFormValues = z.infer<typeof societySchema>;

interface Props {
  societyId: string;
  initial: {
    name: string;
    slug: string;
    bio: string;
    isHidden: boolean;
    chairs: { id: string; name: string; email: string }[];
  };
}

export function SocietyEditForm({ societyId, initial }: Props) {
  const navigate = useNavigate();
  const [isHidden, setIsHidden] = useState(initial.isHidden);
  const [chairs, setChairs] = useState<
    { id: string; name: string; email: string }[]
  >(initial.chairs);
  const [userSearch, setUserSearch] = useState("");
  const [allUsers, setAllUsers] = useState<
    { id: string; name: string; email: string }[]
  >([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const form = useForm<SocietyFormValues>({
    resolver: zodResolver(societySchema),
    defaultValues: {
      name: initial.name,
      slug: initial.slug,
      bio: initial.bio,
    },
  });

  useEffect(() => {
    fetch("/api/admin/users")
      .then((r) => {
        if (!r.ok) {
          console.warn("Users API unavailable — chair search disabled");
          return { users: [] };
        }
        return r.json();
      })
      .then((data) => setAllUsers(data.users || []))
      .catch(() => {});
  }, []);

  const filteredUsers = useMemo(() => {
    if (!userSearch.trim()) return [];
    const q = userSearch.toLowerCase();
    const chairIds = new Set(chairs.map((c) => c.id));
    return allUsers.filter(
      (u) =>
        !chairIds.has(u.id) &&
        (u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)),
    );
  }, [allUsers, chairs, userSearch]);

  const addChair = (u: { id: string; name: string; email: string }) => {
    setChairs((prev) => [...prev, u]);
    setUserSearch("");
  };

  const removeChair = (id: string) => {
    setChairs((prev) => prev.filter((c) => c.id !== id));
  };

  const onSubmit = async (data: SocietyFormValues) => {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/societies/${societyId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          isHidden,
          chairs: chairs.map((c) => c.id),
        }),
      });
      if (!res.ok) throw new Error("Failed to save");
      navigate({ to: `/admin/societies/${societyId}` });
    } catch {
      setError("Failed to save society");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Link to={`/admin/societies/${societyId}`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="size-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-serif tracking-tight leading-tight mb-0">
            Edit Society
          </h1>
          <p className="text-xs text-muted-foreground">{initial.name}</p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-8">
            <div className="space-y-6">
              <div className="rounded-xl border bg-card p-7">
                <div className="font-serif text-sm mb-6 pb-3 border-b">
                  Basic Information
                </div>
                <div className="mb-6">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          Society Name{" "}
                          <span className="text-destructive">*</span>
                        </FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="mb-6">
                  <FormField
                    control={form.control}
                    name="slug"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Slug</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="mb-6">
                  <FormField
                    control={form.control}
                    name="bio"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Bio / Description</FormLabel>
                        <FormControl>
                          <Textarea {...field} rows={4} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="mb-6">
                  <label className="text-[0.7rem] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">
                    Society Logo
                  </label>
                  <div className="border-2 border-dashed border-[#e8e4dc] bg-[#f0ede7] rounded-lg p-10 text-center">
                    <div className="flex items-center justify-center text-2xl font-bold size-[72px] mx-auto mb-4 bg-[#f5e6e3] rounded-lg text-[#c14a3a]">
                      {initial.name[0]}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Click to upload logo
                    </p>
                    <p className="text-[0.65rem] text-muted-foreground/70 mt-1">
                      Recommended: 400×400
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border bg-card p-7">
                <div className="font-serif text-sm mb-6 pb-3 border-b">
                  Customization
                </div>
                <div className="mb-6">
                  <label className="text-[0.7rem] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">
                    Banner Image
                  </label>
                  <div className="border-2 border-dashed border-[#e8e4dc] bg-[#f0ede7] rounded-lg p-8 text-center">
                    <p className="text-xs text-muted-foreground">
                      Click to upload banner
                    </p>
                    <p className="text-[0.65rem] text-muted-foreground/70 mt-1">
                      Recommended: 1200×400
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="rounded-xl border bg-card p-7">
                <div className="font-serif text-sm mb-6 pb-3 border-b">
                  Chairs & Contact
                </div>
                <div className="mb-6">
                  <label className="text-[0.7rem] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">
                    Society Chairs
                  </label>
                  <div className="space-y-2">
                    {chairs.map((c) => (
                      <div
                        key={c.id}
                        className="flex items-center justify-between gap-2 px-3 py-2 text-[0.8rem] border border-[#ddd8d0] rounded-md"
                      >
                        <div>
                          <span className="font-medium">{c.name}</span>
                          <span className="text-xs text-muted-foreground ml-2">
                            {c.email}
                          </span>
                        </div>
                        <Button
                          variant="ghost"
                          size="xs"
                          className="hover:text-destructive"
                          type="button"
                          onClick={() => removeChair(c.id)}
                        >
                          <X className="size-3" />
                        </Button>
                      </div>
                    ))}
                    {chairs.length === 0 && (
                      <p className="text-xs text-muted-foreground">
                        No chairs assigned.
                      </p>
                    )}
                  </div>
                </div>

                <div className="mb-6">
                  <label className="text-[0.7rem] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">
                    Add a Chair
                  </label>
                  <div className="flex items-center gap-1.5 px-3 py-1.5 border border-input rounded-lg bg-white">
                    <Search className="size-3.5 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder="Search users..."
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                    />
                  </div>
                  {userSearch && (
                    <div className="mt-2 max-h-[200px] overflow-y-auto border border-[#ddd8d0] rounded-md">
                      {filteredUsers.length === 0 ? (
                        <div className="text-xs text-muted-foreground p-2">
                          No matching users.
                        </div>
                      ) : (
                        filteredUsers.slice(0, 10).map((u) => (
                          <button
                            type="button"
                            key={u.id}
                            onClick={() => addChair(u)}
                            className="w-full flex justify-between px-3 py-2 text-[0.8rem] text-left border-b border-[#e8e4dc] hover:bg-[#faf8f5] transition-colors"
                          >
                            <div>
                              <span className="font-medium">{u.name}</span>
                              <span className="text-xs text-muted-foreground ml-2">
                                {u.email}
                              </span>
                            </div>
                            <Plus className="size-3.5 text-muted-foreground" />
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-xl border bg-card p-7">
                <div className="font-serif text-sm mb-6 pb-3 border-b">
                  Visibility & Metadata
                </div>
                <div className="mb-6">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!isHidden}
                      onChange={(e) => setIsHidden(!e.target.checked)}
                    />
                    <span className="text-xs">Visible on public site</span>
                  </label>
                </div>
                <div className="mb-6">
                  <div className="flex gap-2 p-3 bg-[#f0ede7] rounded-md">
                    <div className="text-xs text-muted-foreground">
                      Chairs: <strong>{chairs.length}</strong>
                    </div>
                  </div>
                </div>
              </div>

              {error && (
                <div className="text-xs py-2 text-[#b33a2a]">{error}</div>
              )}

              <div className="flex gap-4">
                <Button
                  variant="default"
                  className="flex-1 justify-center"
                  disabled={saving}
                >
                  {saving ? "Saving..." : "Save Changes"}
                </Button>
                <Link to={`/admin/societies/${societyId}`}>
                  <Button variant="outline">Cancel</Button>
                </Link>
              </div>
            </div>
          </div>
        </form>
      </Form>
    </div>
  );
}
