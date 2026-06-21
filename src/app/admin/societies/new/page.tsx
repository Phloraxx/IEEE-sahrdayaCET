"use client";

import { useState, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Loader2, Search, Plus, ImageUp, X } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

interface User {
  id: string;
  name: string;
  email: string;
}

export default function NewSocietyPage() {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    slug: "",
    bio: "",
    isHidden: false,
    defaultWhatsappLink: "",
  });
  const [chairs, setChairs] = useState<string[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);

  useEffect(() => {
    Promise.all([fetch("/api/admin/users").then((r) => r.json())])
      .then(([usersData]) => {
        setUsers(usersData.users || []);
      })
      .catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const fd = new FormData();
      fd.append("name", form.name);
      fd.append("slug", form.slug);
      fd.append("bio", form.bio);
      fd.append("isHidden", String(form.isHidden));
      fd.append("chairs", JSON.stringify(chairs));
      if (form.defaultWhatsappLink)
        fd.append("defaultWhatsappLink", form.defaultWhatsappLink);
      if (logoFile) fd.append("logo", logoFile);
      if (bannerFile) fd.append("banner", bannerFile);

      const res = await fetch("/api/admin/societies", {
        method: "POST",
        body: fd,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create society");
      }

      const data = await res.json();
      toast.success("Society created");
      navigate({ to: "/admin/societies/$id", params: { id: data.society.id } });
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setSaving(false);
    }
  };

  const update =
    (field: string) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((prev) => ({ ...prev, [field]: e.target.value }));

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

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-4">
        <Link
          to="/admin/societies"
          className="inline-flex items-center justify-center rounded-lg border border-border p-2 text-muted-foreground hover:bg-muted transition-colors"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Create Society</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Add a new IEEE society
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Basic Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Name *</label>
              <input
                required
                value={form.name}
                onChange={update("name")}
                className="w-full rounded-lg border border-input bg-white px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring/50"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Slug *</label>
              <input
                required
                value={form.slug}
                onChange={update("slug")}
                className="w-full rounded-lg border border-input bg-white px-3 py-2 text-sm font-mono outline-none focus:border-ring focus:ring-1 focus:ring-ring/50"
              />
              <p className="text-xs text-muted-foreground">
                URL-friendly identifier (e.g. &quot;ieee-cs&quot;)
              </p>
            </div>
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
            <div className="space-y-2">
              <label className="text-sm font-medium">Bio</label>
              <textarea
                value={form.bio}
                onChange={update("bio")}
                rows={3}
                className="w-full rounded-lg border border-input bg-white px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring/50 resize-y"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Default WhatsApp Link
              </label>
              <input
                value={form.defaultWhatsappLink}
                onChange={update("defaultWhatsappLink")}
                placeholder="https://chat.whatsapp.com/..."
                className="w-full rounded-lg border border-input bg-white px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring/50"
              />
              <p className="text-xs text-muted-foreground">
                Fallback link for events under this society
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isHidden"
                checked={form.isHidden}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, isHidden: e.target.checked }))
                }
                className="rounded border-input"
              />
              <label
                htmlFor="isHidden"
                className="text-sm font-medium cursor-pointer"
              >
                Hidden (not shown publicly)
              </label>
            </div>
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
                <Loader2 className="size-4 mr-2 animate-spin" /> Creating...
              </>
            ) : (
              "Create Society"
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
    </div>
  );
}
