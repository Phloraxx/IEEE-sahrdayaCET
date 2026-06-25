import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Menu } from "lucide-react";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { Toaster } from "@/components/ui/sonner";
import AdminGuard from "@/components/admin/AdminGuard";
import { AdminKeyboardShortcuts } from "@/components/admin/KeyboardShortcuts";
import { PageTransition } from "@/components/admin/PageTransition";

export const Route = createFileRoute("/admin")({
  component: AdminLayout,
  errorComponent: ({ error }: { error: Error }) => (
    <div className="flex items-center justify-center min-h-screen p-8">
      <div className="text-center">
        <h2 className="text-xl font-bold mb-2">Something went wrong</h2>
        <p className="text-muted-foreground mb-4">{error.message}</p>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/80 transition-colors"
        >
          Try again
        </button>
      </div>
    </div>
  ),
});

/**
 * Theme hydration script — prevents flash of wrong theme.
 * Reads localStorage before paint and applies .dark class.
 */
const THEME_SCRIPT = `
(function() {
  try {
    var t = localStorage.getItem('ieee-theme');
    if (t === 'dark' || (!t && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.documentElement.classList.add('dark');
    }
  } catch(e) {}
})()
`;

function AdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Inject theme script once
  useEffect(() => {
    const script = document.createElement("script");
    script.textContent = THEME_SCRIPT;
    document.head.appendChild(script);
    return () => {
      document.head.removeChild(script);
    };
  }, []);

  return (
    <AdminGuard>
      <AdminKeyboardShortcuts />
      <div className="flex vh-h-screen-dynamic overflow-hidden bg-background text-foreground">
        <AdminSidebar
          sidebarOpen={sidebarOpen}
          setSidebarOpen={setSidebarOpen}
        />

        {/* Main area */}
        <div className="flex flex-1 flex-col lg:pl-64">
          {/* Mobile header */}
          <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 lg:hidden vh-safe-top">
            <button
              type="button"
              className="vh-touch flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open sidebar"
              aria-expanded={sidebarOpen}
              aria-controls="primary-sidebar"
            >
              <Menu className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-2">
              <img
                src="/favicon.svg"
                alt="IEEE"
                className="h-5 w-auto"
                style={{ filter: "brightness(0) invert(1)" }}
              />
              <span className="text-sm font-medium">IEEE SB Admin</span>
            </div>
          </header>

          {/* Loading bar */}
          <LoadingBar />

          {/* Content */}
          <main
            id="primary-content"
            tabIndex={-1}
            className="flex-1 overflow-y-auto focus:outline-none"
          >
            <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-5 sm:py-8 md:px-8 md:py-10">
              <PageTransition>
                <Outlet />
              </PageTransition>
            </div>
          </main>
        </div>
      </div>
      <Toaster />
    </AdminGuard>
  );
}

/**
 * Loading bar — shows during navigation.
 * Reads TanStack Router's navigation state from DOM as a simple approach.
 */
function LoadingBar() {
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // TanStack Router doesn't expose navigation state globally like React Router.
    // We use a MutationObserver on the document to detect route changes.
    // Alternative: use useNavigation() if available in the route context.
    const handleStart = () => setLoading(true);
    const handleEnd = () => setLoading(false);

    // Listen for popstate and pushstate
    const origPush = history.pushState;
    const origReplace = history.replaceState;

    history.pushState = function (...args) {
      origPush.apply(this, args);
      handleStart();
      setTimeout(handleEnd, 300);
    };
    history.replaceState = function (...args) {
      origReplace.apply(this, args);
    };

    window.addEventListener("popstate", handleStart);
    // Clear loading after a short delay
    const interval = setInterval(() => {
      if (loading) setTimeout(handleEnd, 200);
    }, 500);

    return () => {
      history.pushState = origPush;
      history.replaceState = origReplace;
      window.removeEventListener("popstate", handleStart);
      clearInterval(interval);
    };
  }, [loading]);

  return (
    <div
      className={`fixed inset-x-0 top-0 z-50 h-0.5 bg-primary/15 transition-opacity duration-300 lg:left-64 ${
        loading ? "opacity-100" : "opacity-0"
      }`}
      aria-hidden="true"
    >
      <div className="loading-bar-fill h-full w-1/3 bg-primary" />
    </div>
  );
}
