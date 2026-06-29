import { createFileRoute } from "@tanstack/react-router";
import { createPB } from "@/lib/pb.server"
import { requireAuth, AuthError } from "@/lib/auth";
import { logError } from "@/lib/logger";
export const Route = createFileRoute("/api/auth/me")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const pb = createPB(request.headers.get("cookie") || undefined);
          if (!pb.authStore.isValid) {
            return Response.json(
              { error: "Not authenticated" },
              { status: 401 },
            );
          }
          const { user } = await requireAuth(pb);
          return Response.json({ user });
        } catch (error) {
          if (error instanceof AuthError) {
            return Response.json(
              { error: error.message },
              { status: error.status },
            );
          }
          logError("auth-me", error);
          return Response.json(
            { error: "Internal server error" },
            { status: 500 },
          );
        }
      },
    },
  },
});
