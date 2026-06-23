import { lazy, Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { RouteError } from "@/components/ErrorBoundary";

const EditExecomPage = lazy(() => import("@/features/admin/ExecomEditPage"));

export const Route = createFileRoute("/admin/execom/$id/edit")({
  component: function RouteComponent() {
    const { id } = Route.useParams();
    return (
      <Suspense fallback={<div className="p-8 text-center text-muted-foreground">Loading...</div>}>
        <EditExecomPage id={id} />
      </Suspense>
    );
  },
  errorComponent: RouteError,
});
