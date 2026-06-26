import { useEffect, useState } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

interface SocietyFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  societyId?: string;
}

interface SocietyFormState {
  name: string;
  slug: string;
  bio: string;
  isHidden: boolean;
  logoFile: File | null;
  bannerFile: File | null;
}

const EMPTY_STATE: SocietyFormState = {
  name: "",
  slug: "",
  bio: "",
  isHidden: false,
  logoFile: null,
  bannerFile: null,
};

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
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

export function SocietyFormDialog({
  open,
  onOpenChange,
  societyId,
}: SocietyFormDialogProps) {
  const queryClient = useQueryClient();
  const isEdit = Boolean(societyId);
  const [form, setForm] = useState<SocietyFormState>(EMPTY_STATE);
  const [slugTouched, setSlugTouched] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const { data: existing } = useQuery<{ society: Record<string, unknown> }>({
    queryKey: ["admin-society", societyId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/societies/${societyId}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load society");
      return res.json();
    },
    enabled: open && Boolean(societyId),
  });

  useEffect(() => {
    if (!open) return;
    if (existing?.society) {
      const s = existing.society as Record<string, unknown>;
      setForm({
        name: String(s.name ?? ""),
        slug: String(s.slug ?? ""),
        bio: String(s.bio ?? ""),
        isHidden: Boolean(s.isHidden),
        logoFile: null,
        bannerFile: null,
      });
      setSlugTouched(true);
    } else if (!societyId) {
      setForm(EMPTY_STATE);
      setSlugTouched(false);
    }
  }, [open, existing, societyId]);

  const mutation = useMutation({
    mutationFn: async () => {
      const hasFile = form.logoFile || form.bannerFile;
      let body: BodyInit;
      const headers: Record<string, string> = { "x-csrf-token": csrfToken() };
      if (hasFile) {
        const fd = new FormData();
        fd.set("name", form.name.trim());
        fd.set("slug", form.slug.trim());
        fd.set("bio", form.bio);
        fd.set("isHidden", form.isHidden ? "true" : "false");
        if (form.logoFile) fd.set("logo", form.logoFile);
        if (form.bannerFile) fd.set("banner", form.bannerFile);
        body = fd;
      } else {
        headers["Content-Type"] = "application/json";
        body = JSON.stringify({
          name: form.name.trim(),
          slug: form.slug.trim(),
          bio: form.bio,
          isHidden: form.isHidden,
        });
      }
      const url = isEdit
        ? `/api/admin/societies/${societyId}`
        : "/api/admin/societies";
      const res = await fetch(url, {
        method: isEdit ? "PUT" : "POST",
        credentials: "include",
        headers,
        body,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `Request failed (${res.status})`);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-societies"] });
      queryClient.invalidateQueries({ queryKey: ["admin-societies-options"] });
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
      if (societyId) {
        queryClient.invalidateQueries({
          queryKey: ["admin-society", societyId],
        });
      }
      onOpenChange(false);
    },
    onError: (err: Error) => setSubmitError(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    if (!form.name.trim()) return setSubmitError("Name is required");
    if (!form.slug.trim()) return setSubmitError("Slug is required");
    mutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="vh-admin max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edit society" : "Create society"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update the society details below."
              : "Add a new IEEE society chapter."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-4 py-2">
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
              required
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
              pattern="[a-z0-9-]+"
            />
            <p className="text-xs text-muted-foreground">
              URL-friendly identifier. Lowercase letters, digits, and hyphens
              only.
            </p>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="soc-bio">Bio</Label>
            <Textarea
              id="soc-bio"
              rows={4}
              value={form.bio}
              onChange={(e) => setForm({ ...form, bio: e.target.value })}
              placeholder="Short description of the society."
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="soc-logo">Logo</Label>
              <Input
                id="soc-logo"
                type="file"
                accept="image/*"
                onChange={(e) =>
                  setForm({
                    ...form,
                    logoFile: e.target.files?.[0] ?? null,
                  })
                }
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="soc-banner">Banner</Label>
              <Input
                id="soc-banner"
                type="file"
                accept="image/*"
                onChange={(e) =>
                  setForm({
                    ...form,
                    bannerFile: e.target.files?.[0] ?? null,
                  })
                }
              />
            </div>
          </div>

          <label className="flex cursor-pointer items-center gap-2 rounded-md border border-border bg-card/30 px-3 py-2 text-sm">
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

          {submitError && (
            <p
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            >
              {submitError}
            </p>
          )}

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={mutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              )}
              {isEdit ? "Save changes" : "Create society"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
