import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  createWorkspaceAssignment,
  deactivateWorkspaceAssignment,
  listWorkspaceAssignments,
  searchWorkspaceUsers,
} from "@/lib/data/workspace.client";
import { roleLabel, type WorkspaceRoleCode } from "@/lib/workspace-permissions";
import { getWorkspaceMe } from "@/lib/data/workspace.client";

const EVENT_ROLES: WorkspaceRoleCode[] = ["event_lead", "event_registration", "event_checkin", "event_content", "event_finance"];

export function EventTeamPanel({ eventId, societyId, canManage }: { eventId: string; societyId: string; canManage: boolean }) {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<{ id: string; name: string; email: string } | null>(null);
  const [roleCode, setRoleCode] = useState<WorkspaceRoleCode>("event_checkin");
  const [title, setTitle] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [error, setError] = useState("");
  const workspace = useQuery({ queryKey: ["workspace-me"], queryFn: getWorkspaceMe, staleTime: 30_000 });
  const higherScopeManager = Boolean(
    workspace.data?.branchCapabilities.includes("assignments.manage") ||
    workspace.data?.assignments.some((assignment) => assignment.active && assignment.scopeType === "society" && assignment.societyId === societyId && ["society_faculty", "society_chair", "society_vice_chair"].includes(assignment.roleCode)),
  );
  const grantableRoles = higherScopeManager ? EVENT_ROLES : EVENT_ROLES.filter((role) => ["event_registration", "event_checkin", "event_content"].includes(role));

  const assignments = useQuery({
    queryKey: ["workspace-assignments", "event", eventId],
    queryFn: () => listWorkspaceAssignments("event", eventId),
    enabled: canManage,
  });
  const users = useQuery({
    queryKey: ["workspace-user-search", query, "event", eventId],
    queryFn: () => searchWorkspaceUsers({ q: query, scopeType: "event", scopeId: eventId }),
    enabled: canManage && query.trim().length >= 2,
    staleTime: 15_000,
  });
  const createMutation = useMutation({
    mutationFn: () => createWorkspaceAssignment({
      userId: selected!.id,
      roleCode,
      scopeType: "event",
      eventId,
      title: title.trim() || roleLabel(roleCode),
      startsAt: startsAt || undefined,
      endsAt: endsAt || undefined,
    }),
    onSuccess: () => {
      setSelected(null); setQuery(""); setTitle(""); setError("");
      queryClient.invalidateQueries({ queryKey: ["workspace-assignments", "event", eventId] });
    },
    onError: (err: Error) => setError(err.message || "Could not assign event staff"),
  });
  const removeMutation = useMutation({
    mutationFn: deactivateWorkspaceAssignment,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["workspace-assignments", "event", eventId] }),
    onError: (err: Error) => setError(err.message || "Could not remove event staff"),
  });

  if (!canManage) return <Card><CardContent className="p-8 text-sm text-muted-foreground">You can work on this event, but only an event or organizational access manager can change its staff assignments.</CardContent></Card>;

  return <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
    <Card><CardContent className="p-6">
      <h2 className="text-sm font-semibold">Add event staff</h2>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">Give temporary, event-only access. Check-in staff can scan tickets without receiving the attendee register.</p>
      <div className="mt-5 grid gap-4">
        <div className="grid gap-1.5"><Label>Role</Label><Select value={roleCode} onValueChange={(value: WorkspaceRoleCode) => { setRoleCode(value); setTitle(""); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{grantableRoles.map((role) => <SelectItem key={role} value={role}>{roleLabel(role)}</SelectItem>)}</SelectContent></Select></div>
        <div className="grid gap-1.5"><Label>Account</Label>{selected ? <div className="rounded-lg border border-border px-3 py-2"><p className="text-sm font-medium">{selected.name || selected.email}</p><p className="text-xs text-muted-foreground">{selected.email}</p><Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => setSelected(null)}>Choose another</Button></div> : <><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name or email" className="pl-9" /></div>{query.trim().length >= 2 && <div className="max-h-40 overflow-y-auto rounded-lg border border-border">{users.data?.users.map((candidate) => <button type="button" key={candidate.id} className="block w-full border-b border-border px-3 py-2 text-left last:border-0 hover:bg-muted" onClick={() => { setSelected(candidate); setQuery(""); }}><p className="text-sm font-medium">{candidate.name || candidate.email}</p><p className="text-xs text-muted-foreground">{candidate.email}</p></button>)}{users.data && users.data.users.length === 0 && <p className="p-3 text-xs text-muted-foreground">No matching account.</p>}</div>}</>}</div>
        <div className="grid gap-1.5"><Label>Display title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={roleLabel(roleCode)} /></div>
        <div className="grid gap-3 sm:grid-cols-2"><div className="grid gap-1.5"><Label>Access starts</Label><Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} /></div><div className="grid gap-1.5"><Label>Access ends</Label><Input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} /></div></div>
        {error && <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p>}
        <Button className="gap-2" disabled={!selected || createMutation.isPending} onClick={() => createMutation.mutate()}><UserPlus className="h-4 w-4" />Add to event</Button>
      </div>
    </CardContent></Card>

    <Card><CardContent className="p-6">
      <h2 className="text-sm font-semibold">Event team</h2><p className="mt-1 text-xs text-muted-foreground">Access can expire automatically after the event.</p>
      <div className="mt-5 space-y-2">{assignments.isLoading ? <p className="py-8 text-center text-sm text-muted-foreground">Loading team…</p> : assignments.data?.assignments.length ? assignments.data.assignments.map((assignment) => <div key={assignment.id} className={`flex items-start justify-between gap-3 rounded-xl border border-border p-4 ${assignment.active ? "" : "bg-muted/25 opacity-65"}`}><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-semibold">{assignment.userName || assignment.userEmail}</p><Badge variant={assignment.active ? "secondary" : "outline"}>{assignment.active ? "Active" : "Inactive"}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{assignment.title || roleLabel(assignment.roleCode)} · {roleLabel(assignment.roleCode)}</p>{(assignment.startsAt || assignment.endsAt) && <p className="mt-1 font-mono text-[10px] text-muted-foreground">{assignment.startsAt || "Now"} → {assignment.endsAt || "No expiry"}</p>}</div>{assignment.active && <Button variant="ghost" size="sm" className="text-destructive" disabled={removeMutation.isPending} onClick={() => { if (window.confirm(`Remove ${assignment.userName || assignment.userEmail} from this event team?`)) removeMutation.mutate(assignment.id); }}>Remove</Button>}</div>) : <div className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">No event-specific staff yet.</div>}</div>
    </CardContent></Card>
  </div>;
}
