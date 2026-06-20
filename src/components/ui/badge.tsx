import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-all uppercase tracking-[0.06em] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default: "rounded-[4px] border border-[#c14a3a] bg-[#f5e6e3] text-[#c14a3a] font-semibold",
        secondary:
          "rounded-[4px] border border-[#2e7d5e] bg-[#e8f3ee] text-[#2e7d5e] font-semibold",
        destructive:
          "rounded-[4px] border border-[#b33a2a] bg-[#f5e3e0] text-[#b33a2a] font-semibold",
        outline:
          "rounded-[4px] border border-[#ddd8d0] text-[#6b655a] font-semibold",
        accent:
          "rounded-[4px] border border-[#c14a3a] bg-[#f5e6e3] text-[#c14a3a] font-semibold",
        success:
          "rounded-[4px] border border-[#2e7d5e] bg-[#e8f3ee] text-[#2e7d5e] font-semibold",
        warning:
          "rounded-[4px] border border-[#b8860b] bg-[#f8f0e0] text-[#b8860b] font-semibold",
        ghost:
          "hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted/50",
        link: "text-primary underline-offset-4 hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  })
}

export { Badge, badgeVariants }
