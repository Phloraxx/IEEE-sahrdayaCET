import { Menu } from "lucide-react";
import { cn } from "@/lib/utils";

interface AdminTopbarProps {
  onOpenSidebar: (e: React.MouseEvent<HTMLElement>) => void;
  sidebarOpen: boolean;
  isNavigating: boolean;
}

export function AdminTopbar({
  onOpenSidebar,
  sidebarOpen,
  isNavigating,
}: AdminTopbarProps) {
  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 lg:hidden vh-safe-top">
        <button
          type="button"
          className="vh-touch flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
          onClick={onOpenSidebar}
          aria-label="Open sidebar"
          aria-expanded={sidebarOpen}
          aria-controls="primary-sidebar"
        >
          <Menu className="h-4 w-4" />
        </button>
        <span className="text-sm font-semibold tracking-tight text-foreground">
          IEEE Admin
        </span>
      </header>

      {/* Loading bar — pulses while a navigation is in flight */}
      <div
        className={cn(
          "fixed inset-x-0 top-0 z-50 h-0.5 bg-primary/15 transition-opacity duration-300 lg:left-64",
          isNavigating ? "opacity-100" : "opacity-0",
        )}
        aria-hidden="true"
      >
        <div className="loading-bar-fill h-full w-1/3 bg-primary" />
      </div>
    </>
  );
}
