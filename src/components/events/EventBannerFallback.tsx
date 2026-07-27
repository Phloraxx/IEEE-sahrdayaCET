import type { ComponentType } from "react";
import { Activity, Bot, CalendarDays, Code2, Cpu, Flame } from "lucide-react";

interface EventBannerFallbackProps {
  title: string;
  societyName?: string;
  societySlug?: string;
  className?: string;
  showTitle?: boolean;
}

const SOCIETY_GRADIENTS: Record<string, string> = {
  cs: "from-[#071b33] via-[#00629B] to-[#00A4E4]",
  css: "from-[#071b33] via-[#0f5f8f] to-[#0ea5e9]",
  cas: "from-[#1e1b4b] via-[#4338ca] to-[#818cf8]",
  embs: "from-[#3f0d12] via-[#9f1239] to-[#fb7185]",
  ies: "from-[#042f2e] via-[#0f766e] to-[#2dd4bf]",
  ias: "from-[#172554] via-[#1d4ed8] to-[#38bdf8]",
  npss: "from-[#111827] via-[#4338ca] to-[#a78bfa]",
  pes: "from-[#052e16] via-[#15803d] to-[#84cc16]",
  ps: "from-[#3b0764] via-[#7e22ce] to-[#d946ef]",
  ras: "from-[#111827] via-[#6d28d9] to-[#2563eb]",
  sight: "from-[#431407] via-[#c2410c] to-[#f59e0b]",
  sps: "from-[#172554] via-[#1d4ed8] to-[#0891b2]",
  wie: "from-[#4a044e] via-[#a21caf] to-[#ec4899]",
  edsoc: "from-[#172554] via-[#0369a1] to-[#22d3ee]",
};

function iconForTitle(title: string): ComponentType<{ className?: string }> {
  const value = title.toLowerCase();
  if (value.includes("fire") || value.includes("safety")) return Flame;
  if (value.includes("robo") || value.includes("robot")) return Bot;
  if (value.includes("bio") || value.includes("medical") || value.includes("health")) return Activity;
  if (value.includes("signal")) return Activity;
  if (
    value.includes("cuda") ||
    value.includes("hardware") ||
    value.includes("pcb") ||
    value.includes("microcontroller") ||
    value.includes("circuit")
  ) return Cpu;
  if (
    value.includes("ai") ||
    value.includes("data") ||
    value.includes("cyber") ||
    value.includes("ui/ux") ||
    value.includes("startup")
  ) return Code2;
  return CalendarDays;
}

export function EventBannerFallback({
  title,
  societyName,
  societySlug,
  className = "",
  showTitle = true,
}: EventBannerFallbackProps) {
  const Icon = iconForTitle(title);
  const gradient = SOCIETY_GRADIENTS[societySlug?.toLowerCase() || ""] ||
    "from-[#071b33] via-[#00629B] to-[#2563eb]";

  return (
    <div
      role="img"
      aria-label={`${title} event artwork`}
      className={`relative isolate h-full w-full overflow-hidden bg-linear-to-br ${gradient} text-white ${className}`}
    >
      <div
        className="absolute inset-0 opacity-[0.14]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,.26) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.26) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />
      <div className="absolute -right-16 -top-20 h-56 w-56 rounded-full border border-white/20 bg-white/5" />
      <div className="absolute -right-6 -top-10 h-36 w-36 rounded-full border border-white/15" />
      <div className="absolute -bottom-20 -left-14 h-52 w-52 rounded-full border border-white/20 bg-black/5" />
      <div className="absolute inset-x-0 bottom-0 h-2/3 bg-linear-to-t from-black/35 to-transparent" />

      <div className="relative z-10 flex h-full flex-col justify-between p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <span className="rounded-full border border-white/25 bg-black/15 px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.18em] backdrop-blur-sm">
            IEEE Sahrdaya
          </span>
          <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/20 bg-white/10 backdrop-blur-sm">
            <Icon className="h-5 w-5" />
          </span>
        </div>

        {showTitle && (
          <div className="max-w-[90%]">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-white/70">
              {societyName || "Student Branch Event"}
            </p>
            <p className="line-clamp-3 text-xl font-black leading-tight tracking-tight drop-shadow-sm sm:text-2xl">
              {title}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
