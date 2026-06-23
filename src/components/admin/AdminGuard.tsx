"use client";

// Secondary client-side guard (defense in depth).
// Primary authorization is enforced by the route `beforeLoad` in admin.tsx,
// which redirects unauthenticated users before any loaders fire.
// This component only gates rendering — no navigate() call to avoid redirect loops.

import { useAuth } from "@/lib/auth-context";

export default function AdminGuard({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, status } = useAuth();

  if (status === "loading") {
    return null;
  }

  if (!user || (user.role !== "admin" && user.role !== "chair")) {
    return null;
  }

  return <>{children}</>;
}
