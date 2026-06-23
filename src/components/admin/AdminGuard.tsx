"use client";
// Secondary client-side guard (defense in depth).
// Primary authorization is enforced by the route `beforeLoad` in admin.tsx,
// which redirects unauthenticated users before any loaders fire.

import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { useNavigate } from "@tanstack/react-router";

export default function AdminGuard({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, status } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (
      status !== "loading" &&
      (!user || (user.role !== "admin" && user.role !== "chair"))
    ) {
      navigate({ to: "/" });
    }
  }, [user, status, navigate]);

  if (status === "loading") {
    return null;
  }

  if (!user || (user.role !== "admin" && user.role !== "chair")) {
    return null;
  }

  return <>{children}</>;
}
