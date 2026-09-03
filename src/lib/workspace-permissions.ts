export const WORKSPACE_ROLE_DEFINITIONS = {
  branch_chair: { label: "Branch Chair", scope: "branch" },
  branch_vice_chair: { label: "Branch Vice Chair", scope: "branch" },
  branch_secretary: { label: "Branch Secretary", scope: "branch" },
  branch_joint_secretary: { label: "Branch Joint Secretary", scope: "branch" },
  branch_treasurer: { label: "Branch Treasurer", scope: "branch" },
  branch_counselor: { label: "Branch Counselor", scope: "branch" },
  branch_faculty_coordinator: { label: "Faculty Coordinator", scope: "branch" },
  branch_content: { label: "Branch Content Team", scope: "branch" },
  branch_webmaster: { label: "Branch Webmaster", scope: "branch" },
  society_faculty: { label: "Society Faculty In-charge", scope: "society" },
  society_chair: { label: "Society Chair", scope: "society" },
  society_vice_chair: { label: "Society Vice Chair", scope: "society" },
  society_secretary: { label: "Society Secretary", scope: "society" },
  society_treasurer: { label: "Society Treasurer", scope: "society" },
  society_content: { label: "Society Content Team", scope: "society" },
  society_team: { label: "Society Team", scope: "society" },
  event_lead: { label: "Event Lead", scope: "event" },
  event_registration: { label: "Registration Desk", scope: "event" },
  event_checkin: { label: "Check-in Staff", scope: "event" },
  event_content: { label: "Event Content / Media", scope: "event" },
  event_finance: { label: "Event Finance", scope: "event" },
} as const;

export type WorkspaceRoleCode = keyof typeof WORKSPACE_ROLE_DEFINITIONS;
export type WorkspaceScopeType = (typeof WORKSPACE_ROLE_DEFINITIONS)[WorkspaceRoleCode]["scope"];

export const WORKSPACE_CAPABILITIES = [
  "workspace.view", "events.view", "events.create", "events.edit", "events.submit",
  "events.approve", "events.publish", "events.cancel", "events.archive", "events.complete", "registrations.view",
  "registrations.manage", "registrations.manual", "checkin.manage", "finance.view",
  "finance.manage", "finance.approve", "societies.view", "societies.edit",
  "assignments.manage", "content.manage", "execom.manage", "reports.view", "technical.manage",
  "certificates.view", "certificates.manage_templates", "certificates.issue",
  "certificates.send", "certificates.revoke",
] as const;

export type WorkspaceCapability = (typeof WORKSPACE_CAPABILITIES)[number];

export interface WorkspaceAssignment {
  id: string;
  userId: string;
  roleCode: WorkspaceRoleCode;
  title: string;
  scopeType: WorkspaceScopeType;
  societyId: string;
  eventId: string;
  term: string;
  startsAt: string;
  endsAt: string;
  active: boolean;
  source: string;
  notes: string;
  capabilities: WorkspaceCapability[];
  userName?: string;
  userEmail?: string;
  societyName?: string;
  eventTitle?: string;
}

export interface WorkspaceMe {
  hasWorkspace: boolean;
  legacyRole: string;
  capabilities: WorkspaceCapability[];
  branchCapabilities: WorkspaceCapability[];
  assignments: WorkspaceAssignment[];
}

export function hasWorkspaceCapability(
  workspace: WorkspaceMe | null | undefined,
  capability: WorkspaceCapability,
): boolean {
  return Boolean(workspace?.capabilities.includes(capability));
}


export function hasScopedWorkspaceCapability(
  workspace: WorkspaceMe | null | undefined,
  capability: WorkspaceCapability,
  context: { societyId?: string; eventId?: string } = {},
): boolean {
  if (!workspace) return false;
  if (workspace.branchCapabilities.includes(capability)) return true;
  return workspace.assignments.some((assignment) => {
    if (!assignment.active || !assignment.capabilities?.includes(capability)) return false;
    if (assignment.scopeType === "branch") return true;
    if (assignment.scopeType === "society") return Boolean(context.societyId) && assignment.societyId === context.societyId;
    if (assignment.scopeType === "event") return Boolean(context.eventId) && assignment.eventId === context.eventId;
    return false;
  });
}

export function canAccessWorkspacePath(
  workspace: WorkspaceMe | null | undefined,
  pathname: string,
): boolean {
  if (!workspace?.hasWorkspace) return false;
  const path = pathname.replace(/\/$/, "") || "/";
  if (path === "/admin") return true;
  const has = (capability: WorkspaceCapability) => hasWorkspaceCapability(workspace, capability);
  const branchHas = (capability: WorkspaceCapability) => workspace.branchCapabilities.includes(capability);
  if (path === "/admin/dashboard") return has("registrations.view") || has("reports.view") || branchHas("technical.manage");
  if (path === "/admin/events" || path.startsWith("/admin/events/")) return has("events.view");
  if (path === "/admin/registrations" || path.startsWith("/admin/registrations/")) return has("registrations.view");
  if (path === "/admin/certificates" || path.startsWith("/admin/certificates/")) return has("certificates.view");
  if (path === "/admin/payments" || path.startsWith("/admin/payments/")) return branchHas("finance.view");
  if (path === "/admin/check-in" || path.startsWith("/admin/check-in/")) return has("checkin.manage");
  if (path === "/admin/data-health" || path.startsWith("/admin/data-health/")) return branchHas("technical.manage");
  if (path === "/admin/societies" || path.startsWith("/admin/societies/")) return has("societies.view");
  if (path === "/admin/access" || path.startsWith("/admin/access/")) return has("assignments.manage");
  if (path === "/admin/blogs" || path.startsWith("/admin/blogs/")) return has("content.manage");
  if (path === "/admin/users" || path.startsWith("/admin/users/")) return workspace.legacyRole === "admin";
  if (path === "/admin/execom" || path.startsWith("/admin/execom/")) return workspace.legacyRole === "admin";
  return false;
}

export function preferredWorkspacePath(workspace: WorkspaceMe | null | undefined): string {
  if (!workspace?.hasWorkspace) return "/";
  const has = (capability: WorkspaceCapability) => hasWorkspaceCapability(workspace, capability);
  if (has("checkin.manage") && !has("registrations.view") && !has("events.edit")) return "/admin/check-in";
  if (has("content.manage") && !has("registrations.view") && !has("events.edit")) return "/admin/blogs";
  if (has("technical.manage") || has("registrations.view")) return "/admin/dashboard";
  if (has("events.view")) return "/admin/events";
  if (workspace.branchCapabilities?.includes("finance.view")) return "/admin/payments";
  if (has("societies.view")) return "/admin/societies";
  return "/admin";
}

export function roleLabel(roleCode: string): string {
  return WORKSPACE_ROLE_DEFINITIONS[roleCode as WorkspaceRoleCode]?.label ?? roleCode.replaceAll("_", " ");
}
