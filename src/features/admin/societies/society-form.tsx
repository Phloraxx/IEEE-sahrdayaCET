import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { Search, Plus, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FormSection } from "@/features/admin/shared/form-section";
import { ImageUpload } from "@/components/admin/image-upload";
import { useAuth } from "@/lib/auth-context";
import { getAdminSociety, saveAdminSociety } from "@/lib/data/admin-societies.client";
import { listAdminUsers } from "@/lib/data/admin-users.client";
import { getWorkspaceMe } from "@/lib/data/workspace.client";

interface UserOption {
  id: string;
  name: string;
  email: string;
}

interface SocietyFormState {
  name: string;
  slug: string;
  bio: string;
  isHidden: boolean;
  defaultWhatsappLink: string;
}

const EMPTY_STATE: SocietyFormState = {
  name: "",
  slug: "",
  bio: "",
  isHidden: false,
  defaultWhatsappLink: "",
};

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
interface SocietyFormProps {
  mode: "create" | "edit";
  societyId?: string;
}

export function SocietyForm({ mode, societyId }: SocietyFormProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user: authUser } = useAuth();
  const workspace = useQuery({ queryKey: ["workspace-me", authUser?.id], queryFn: getWorkspaceMe, enabled: Boolean(authUser?.id), staleTime: 30_000 });
  const isPlatformAdmin = authUser?.role === "admin";
  const canEditSociety = isPlatformAdmin || Boolean(workspace.data?.capabilities.includes("societies.edit"));
  const isEdit = mode === "edit";
  const [form, setForm] = useState<SocietyFormState>(EMPTY_STATE);
  const [slugTouched, setSlugTouched] = useState(false);
  const [chairs, setChairs] = useState<string[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [removeBanner, setRemoveBanner] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Users for chair search
  const { data: usersData } = useQuery<{ users: UserOption[] }>({
    queryKey: ["admin-users-options"],
    queryFn: () => listAdminUsers({ perPage: 100 }),
    enabled: isPlatformAdmin,
    staleTime: 60_000,
  });

  // Existing society (edit mode)
  const { data: existing, isLoading: existingLoading } = useQuery<{
    society: Record<string, unknown>;
  }>({
    queryKey: ["admin-society", societyId],
    queryFn: () => getAdminSociety(societyId!),
    enabled: isEdit && Boolean(societyId),
  });

  // Populate form
  useEffect(() => {
    if (!isEdit) return;
    if (existing?.society) {
      const s = existing.society as Record<string, unknown>;
      setForm({
        name: String(s.name ?? ""),
        slug: String(s.slug ?? ""),
        bio: String(s.bio ?? ""),
        isHidden: Boolean(s.isHidden),
        defaultWhatsappLink: String(s.defaultWhatsappLink ?? ""),
      });
      setChairs((s.chairs as string[]) || []);
      setSlugTouched(true);
    }
  }, [existing, isEdit]);

  // Chair helpers
  const users = usersData?.users ?? [];
  const filteredUsers = users.filter(
    (u) =>
      !chairs.includes(u.id) &&
      (u.name?.toLowerCase().includes(userSearch.toLowerCase()) ||
        u.email?.toLowerCase().includes(userSearch.toLowerCase())),
  );
  const getChairUser = (id: string) => users.find((u) => u.id === id);

  // Submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    try {
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        slug: form.slug.trim(),
        bio: form.bio,
        isHidden: form.isHidden,
        defaultWhatsappLink: form.defaultWhatsappLink.trim(),
        chairs,
      };

      await saveAdminSociety({
        id: isEdit ? societyId : undefined,
        payload,
        logo: logoFile,
        banner: bannerFile,
        removeLogo,
        removeBanner,
        structuralAccess: isPlatformAdmin,
      });



      queryClient.invalidateQueries({ queryKey: ["admin-societies"] });
      queryClient.invalidateQueries({ queryKey: ["admin-societies-options"] });
      navigate("/admin/societies" );
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "An error occurred",
      );
    }
  };

  if (workspace.data && !isPlatformAdmin && !canEditSociety) {
    return <div className="rounded-xl border border-border bg-card p-8"><h2 className="text-lg font-semibold">Society editing is not assigned to you</h2><p className="mt-2 text-sm text-muted-foreground">Your current workspace appointment does not include society profile editing.</p></div>;
  }

  // Loading skeleton
  if (isEdit && existingLoading) {
    return (
      <div className="space-y-6 max-w-2xl">
        <div className="flex items-center gap-4">
          <Skeleton className="h-8 w-8 rounded-lg" />
          <div className="space-y-1">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-6 space-y-3">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      {/* Basic Information */}
      <Card>
        <CardContent className="p-6">
          <FormSection title="Basic Information">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="soc-name">Name *</Label>
                <Input
                  id="soc-name"
                  value={form.name}
                  onChange={(e) => {
                    const next = e.target.value;
                    setForm((prev) => ({
                      ...prev,
                      name: next,
                      slug: slugTouched ? prev.slug : slugify(next),
                    }));
                  }}
                  placeholder="IEEE Computer Society"
                  maxLength={100}
                  required
                  disabled={!isPlatformAdmin}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="soc-slug">Slug *</Label>
                <Input
                  id="soc-slug"
                  value={form.slug}
                  onChange={(e) => {
                    setSlugTouched(true);
                    setForm({ ...form, slug: e.target.value });
                  }}
                  placeholder="computer-society"
                  required
                  title="Lowercase letters, digits, and hyphens only"
                  disabled={!isPlatformAdmin}
                />
              </div>
            </div>
            {isPlatformAdmin && (
              <p className="text-xs text-muted-foreground">
                The slug is used in the public URL. Lowercase letters, digits,
                and hyphens only.
              </p>
            )}

            {!isPlatformAdmin && <p className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs leading-5 text-muted-foreground">Society leaders can maintain branding, bio and the community link. Name, URL slug, visibility and leadership bindings are structural fields reserved for platform administration.</p>}

            <div className="grid gap-4 sm:grid-cols-2">
              <ImageUpload
                label="Logo"
                currentUrl={
                  isEdit && existing?.society
                    ? (existing.society as Record<string, unknown>)
                        .logoUrl as string
                    : undefined
                }
                onChange={(file) => { setLogoFile(file); if (file) setRemoveLogo(false); }}
                onRemove={() => setRemoveLogo(true)}
                previewClassName="h-32 w-32"
              />
              <ImageUpload
                label="Banner"
                currentUrl={
                  isEdit && existing?.society
                    ? (existing.society as Record<string, unknown>)
                        .bannerUrl as string
                    : undefined
                }
                onChange={(file) => { setBannerFile(file); if (file) setRemoveBanner(false); }}
                onRemove={() => setRemoveBanner(true)}
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="soc-bio">Bio</Label>
              <Textarea
                id="soc-bio"
                rows={6}
                value={form.bio}
                onChange={(e) => setForm({ ...form, bio: e.target.value })}
                placeholder="Short description of the society."
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="soc-whatsapp">Default WhatsApp Link</Label>
              <Input
                id="soc-whatsapp"
                type="url"
                value={form.defaultWhatsappLink}
                onChange={(e) =>
                  setForm({ ...form, defaultWhatsappLink: e.target.value })
                }
                placeholder="https://chat.whatsapp.com/..."
              />
              <p className="text-xs text-muted-foreground">
                Fallback link for events under this society
              </p>
            </div>

            {isPlatformAdmin && (
              <>
                <label className="flex cursor-pointer items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-border accent-primary"
                    checked={form.isHidden}
                    onChange={(e) =>
                      setForm({ ...form, isHidden: e.target.checked })
                    }
                  />
                  <span>Hidden from public listings</span>
                </label>
              </>
            )}
          </FormSection>
        </CardContent>
      </Card>

      {/* Society Chairs (edit mode only, admin-only) */}
      {isEdit && isPlatformAdmin && (
        <Card>
          <CardContent className="p-6">
            <FormSection title="Society Chairs">
              {/* Current chairs */}
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
                        <div className="min-w-0">
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
                          onClick={() =>
                            setChairs((prev) => prev.filter((c) => c !== id))
                          }
                          className="p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Add chair search */}
              <div className="grid gap-1.5">
                <Label>Add a Chair</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    placeholder="Search users by name or email..."
                    className="pl-9"
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
                          onClick={() => {
                            if (!chairs.includes(u.id)) {
                              setChairs((prev) => [...prev, u.id]);
                            }
                            setUserSearch("");
                          }}
                          className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-muted/50 transition-colors text-left"
                        >
                          <div className="min-w-0">
                            <span className="font-medium">{u.name}</span>
                            <span className="text-muted-foreground ml-2 text-xs">
                              {u.email}
                            </span>
                          </div>
                          <Plus className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
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
        <Button type="submit" className="flex-1">
          {isEdit ? "Save Changes" : "Create Society"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => navigate("/admin/societies" )}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
