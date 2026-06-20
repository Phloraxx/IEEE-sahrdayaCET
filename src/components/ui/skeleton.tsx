import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "rounded-md bg-[var(--ink-border-light,#e8e4dc)]",
        "bg-[linear-gradient(90deg,var(--ink-border-light,#e8e4dc)_0%,#f0ede7_50%,var(--ink-border-light,#e8e4dc)_100%)]",
        "bg-[length:200%_100%]",
        "animate-[editorial-shimmer_1.5s_ease-in-out_infinite]",
        className
      )}
      {...props}
    />
  )
}

export { Skeleton }
