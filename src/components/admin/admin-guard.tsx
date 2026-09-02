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
    if (workspace.isSuccess && !workspace.data?.hasWorkspace) {
      navigate("/", { replace: true });
    }
  }, [status, user, workspace.isSuccess, workspace.data?.hasWorkspace, navigate]);

  if (status === "loading" || (user && workspace.isLoading)) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (workspace.isError) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-sm text-muted-foreground">Could not verify your Workspace access.</p>
        <button
          type="button"
          onClick={() => void workspace.refetch()}
          className="rounded-md border px-4 py-2 text-sm font-medium"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!user || !workspace.data?.hasWorkspace) return null;
  return <>{children}</>;
}
