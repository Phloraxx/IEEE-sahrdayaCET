"use client";

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
    if (typeof window !== "undefined") {
      window.location.href = "/";
    }
    return null;
  }

  return <>{children}</>;
}
