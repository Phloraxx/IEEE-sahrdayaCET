import { getPbClient } from "@/lib/pb-client";
import type {
  WorkspaceAssignment,
  WorkspaceMe,
  WorkspaceRoleCode,
  WorkspaceScopeType,
} from "@/lib/workspace-permissions";


function toAssignmentDate(value: string | undefined, endOfDay = false): string | undefined {
  if (!value) return undefined;
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? `${value}T${endOfDay ? "23:59:59.999" : "00:00:00"}`
    : value;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

export async function getWorkspaceMe(): Promise<WorkspaceMe> {
  return getPbClient().send("/api/workspace/me", {}) as Promise<WorkspaceMe>;
}

export async function listWorkspaceAssignments(scopeType: WorkspaceScopeType, scopeId = "") {
  const query = new URLSearchParams({ scopeType });
  if (scopeId) query.set("scopeId", scopeId);
  return getPbClient().send(`/api/workspace/assignments?${query.toString()}`, {}) as Promise<{ assignments: WorkspaceAssignment[] }>;
}

export interface CreateWorkspaceAssignmentInput {
  userId: string;
  roleCode: WorkspaceRoleCode;
  scopeType: WorkspaceScopeType;
  societyId?: string;
  eventId?: string;
  title?: string;
  term?: string;
  startsAt?: string;
  endsAt?: string;
  notes?: string;
}

export async function createWorkspaceAssignment(input: CreateWorkspaceAssignmentInput) {
  return getPbClient().send("/api/workspace/assignments", {
    method: "POST",
    body: {
      ...input,
      startsAt: toAssignmentDate(input.startsAt),
      endsAt: toAssignmentDate(input.endsAt, true),
    },
  }) as Promise<{ assignment: WorkspaceAssignment }>;
}

export async function deactivateWorkspaceAssignment(id: string) {
  return getPbClient().send(`/api/workspace/assignments/${encodeURIComponent(id)}`, {
    method: "DELETE",
  }) as Promise<{ assignment: WorkspaceAssignment }>;
}

export async function searchWorkspaceUsers(input: { q: string; scopeType: WorkspaceScopeType; scopeId?: string }) {
  const query = new URLSearchParams({ q: input.q, scopeType: input.scopeType });
  if (input.scopeId) query.set("scopeId", input.scopeId);
  return getPbClient().send(`/api/workspace/users/search?${query.toString()}`, {}) as Promise<{
    users: Array<{ id: string; name: string; email: string }>;
  }>;
}

export async function runEventWorkflow(
  eventId: string,
  action: "publish" | "unpublish" | "complete",
  note = "",
) {
  return getPbClient().send(`/api/workspace/events/${encodeURIComponent(eventId)}/workflow`, {
    method: "POST",
    body: { action, note },
  }) as Promise<{ event: Record<string, unknown> }>;
}

export async function checkInWorkspaceTicket(ticketId: string, eventId = "") {
  return getPbClient().send("/api/workspace/check-in", {
    method: "POST",
    body: { ticketId, eventId },
  }) as Promise<{
    success: boolean;
    message: string;
    registration: {
      id: string;
      eventTitle: string;
      ticketId: string;
      checkedIn: boolean;
      checkedInAt: string;
    };
  }>;
}
