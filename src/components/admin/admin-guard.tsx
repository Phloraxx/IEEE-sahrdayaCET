import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { useAuth } from "@/lib/auth-context";
import { getWorkspaceMe } from "@/lib/data/workspace.client";

/**
 * Workspace gate. Authentication answers "who are you?" while /api/workspace/me
 * answers whether the person currently holds any operational assignment.
 * Server-side collection rules and command routes remain the authorization boundary.
 */
export function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user, status } = useAuth();
  const navigate = useNavigate();
  const workspace = useQuery({
    queryKey: ["workspace-me", user?.id],
    queryFn: getWorkspaceMe,
    enabled: status === "authenticated" && Boolean(user?.id),
    staleTime: 30_000,
    retry: 1,
  });

  useEffect(() => {
    if (status === "loading") return;
    if (status === "unauthenticated" || !user) {
      navigate("/", { replace: true });
      return;
    }
    if (!workspace.isLoading && !workspace.data?.hasWorkspace) {
      navigate("/", { replace: true });
    }
  }, [status, user, workspace.isLoading, workspace.data?.hasWorkspace, navigate]);

  if (status === "loading" || (user && workspace.isLoading)) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user || !workspace.data?.hasWorkspace) return null;
  return <>{children}</>;
}
