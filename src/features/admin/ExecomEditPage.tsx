"use client";

import { useState, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { ExecomForm } from "./ExecomForm";
import type { ExecomFormData } from "./ExecomForm";

export default function EditExecomPage({ id }: { id: string }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [initialData, setInitialData] = useState<ExecomFormData | null>(null);

  useEffect(() => {
    const abortController = new AbortController();
    Promise.all([
      fetch("/api/admin/societies", { signal: abortController.signal }).then((r) => r.json()),
      fetch(`/api/admin/execom/${id}`, { signal: abortController.signal }).then((r) => r.json()),
    ])
      .then(([_socData, memberData]) => {
        if (abortController.signal.aborted) return;
        const m = memberData.member;
        if (m) {
          setInitialData({
            name: m.name || "",
            position: m.position || "",
            department: m.department || "",
            batch: m.batch || "",
            section: m.section || "",
            sectionId: m.sectionId || "",
            order: m.order || 0,
            linkedin: m.linkedin || "",
            instagram: m.instagram || "",
            email: m.email || "",
            phone: m.phone || "",
            society: m.society || "",
          });
        }
        setLoading(false);
      })
      .catch(() => {
        if (abortController.signal.aborted) return;
        setLoading(false);
      });
    return () => abortController.abort();
  }, [id]);

  const handleSubmit = async (data: ExecomFormData) => {
    const res = await fetch(`/api/admin/execom/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...data, order: Number(data.order) || 0 }),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || "Failed to update");
    }
    toast.success("Member updated");
    navigate({ to: "/admin/execom" });
  };

  if (loading) {
    return (
      <div className="space-y-4 max-w-2xl">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  return (
    <ExecomForm mode="edit" initialData={initialData ?? undefined} onSubmit={handleSubmit} />
  );
}
