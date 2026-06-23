"use client";

import { useNavigate, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { ExecomForm } from "./ExecomForm";
import type { ExecomFormData } from "./ExecomForm";

export default function NewExecomPage() {
  const navigate = useNavigate();

  const handleSubmit = async (data: ExecomFormData) => {
    const res = await fetch("/api/admin/execom", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...data, order: Number(data.order) || 0 }),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || "Failed to create");
    }
    toast.success("Member created");
    navigate({ to: "/admin/execom" });
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-4">
        <Link
          to="/admin/execom"
          className="inline-flex items-center justify-center rounded-lg border border-border p-2 text-muted-foreground hover:bg-muted transition-colors"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Add Execom Member
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Add a new executive committee member
          </p>
        </div>
      </div>

      <ExecomForm mode="create" onSubmit={handleSubmit} />
    </div>
  );
}
