import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Search, UserPlus, X } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { PanelHeader } from "@/components/admin/panel-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listAdminSocieties } from "@/lib/data/admin-societies.client";
import {
  createWorkspaceAssignment,
  deactivateWorkspaceAssignment,
  getWorkspaceMe,
  listWorkspaceAssignments,
  searchWorkspaceUsers,
} from "@/lib/data/workspace.client";
import {
  roleLabel,
  WORKSPACE_ROLE_DEFINITIONS,
  type WorkspaceRoleCode,
  type WorkspaceScopeType,
} from "@/lib/workspace-permissions";
import { formatDateShort } from "@/lib/dates";

function roleOptions(scope: WorkspaceScopeType, elevated: boolean, platformAdmin: boolean): WorkspaceRoleCode[] {
  const roles = (Object.keys(WORKSPACE_ROLE_DEFINITIONS) as WorkspaceRoleCode[]).filter((role) => WORKSPACE_ROLE_DEFINITIONS[role].scope === scope);
  if (scope === "branch") return platformAdmin ? roles : [];
  if (scope === "society" && !elevated) return roles.filter((role) => ["society_vice_chair", "society_secretary", "society_content", "society_team"].includes(role));
  return roles;
}

function assignmentWindow(startsAt: string, endsAt: string) {
  if (!startsAt && !endsAt) return "No expiry";
  const start = startsAt ? formatDateShort(startsAt) : "Now";
  const end = endsAt ? formatDateShort(endsAt) : "No end";
  return `${start} → ${end}`;
}

