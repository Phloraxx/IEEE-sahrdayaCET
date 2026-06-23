import { lazy, Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { RouteError } from "@/components/ErrorBoundary";

const UserDetailPage = lazy(() => import("@/features/admin/UserDetailPage"));

export const Route = createFileRoute("/admin/users/$id")({
  component: function RouteComponent() {
    const { id } = Route.useParams();
    return (
      <Suspense fallback={<div className="p-8 text-center text-muted-foreground">Loading...</div>}>
        <UserDetailPage id={id} />
      </Suspense>
    );
  },
  errorComponent: RouteError,
});
