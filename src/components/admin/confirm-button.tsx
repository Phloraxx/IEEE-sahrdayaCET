import { AlertTriangle, Check, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface ConfirmButtonProps {
  label: string;
  confirmMessage?: string;
  onConfirm?: () => boolean | undefined;
  variant?: "outline" | "destructive";
  className?: string;
  disabled?: boolean;
  icon?: React.ReactNode;
}

export function ConfirmButton({
  label,
  confirmMessage = "Are you sure?",
  onConfirm,
  variant = "outline",
  className = "",
  disabled = false,
  icon,
}: ConfirmButtonProps) {
  const [confirming, setConfirming] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (confirming) cancelRef.current?.focus();
  }, [confirming]);

  useEffect(() => {
    if (!confirming || !containerRef.current) return;
    const el = containerRef.current;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setConfirming(false);
    };
    el.addEventListener("keydown", handleKey);
    return () => el.removeEventListener("keydown", handleKey);
  }, [confirming]);

  const handleInitialClick = (e: React.MouseEvent) => {
    e.preventDefault();
    setConfirming(true);
  };

  const handleConfirm = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (onConfirm && onConfirm() === false) {
      setConfirming(false);
      return;
    }
    e.currentTarget.form?.requestSubmit();
  };

  const handleCancel = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setConfirming(false);
  };

  if (confirming) {
    return (
      <div
        className={cn(
          "animate-vh-pop-in flex items-center gap-2 rounded-md border border-danger/30 bg-danger/8 p-2",
          className,
        )}
        ref={containerRef}
        role="alertdialog"
        aria-label={`Confirm: ${confirmMessage}`}
      >
        <AlertTriangle className="h-4 w-4 shrink-0 text-danger" />
        <span className="flex-1 text-xs font-medium text-danger">
          {confirmMessage}
        </span>
        <button
          type="button"
          className="inline-flex h-7 items-center gap-1 rounded-md bg-danger px-2.5 text-xs font-medium text-danger-foreground hover:opacity-90"
          onClick={handleConfirm}
        >
          <Check className="h-3 w-3" />
          Confirm
        </button>
        <button
          ref={cancelRef}
          type="button"
          className="inline-flex h-7 items-center gap-1 rounded-md border border-border px-2.5 text-xs font-medium hover:bg-muted"
          onClick={handleCancel}
        >
          <X className="h-3 w-3" />
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-medium hover:bg-muted disabled:opacity-50",
        variant === "destructive" &&
          "border-danger/30 text-danger hover:bg-danger/8",
        className,
      )}
      disabled={disabled}
      onClick={handleInitialClick}
    >
      {icon}
      {label}
    </button>
  );
}
