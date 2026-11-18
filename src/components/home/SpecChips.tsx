/**
 * Quiet spec chips: a pixel numeral with a mono uppercase label on a light
 * rounded fill, the way mistral.ai lists model figures (`1.05T`, `52 ACTIVE`).
 * Shared by the homepage figure rows so the pattern has one definition.
 */
export interface SpecChipItem {
  value: string | number;
  label: string;
}

export function SpecChips({ items, className = "" }: { items: readonly SpecChipItem[]; className?: string }) {
  return (
    <div className={`flex flex-wrap justify-center gap-1.5 ${className}`}>
      {items.map((item) => (
        <span key={item.label} className="inline-flex items-baseline gap-1.5 rounded-md bg-gray-100 px-2 py-1.5">
          <strong className="font-pixel text-[11px] leading-none text-gray-900">
            {typeof item.value === "number" ? String(item.value).padStart(2, "0") : item.value}
          </strong>
          <span className="font-mono text-[9px] font-semibold uppercase leading-none tracking-[0.08em] text-gray-600">
            {item.label}
          </span>
        </span>
      ))}
    </div>
  );
}