export default function AdminAccess() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const workspace = useQuery({ queryKey: ["workspace-me", user?.id], queryFn: getWorkspaceMe, enabled: Boolean(user?.id), staleTime: 30_000 });
  const canBranch = Boolean(workspace.data?.branchCapabilities.includes("assignments.manage"));
  const isPlatformAdmin = workspace.data?.legacyRole === "admin";
  const manageableSocieties = useMemo(
    () => Array.from(new Set((workspace.data?.assignments ?? []).filter((a) => a.scopeType === "society" && a.active).map((a) => a.societyId).filter(Boolean))),
    [workspace.data?.assignments],
  );
  const [scopeType, setScopeType] = useState<"branch" | "society">("branch");
  const [societyId, setSocietyId] = useState("");
  const [roleCode, setRoleCode] = useState<WorkspaceRoleCode>("branch_secretary");
  const [userQuery, setUserQuery] = useState("");
  const [selectedUser, setSelectedUser] = useState<{ id: string; name: string; email: string } | null>(null);
  const [title, setTitle] = useState("");
  const [term, setTerm] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!workspace.data) return;
    if (!canBranch && manageableSocieties.length) {
      setScopeType("society");
      setSocietyId((current) => current || manageableSocieties[0] || "");
      setRoleCode("society_secretary");
    }
  }, [workspace.data, canBranch, manageableSocieties]);

  const societies = useQuery({
    queryKey: ["admin-societies-options"],
    queryFn: () => listAdminSocieties({ perPage: 200 }),
    enabled: scopeType === "society",
    staleTime: 60_000,
  });
  const scopeId = scopeType === "society" ? societyId : "";
  const assignments = useQuery({
    queryKey: ["workspace-assignments", scopeType, scopeId],
    queryFn: () => listWorkspaceAssignments(scopeType, scopeId),
    enabled: Boolean(workspace.data) && (scopeType === "branch" ? canBranch : Boolean(scopeId)),
  });
  const users = useQuery({
    queryKey: ["workspace-user-search", userQuery, scopeType, scopeId],
    queryFn: () => searchWorkspaceUsers({ q: userQuery, scopeType, scopeId }),
    enabled: userQuery.trim().length >= 2 && (scopeType === "branch" ? canBranch : Boolean(scopeId)),
    staleTime: 15_000,
  });

  const createMutation = useMutation({
    mutationFn: () => createWorkspaceAssignment({
      userId: selectedUser!.id,
      roleCode,
      scopeType,
      societyId: scopeType === "society" ? societyId : undefined,
      title: title.trim() || roleLabel(roleCode),
      term: term.trim(),
      startsAt: startsAt || undefined,
      endsAt: endsAt || undefined,
    }),
    onSuccess: () => {
      setError(""); setSelectedUser(null); setUserQuery(""); setTitle("");
      queryClient.invalidateQueries({ queryKey: ["workspace-assignments"] });
      queryClient.invalidateQueries({ queryKey: ["workspace-me"] });
    },
    onError: (err: Error) => setError(err.message || "Could not create assignment"),
  });
  const deactivateMutation = useMutation({
    mutationFn: deactivateWorkspaceAssignment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspace-assignments"] });
      queryClient.invalidateQueries({ queryKey: ["workspace-me"] });
    },
    onError: (err: Error) => setError(err.message || "Could not remove assignment"),
  });

  const changeScope = (next: "branch" | "society") => {
    setScopeType(next);
    setSelectedUser(null); setUserQuery(""); setError("");
    const first = roleOptions(next, canBranch, isPlatformAdmin)[0];
    if (first) setRoleCode(first);
    if (next === "society" && !societyId) setSocietyId(manageableSocieties[0] || "");
  };
  const availableSocieties = (societies.data?.societies ?? []).filter((society) => canBranch || manageableSocieties.includes(society.id));

  return <div className="space-y-6">
    <PanelHeader
      eyebrow="Organisation"
      title="Access & Roles"
      description="Appointments grant capabilities only inside their branch, society, or event scope. Deactivation preserves history."
    />

    <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
      <Card><CardContent className="p-6">
        <div className="mb-5"><h2 className="text-sm font-semibold">Add an assignment</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">Choose the person, organizational scope and role. Public titles are descriptive; permissions come from the role code.</p></div>
        <div className="grid gap-4">
          <div className="grid gap-1.5"><Label>Scope</Label><Select value={scopeType} onValueChange={(value: "branch" | "society") => changeScope(value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{canBranch && <SelectItem value="branch">Student Branch</SelectItem>}<SelectItem value="society">Society / Chapter</SelectItem></SelectContent></Select></div>
          {scopeType === "society" && <div className="grid gap-1.5"><Label>Society</Label><Select value={societyId || "__none__"} onValueChange={(value) => setSocietyId(value === "__none__" ? "" : value)}><SelectTrigger><SelectValue placeholder="Select society" /></SelectTrigger><SelectContent><SelectItem value="__none__">Select society</SelectItem>{availableSocieties.map((society) => <SelectItem key={society.id} value={society.id}>{society.name}</SelectItem>)}</SelectContent></Select></div>}
          <div className="grid gap-1.5"><Label>Role</Label><Select value={roleCode} onValueChange={(value: WorkspaceRoleCode) => { setRoleCode(value); setTitle(""); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{roleOptions(scopeType, canBranch, isPlatformAdmin).map((role) => <SelectItem key={role} value={role}>{roleLabel(role)}</SelectItem>)}</SelectContent></Select></div>
          <div className="grid gap-1.5"><Label>Find account</Label>{selectedUser ? <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2"><div className="min-w-0"><p className="truncate text-sm font-medium">{selectedUser.name || selectedUser.email}</p><p className="truncate text-xs text-muted-foreground">{selectedUser.email}</p></div><Button variant="ghost" size="icon" onClick={() => setSelectedUser(null)} aria-label="Clear selected user"><X className="h-4 w-4" /></Button></div> : <><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={userQuery} onChange={(e) => setUserQuery(e.target.value)} placeholder="Name or college email" className="pl-9" /></div>{userQuery.trim().length >= 2 && <div className="max-h-44 overflow-y-auto rounded-lg border border-border">{users.data?.users.length ? users.data.users.map((candidate) => <button key={candidate.id} type="button" className="block w-full border-b border-border px-3 py-2 text-left last:border-b-0 hover:bg-muted" onClick={() => { setSelectedUser(candidate); setUserQuery(""); }}><p className="text-sm font-medium">{candidate.name || candidate.email}</p><p className="text-xs text-muted-foreground">{candidate.email}</p></button>) : <p className="px-3 py-4 text-xs text-muted-foreground">No matching accounts.</p>}</div>}</>}</div>
          <div className="grid gap-1.5"><Label>Display title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={roleLabel(roleCode)} /><p className="text-[11px] text-muted-foreground">Optional human-facing title; it does not change permissions.</p></div>
          <div className="grid gap-3 sm:grid-cols-3"><div className="grid gap-1.5"><Label>Term</Label><Input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="2026–27" /></div><div className="grid gap-1.5"><Label>Starts</Label><Input type="date" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} /></div><div className="grid gap-1.5"><Label>Ends</Label><Input type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} /></div></div>
          {scopeType === "branch" && !isPlatformAdmin && <p className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs leading-5 text-muted-foreground">Branch officer appointments are visible here, but only a platform administrator can confirm or remove branch-level access. This prevents an officer from promoting themselves or minting an equal branch role.</p>}
          {error && <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p>}
          <Button disabled={!selectedUser || !roleOptions(scopeType, canBranch, isPlatformAdmin).includes(roleCode) || (scopeType === "society" && !societyId) || createMutation.isPending} onClick={() => createMutation.mutate()} className="gap-2"><UserPlus className="h-4 w-4" />Add assignment</Button>
        </div>
      </CardContent></Card>

      <Card><CardContent className="p-6">
        <div className="mb-5 flex items-start justify-between gap-4"><div><h2 className="text-sm font-semibold">Current appointments</h2><p className="mt-1 text-xs text-muted-foreground">Inactive appointments remain in the audit history.</p></div><KeyRound className="h-5 w-5 text-muted-foreground" /></div>
        {assignments.isLoading ? <p className="py-10 text-center text-sm text-muted-foreground">Loading assignments…</p> : assignments.data?.assignments.length ? <div className="space-y-2">{assignments.data.assignments.map((assignment) => <div key={assignment.id} className={`rounded-xl border p-4 ${assignment.active ? "border-border" : "border-border bg-muted/30 opacity-70"}`}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-semibold">{assignment.userName || assignment.userEmail}</p><Badge variant={assignment.active ? "secondary" : "outline"}>{assignment.active ? "Active" : "Inactive"}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{assignment.title || roleLabel(assignment.roleCode)} · {roleLabel(assignment.roleCode)}</p><p className="mt-1 font-mono text-[10px] text-muted-foreground">{assignment.term || "No term"} · {assignmentWindow(assignment.startsAt, assignment.endsAt)}</p></div>{assignment.active && <Button variant="ghost" size="sm" className="text-destructive" disabled={deactivateMutation.isPending} onClick={() => { if (window.confirm(`Remove ${assignment.title || roleLabel(assignment.roleCode)} access for ${assignment.userName || assignment.userEmail}?`)) deactivateMutation.mutate(assignment.id); }}>Remove</Button>}</div></div>)}</div> : <div className="rounded-xl border border-dashed border-border px-4 py-12 text-center text-sm text-muted-foreground">No assignments in this scope.</div>}
      </CardContent></Card>
    </div>
  </div>;
}
