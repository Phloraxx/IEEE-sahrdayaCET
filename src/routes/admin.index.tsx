import { useQuery } from "@tanstack/react-query";
import { Navigate } from "react-router";
import { useAuth } from "@/lib/auth-context";
import { getWorkspaceMe } from "@/lib/data/workspace.client";
import { preferredWorkspacePath } from "@/lib/workspace-permissions";

export default function AdminIndex() {
  const { user } = useAuth();
  const workspace = useQuery({
    queryKey: ["workspace-me", user?.id],
    queryFn: getWorkspaceMe,
    enabled: Boolean(user?.id),
    staleTime: 30_000,
  });
  if (!workspace.data) return null;
  return <Navigate to={preferredWorkspacePath(workspace.data)} replace />;
}
