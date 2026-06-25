"use client";

import { useState, useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { buildFileUrl } from "@/lib/pb";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/dates";
 

export default function UserDetailPage({ id }: { id: string }) {
  const [user, setUser] = useState<{
    name: string;
    email: string;
    role: string;
    avatar: string;
    created: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const abortController = new AbortController();
    setUser(null);
    setLoading(true);
    setError(null);
    fetch(`/api/admin/users?id=${id}`, { signal: abortController.signal })
      .then((r) => r.json())
      .then((data) => {
        if (abortController.signal.aborted) return;
        const u = (data.users || [])[0];
        if (u) {
          setUser(u);
          setEditName(u.name || "");
          setEditEmail(u.email || "");
        } else {
          setError("User not found");
        }
        setLoading(false);
      })
      .catch((err) => {
        if (err.name === "AbortError") return;
        setError("Failed to load user");
        setLoading(false);
      });
    return () => abortController.abort();
  }, [id]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, name: editName, email: editEmail }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update");
      }
      setUser((prev) =>
        prev ? { ...prev, name: editName, email: editEmail } : prev,
      );
      toast.success("User updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update");
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="space-y-4 max-w-lg">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border bg-card p-5">
            <Skeleton className="h-5 w-32 mb-3" />
            <Skeleton className="h-8 w-full" />
          </div>
        ))}
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="p-12 text-center text-sm text-muted-foreground">
        {error || "User not found."}
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-lg">
      <div className="flex items-center gap-4">
        <Link
          to="/admin/users"
          className="inline-flex items-center justify-center rounded-lg border border-border p-2 text-muted-foreground hover:bg-muted transition-colors"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Edit User</h1>
          <p className="text-sm text-muted-foreground mt-1">{user.email}</p>
        </div>
        <span
          className={`px-2.5 py-0.5 rounded text-xs font-medium ${
            user.role === "admin"
              ? "bg-red-50 text-red-700 border border-red-200"
              : user.role === "chair"
                ? "bg-yellow-50 text-yellow-700 border border-yellow-200"
                : "bg-muted text-muted-foreground border border-border"
          }`}
        >
          {user.role}
        </span>
      </div>

      <div className="rounded-xl border bg-card p-6 space-y-4">
        {/* Avatar preview */}
        {user.avatar && id && (
          <div className="flex justify-center mb-4">
            <img
              src={buildFileUrl("users", id, user.avatar) || undefined}
              alt="Avatar"
              className="size-20 rounded-full object-cover border-2 border-border"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
          </div>
        )}
        <div className="space-y-2">
          <label className="text-sm font-medium">Name</label>
          <input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring/50"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Email</label>
          <input
            value={editEmail}
            onChange={(e) => setEditEmail(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring/50"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Role</label>
          <select
            value={user.role}
            onChange={(e) =>
              setUser((prev) =>
                prev ? { ...prev, role: e.target.value } : prev,
              )
            }
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring/50"
          >
            <option value="user">User</option>
            <option value="chair">Chair</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <div className="text-xs text-muted-foreground">
          Joined:{" "}
          {formatDate(user.created || "")}
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/80 px-6 py-2.5 text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {saving ? (
          <>
            <Loader2 className="size-4 mr-2 animate-spin" /> Saving...
          </>
        ) : (
          "Save Changes"
        )}
      </button>
    </div>
  );
}
