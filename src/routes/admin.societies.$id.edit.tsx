import { lazy, Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { RouteError } from "@/components/ErrorBoundary";

const SocietyEditPage = lazy(() => import("@/features/admin/SocietyEditPage"));

export const Route = createFileRoute("/admin/societies/$id/edit")({
  component: function RouteComponent() {
    const { id } = Route.useParams();
    return (
      <Suspense fallback={<div className="p-8 text-center text-muted-foreground">Loading...</div>}>
        <SocietyEditPage id={id} />
      </Suspense>
    );
  },
  errorComponent: RouteError,
});
