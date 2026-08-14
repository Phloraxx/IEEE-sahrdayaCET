import { Navigate } from "react-router";
import { useAuth } from "@/lib/auth-context";

export default function AdminIndex() {
  const { user } = useAuth();
  return <Navigate to={user?.role === "content" ? "/admin/blogs" : "/admin/dashboard"} replace />;
}
