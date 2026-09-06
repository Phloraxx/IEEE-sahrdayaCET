export const WORKSPACE_ROLE_DEFINITIONS = {
  organizer: { label: "Organizer", scopes: ["branch", "society", "event"] },
  finance: { label: "Finance", scopes: ["branch", "society", "event"] },
  registration_staff: { label: "Registration Staff", scopes: ["event"] },
  checkin_staff: { label: "Check-in Staff", scopes: ["event"] },
  content_editor: { label: "Content Editor", scopes: ["branch", "society", "event"] },
} as const;

export type WorkspaceRoleCode = keyof typeof WORKSPACE_ROLE_DEFINITIONS;
export type WorkspaceScopeType = "branch" | "society" | "event";

/** Historical storage codes remain readable while the UI speaks in capabilities. */
export const HISTORICAL_ROLE_ALIASES: Record<string, WorkspaceRoleCode> = {
  branch_chair: "organizer",
  branch_vice_chair: "organizer",
  branch_secretary: "organizer",
  branch_joint_secretary: "organizer",
  branch_counselor: "organizer",
  branch_faculty_coordinator: "organizer",
  branch_treasurer: "finance",
  branch_content: "content_editor",
  branch_webmaster: "content_editor",
  society_faculty: "organizer",
  society_chair: "organizer",
  society_vice_chair: "organizer",
  society_secretary: "organizer",
  society_treasurer: "finance",
  society_content: "content_editor",
  event_lead: "organizer",
  event_registration: "registration_staff",
  event_checkin: "checkin_staff",
  event_content: "content_editor",
  event_finance: "finance",
};

export function canonicalWorkspaceRole(roleCode: string): WorkspaceRoleCode | "" {
  if (roleCode in WORKSPACE_ROLE_DEFINITIONS) return roleCode as WorkspaceRoleCode;
  return HISTORICAL_ROLE_ALIASES[roleCode] ?? "";
}

export function roleSupportsScope(roleCode: WorkspaceRoleCode, scope: WorkspaceScopeType): boolean {
  return (WORKSPACE_ROLE_DEFINITIONS[roleCode].scopes as readonly string[]).includes(scope);
}

export const WORKSPACE_CAPABILITIES = [
  "workspace.view", "events.view", "events.create", "events.edit", "events.publish", "events.cancel", "events.archive", "events.complete", "registrations.view",
  "registrations.manage", "registrations.manual", "checkin.manage", "finance.view",
  "finance.manage", "societies.view", "societies.edit",
  "assignments.manage", "content.manage", "execom.manage", "reports.view", "technical.manage",
  "certificates.view", "certificates.manage_templates", "certificates.issue",
  "certificates.send", "certificates.revoke",
] as const;

export type WorkspaceCapability = (typeof WORKSPACE_CAPABILITIES)[number];

export interface WorkspaceAssignment {
  id: string;
  userId: string;
  /** Raw storage code; use accessRole for the simplified role vocabulary. */
  roleCode: string;
  accessRole?: WorkspaceRoleCode | "";
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
  if (path === "/admin/registrations") return has("registrations.view");
  if (path.startsWith("/admin/registrations/")) return has("registrations.view") || has("finance.view");
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
  if (workspace.branchCapabilities?.includes("finance.view")) return "/admin/payments";
  if (has("events.view")) return "/admin/events";
  if (has("societies.view")) return "/admin/societies";
  return "/admin";
}

export function roleLabel(roleCode: string): string {
  const canonical = canonicalWorkspaceRole(roleCode);
  return canonical ? WORKSPACE_ROLE_DEFINITIONS[canonical].label : roleCode.replaceAll("_", " ");
}
