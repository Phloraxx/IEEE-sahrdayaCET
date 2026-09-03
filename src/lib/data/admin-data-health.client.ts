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
    events: number;
    registrations: number;
    coupons: number;
    notifications: number;
    payments: number;
    refunds: number;
    webhooks: number;
  };
}

export async function getAdminDataHealth(): Promise<DataHealthReport> {
  const pb = getPbClient();
  const role = String(pb.authStore.record?.role || "");
  if (role !== "admin") throw new Error("Administrator access required");

  return pb.send("/api/admin/data-health", { method: "GET" }) as Promise<DataHealthReport>;
}
