import { cn } from "@/lib/utils";

type CalloutTone = "info" | "warning" | "danger" | "success";

const toneClasses: Record<CalloutTone, string> = {
  info: "border-info/30 bg-info/5 text-info",
  warning: "border-warning/30 bg-warning/5 text-warning",
  danger: "border-danger/30 bg-danger/5 text-danger",
  success: "border-success/30 bg-success/5 text-success",
};

export function Callout({
  tone = "info",
  children,
}: {
  tone?: CalloutTone;
  children: React.ReactNode;
}) {
  const role = tone === "warning" || tone === "danger" ? "alert" : "note";
  return (
    <div role={role} className={cn("rounded-lg border p-4", toneClasses[tone])}>
      {children}
    </div>
  );
}
