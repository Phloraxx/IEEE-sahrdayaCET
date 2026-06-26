import { cn } from "@/lib/utils";

interface FormSectionProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * Reusable section wrapper for admin forms.
 * Renders a title, optional description, and children in a grid.
 * Used inside Card components to group related fields.
 */
export function FormSection({
  title,
  description,
  children,
  className,
}: FormSectionProps) {
  return (
    <section
      className={cn(
        "grid gap-4 border-b border-border pb-6 last:border-b-0 last:pb-0",
        className,
      )}
    >
      <div>
        <h2 className="text-sm font-semibold tracking-tight text-foreground">
          {title}
        </h2>
        {description && (
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      <div className="grid gap-4">{children}</div>
    </section>
  );
}
