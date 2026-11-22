import { getPbClient } from "@/lib/pb-client";

export type HealthSeverity = "critical" | "warning";

export interface DataHealthIssue {
  id: string;
  severity: HealthSeverity;
  category: string;
  title: string;
  detail: string;
  href?: string;
}

export interface DataHealthReport {
  issues: DataHealthIssue[];
  checkedAt: string;
  counts: {
    users: number;
    events: number;
    registrations: number;
    societies: number;
    organizationAssignments: number;
    paymentAttempts: number;
    auditLogEntries: number;
  };
  integrity: string;
  foreignKeyViolations: number;
  paidWithoutTicket: number;
}

/**
 * `GET /api/admin/data-health`.
 *
 * There is deliberately no client-side role check. The session cookie is
 * HttpOnly, so `pb.authStore.record` is always null and a `role !== "admin"`
 * guard throws for everyone — including admins. The server already enforces
 * `reports.view` and answers 403, so the pre-check cannot work and is not needed.
 */
export async function getAdminDataHealth(): Promise<DataHealthReport> {
  const pb = getPbClient();
  return pb.send("/api/admin/data-health", { method: "GET" }) as Promise<DataHealthReport>;
}
