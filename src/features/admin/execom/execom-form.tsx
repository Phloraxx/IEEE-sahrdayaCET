import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { Loader2, Search } from "lucide-react";
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
import { getAdminExecomMember, saveAdminExecomMember } from "@/lib/data/admin-execom.client";
import { listAdminSocieties } from "@/lib/data/admin-societies.client";
import { listAdminUsers } from "@/lib/data/admin-users.client";
import { roleLabel, WORKSPACE_ROLE_DEFINITIONS, type WorkspaceRoleCode } from "@/lib/workspace-permissions";

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
  portfolio: string;
  society: string;
  userId: string;
  roleCode: WorkspaceRoleCode | "";
  term: string;
  activeFrom: string;
  activeUntil: string;
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
  portfolio: "",
  society: "",
  userId: "",
  roleCode: "",
  term: "",
  activeFrom: "",
  activeUntil: "",
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
  const [userSearch, setUserSearch] = useState("");

  const { data: societies } = useQuery<{ societies: SocietyOption[] }>({
    queryKey: ["admin-societies-options"],
    queryFn: () => listAdminSocieties({ perPage: 200 }),
    staleTime: 60_000,
  });

  const { data: userResults } = useQuery({
    queryKey: ["admin-users-execom-link", userSearch],
    queryFn: () => listAdminUsers({ search: userSearch, perPage: 20 }),
    enabled: userSearch.trim().length >= 2,
    staleTime: 15_000,
  });

  const { data: existing, isLoading: existingLoading } = useQuery<{
    member: Record<string, unknown>;
  }>({
    queryKey: ["admin-execom-member", memberId],
    queryFn: () => getAdminExecomMember(memberId!),
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
        portfolio: String(m.portfolio ?? ""),
        society: String(m.society ?? ""),
        userId: String(m.user ?? ""),
        roleCode: (String(m.roleCode ?? "") as WorkspaceRoleCode | ""),
        term: String(m.term ?? ""),
        activeFrom: String(m.activeFrom ?? "").slice(0, 10),
        activeUntil: String(m.activeUntil ?? "").slice(0, 10),
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
      fd.set("linkedin", form.linkedin.trim());
      fd.set("instagram", form.instagram.trim());
      fd.set("portfolio", form.portfolio.trim());
      if (form.society) fd.set("society", form.society);
      else fd.set("society", "");
      fd.set("user", form.userId);
      fd.set("roleCode", form.roleCode);
      fd.set("term", form.term.trim());
      fd.set("activeFrom", form.activeFrom);
      fd.set("activeUntil", form.activeUntil);
      if (form.photoFile) fd.set("photo", form.photoFile);

      return saveAdminExecomMember(isEdit ? memberId : undefined, fd);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-execom"] });
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
      if (memberId) {
        queryClient.invalidateQueries({
          queryKey: ["admin-execom-member", memberId],
        });
      }
      navigate("/admin/execom" );
    },
    onError: (err: Error) => setSubmitError(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    if (!form.name.trim()) return setSubmitError("Name is required");
    if (!form.position.trim()) return setSubmitError("Position is required");
    if ((form.userId && !form.roleCode) || (!form.userId && form.roleCode)) return setSubmitError("Link both an account and workspace role, or leave both empty");
    if (form.roleCode) {
      const expected = WORKSPACE_ROLE_DEFINITIONS[form.roleCode].scope;
      if (expected === "society" && !form.society) return setSubmitError("A society-scoped workspace role requires a society");
      if (expected === "branch" && form.society) return setSubmitError("Branch workspace roles must use Society = None");
    }
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
                  onValueChange={(v) => {
                    const society = v === "__none__" ? "" : v;
                    const roleCode = form.roleCode && WORKSPACE_ROLE_DEFINITIONS[form.roleCode].scope !== (society ? "society" : "branch") ? "" : form.roleCode;
                    setForm({ ...form, society, roleCode });
                  }}
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

          <FormSection title="Workspace linkage" description="Optional. Linking a login account and role turns this public appointment into a scoped, time-bound workspace assignment.">
            <div className="grid gap-1.5">
              <Label htmlFor="ex-user-search">Linked account</Label>
              {form.userId ? <div className="flex items-center justify-between rounded-lg border border-border bg-muted/25 px-3 py-2"><div><p className="text-sm font-medium">Account linked</p><p className="font-mono text-[10px] text-muted-foreground">{form.userId}</p></div><Button type="button" variant="ghost" size="sm" onClick={() => setForm({ ...form, userId: "", roleCode: "" })}>Unlink</Button></div> : <><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input id="ex-user-search" value={userSearch} onChange={(e) => setUserSearch(e.target.value)} placeholder="Search account by name or email" className="pl-9" /></div>{userSearch.trim().length >= 2 && <div className="max-h-40 overflow-y-auto rounded-lg border border-border">{userResults?.users.length ? userResults.users.map((candidate) => <button type="button" key={candidate.id} className="block w-full border-b border-border px-3 py-2 text-left last:border-0 hover:bg-muted" onClick={() => { setForm({ ...form, userId: candidate.id }); setUserSearch(""); }}><p className="text-sm font-medium">{candidate.name || candidate.email}</p><p className="text-xs text-muted-foreground">{candidate.email}</p></button>) : <p className="p-3 text-xs text-muted-foreground">No matching account.</p>}</div>}</>}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5"><Label>Workspace role</Label><Select value={form.roleCode || "__none__"} onValueChange={(value) => setForm({ ...form, roleCode: value === "__none__" ? "" : value as WorkspaceRoleCode })}><SelectTrigger><SelectValue placeholder="No workspace access" /></SelectTrigger><SelectContent><SelectItem value="__none__">Directory only</SelectItem>{(Object.keys(WORKSPACE_ROLE_DEFINITIONS) as WorkspaceRoleCode[]).filter((role) => WORKSPACE_ROLE_DEFINITIONS[role].scope === (form.society ? "society" : "branch")).map((role) => <SelectItem key={role} value={role}>{roleLabel(role)}</SelectItem>)}</SelectContent></Select></div>
              <div className="grid gap-1.5"><Label htmlFor="ex-term">Term</Label><Input id="ex-term" value={form.term} onChange={(e) => setForm({ ...form, term: e.target.value })} placeholder="2026–27" /></div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5"><Label htmlFor="ex-active-from">Active from</Label><Input id="ex-active-from" type="date" value={form.activeFrom} onChange={(e) => setForm({ ...form, activeFrom: e.target.value })} /></div>
              <div className="grid gap-1.5"><Label htmlFor="ex-active-until">Active until</Label><Input id="ex-active-until" type="date" value={form.activeUntil} onChange={(e) => setForm({ ...form, activeUntil: e.target.value })} /></div>
            </div>
            <p className="text-xs leading-5 text-muted-foreground">Titles such as “Secretary” stay human-facing. The selected role code is what grants software permissions. Removing the link deactivates the synced appointment rather than deleting its history.</p>
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
              <div className="grid gap-1.5 sm:col-span-2">
                <Label htmlFor="ex-portfolio">Portfolio</Label>
                <Input
                  id="ex-portfolio"
                  type="url"
                  value={form.portfolio}
                  onChange={(e) =>
                    setForm({ ...form, portfolio: e.target.value })
                  }
                  placeholder="https://example.com"
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
              onClick={() => navigate("/admin/execom" )}
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
