import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface SocietyOption {
  id: string;
  name: string;
}

interface ExecomFormState {
  name: string;
  position: string;
  department: string;
  batch: string;
  section: string;
  sectionId: string;
  order: string;
  linkedin: string;
  instagram: string;
  society: string;
  photoFile: File | null;
}

const EMPTY_STATE: ExecomFormState = {
  name: "",
  position: "",
  department: "",
  batch: "",
  section: "",
  sectionId: "",
  order: "0",
  linkedin: "",
  instagram: "",
  society: "",
  photoFile: null,
};
interface ExecomFormProps {
  mode: "create" | "edit";
  memberId?: string;
}

export function ExecomForm({ mode, memberId }: ExecomFormProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isEdit = mode === "edit";
  const [form, setForm] = useState<ExecomFormState>(EMPTY_STATE);
  const [submitError, setSubmitError] = useState<string | null>(null);

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

  const { data: existing, isLoading: existingLoading } = useQuery<{
    member: Record<string, unknown>;
  }>({
    queryKey: ["admin-execom-member", memberId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/execom/${memberId}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load member");
      return res.json();
    },
    enabled: isEdit && Boolean(memberId),
  });

  useEffect(() => {
    if (!isEdit) return;
    if (existing?.member) {
      const m = existing.member as Record<string, unknown>;
      setForm({
        name: String(m.name ?? ""),
        position: String(m.position ?? ""),
        department: String(m.department ?? ""),
        batch: String(m.batch ?? ""),
        section: String(m.section ?? ""),
        sectionId: String(m.sectionId ?? ""),
        order: String(m.order ?? "0"),
        linkedin: String(m.linkedin ?? ""),
        instagram: String(m.instagram ?? ""),
        society: String(m.society ?? ""),
        photoFile: null,
      });
    }
  }, [existing, isEdit]);

  const mutation = useMutation({
    mutationFn: async () => {
      const fd = new FormData();
      fd.set("name", form.name.trim());
      fd.set("position", form.position.trim());
      if (form.department) fd.set("department", form.department);
      if (form.batch) fd.set("batch", form.batch);
      if (form.section) fd.set("section", form.section);
      if (form.sectionId) fd.set("sectionId", form.sectionId);
      if (form.order) fd.set("order", form.order);
      if (form.linkedin) fd.set("linkedin", form.linkedin);
      if (form.instagram) fd.set("instagram", form.instagram);
      if (form.society) fd.set("society", form.society);
      if (form.photoFile) fd.set("photo", form.photoFile);

      const url = isEdit
        ? `/api/admin/execom/${memberId}`
        : "/api/admin/execom";
      const res = await fetch(url, {
        method: isEdit ? "PUT" : "POST",
        credentials: "include",
        body: fd,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `Request failed (${res.status})`);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-execom"] });
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
      if (memberId) {
        queryClient.invalidateQueries({
          queryKey: ["admin-execom-member", memberId],
        });
      }
      navigate({ to: "/admin/execom" });
    },
    onError: (err: Error) => setSubmitError(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    if (!form.name.trim()) return setSubmitError("Name is required");
    if (!form.position.trim()) return setSubmitError("Position is required");
    mutation.mutate();
  };

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
        <div className="rounded-lg border border-border bg-card p-6 space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="grid gap-4 sm:grid-cols-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <Card>
      <CardContent className="p-6">
        <form onSubmit={handleSubmit} className="grid gap-6">
          <FormSection title="Identity">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="ex-name">Name *</Label>
                <Input
                  id="ex-name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  maxLength={100}
                  required
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="ex-position">Position *</Label>
                <Input
                  id="ex-position"
                  value={form.position}
                  onChange={(e) =>
                    setForm({ ...form, position: e.target.value })
                  }
                  placeholder="e.g. Chairperson"
                  maxLength={100}
                  required
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="ex-society">Society</Label>
                <Select
                  value={form.society || "__none__"}
                  onValueChange={(v) =>
                    setForm({ ...form, society: v === "__none__" ? "" : v })
                  }
                >
                  <SelectTrigger id="ex-society">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {(societies?.societies ?? []).map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="ex-order">Display order</Label>
                <Input
                  id="ex-order"
                  type="number"
                  min="0"
                  value={form.order}
                  onChange={(e) =>
                    setForm({ ...form, order: e.target.value })
                  }
                />
              </div>
            </div>
          </FormSection>

          <FormSection title="Academic">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="ex-department">Department</Label>
                <Input
                  id="ex-department"
                  value={form.department}
                  onChange={(e) =>
                    setForm({ ...form, department: e.target.value })
                  }
                  placeholder="e.g. CSE"
                  maxLength={50}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="ex-batch">Batch</Label>
                <Input
                  id="ex-batch"
                  value={form.batch}
                  onChange={(e) =>
                    setForm({ ...form, batch: e.target.value })
                  }
                  placeholder="e.g. 2024"
                  maxLength={50}
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="ex-section">Section</Label>
                <Input
                  id="ex-section"
                  value={form.section}
                  onChange={(e) =>
                    setForm({ ...form, section: e.target.value })
                  }
                  maxLength={50}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="ex-section-id">Section ID</Label>
                <Input
                  id="ex-section-id"
                  value={form.sectionId}
                  onChange={(e) =>
                    setForm({ ...form, sectionId: e.target.value })
                  }
                />
              </div>
            </div>
          </FormSection>

          <FormSection title="Contact">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="ex-linkedin">LinkedIn</Label>
                <Input
                  id="ex-linkedin"
                  type="url"
                  value={form.linkedin}
                  onChange={(e) =>
                    setForm({ ...form, linkedin: e.target.value })
                  }
                  placeholder="https://linkedin.com/in/…"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="ex-instagram">Instagram</Label>
                <Input
                  id="ex-instagram"
                  type="url"
                  value={form.instagram}
                  onChange={(e) =>
                    setForm({ ...form, instagram: e.target.value })
                  }
                  placeholder="https://instagram.com/…"
                />
              </div>
            </div>
          </FormSection>

          <FormSection title="Photo">
            <div className="grid gap-1.5">
              <Label htmlFor="ex-photo">Profile photo</Label>
              <Input
                id="ex-photo"
                type="file"
                accept="image/*"
                onChange={(e) =>
                  setForm({
                    ...form,
                    photoFile: e.target.files?.[0] ?? null,
                  })
                }
              />
            </div>
          </FormSection>

          {submitError && (
            <p
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            >
              {submitError}
            </p>
          )}

          <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate({ to: "/admin/execom" })}
              disabled={mutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              )}
              {isEdit ? "Save changes" : "Add member"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-4 border-b border-border pb-6 last:border-b-0 last:pb-0">
      <div>
        <h2 className="text-sm font-semibold tracking-tight text-foreground">
          {title}
        </h2>
        {description && (
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      <div className="grid gap-4">{children}</div>
    </section>
  );
}
