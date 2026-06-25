import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";

/**
 * Client-side auth guard for admin routes.
 * Redirects to / if user is not authenticated or lacks admin/chair role.
 */
export function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user, status } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (status === "loading") return;
    if (status === "unauthenticated" || !user) {
      navigate({ to: "/" });
      return;
    }
    if (user.role !== "admin" && user.role !== "chair") {
      navigate({ to: "/" });
    }
  }, [status, user, navigate]);

  if (status === "loading") {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user || (user.role !== "admin" && user.role !== "chair")) {
    return null;
  }

  return <>{children}</>;
}
