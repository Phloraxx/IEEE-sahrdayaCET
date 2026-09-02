import type { ReactNode } from "react";

interface HomeSectionHeadingProps {
  index: string;
  label: string;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  inverse?: boolean;
}

export function HomeSectionHeading({
  index,
  label,
  title,
  description,
  action,
  inverse = false,
}: HomeSectionHeadingProps) {
  const muted = inverse ? "text-white/50" : "text-gray-500";
  const rule = inverse ? "border-white/15" : "border-gray-200";

  return (
    <div className={`grid gap-7 border-t ${rule} pt-5 md:grid-cols-12 md:items-end md:gap-8`}>
      <div className="md:col-span-8">
        <div className="flex items-center gap-3">
          <span className={`font-pixel text-[10px] ${inverse ? "text-[#58c6ff]" : "text-ieee-blue"}`}>{index}</span>
          <span className={`font-mono text-[9px] font-semibold uppercase tracking-[0.2em] ${muted}`}>{label}</span>
        </div>
        <h2 className={`mt-5 max-w-4xl text-4xl font-bold leading-[0.98] tracking-[-0.045em] sm:text-5xl lg:text-6xl ${inverse ? "text-white" : "text-gray-950"}`}>
          {title}
        </h2>
      </div>
      {(description || action) && (
        <div className="flex flex-col items-start gap-5 md:col-span-4 md:items-start">
          {description ? <div className={`max-w-sm text-sm leading-6 sm:text-base ${muted}`}>{description}</div> : null}
          {action}
        </div>
      )}
    </div>
  );
}
