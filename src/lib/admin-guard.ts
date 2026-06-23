import { createServerFn } from "@tanstack/react-start"
import { getRequestHeader } from "@tanstack/react-start/server"
import { createPB } from "@/lib/pb"
import { requireRole } from "@/lib/auth"

/**
 * Server-side auth guard for admin route beforeLoad.
 * Uses createServerFn so the handler tree-shakes from client bundles.
 */
export const checkAdminAccess = createServerFn().handler(async () => {
  const cookie = getRequestHeader("cookie") || ""
  const pb = createPB(cookie)
  await requireRole(["admin", "chair"], pb)
})
