"use client";

import { useAuth } from "@/lib/auth-context";
import { Link } from "@tanstack/react-router";

export default function AdminGuard({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, status } = useAuth();

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center px-4">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-[#00629B] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user || (user.role !== "admin" && user.role !== "chair")) {
    return (
      <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-red-100 flex items-center justify-center">
            <span className="text-2xl font-bold text-red-600">!</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h1>
          <p className="text-gray-500 mb-6">You need admin or chair privileges to access this page.</p>
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-6 py-3 bg-[#00629B] text-white rounded-full font-bold text-sm hover:bg-[#004a7c] transition-colors"
          >
            Go Home
          </Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
