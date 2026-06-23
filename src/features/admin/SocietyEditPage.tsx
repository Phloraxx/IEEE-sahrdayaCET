"use client";

import { useState, useEffect } from "react";
import { useNavigate, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { SocietyForm } from "./SocietyForm";
import type { SocietyFormSubmitData } from "./SocietyForm";

interface PageProps {
  id: string;
}

export default function EditSocietyPage({ id }: PageProps) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [initialData, setInitialData] = useState<{
    name: string;
    slug: string;
    bio: string;
    defaultWhatsappLink: string;
    isHidden: boolean;
    chairs: string[];
    logoUrl?: string;
    bannerUrl?: string;
  } | null>(null);
  const [societyId, setSocietyId] = useState<string>("");

  useEffect(() => {
    const abortController = new AbortController();
    setSocietyId(id);
    fetch(`/api/admin/societies/${id}`, { signal: abortController.signal })
      .then((r) => r.json())
      .then((data) => {
        if (abortController.signal.aborted) return;
        const s = data.society;
        setInitialData({
          name: s.name || "",
          slug: s.slug || "",
          bio: s.bio || "",
          defaultWhatsappLink: s.defaultWhatsappLink || "",
          isHidden: !!s.isHidden,
          chairs: (s.chairs as string[]) || [],
          logoUrl: s.logoUrl,
          bannerUrl: s.bannerUrl,
        });
        setLoading(false);
      })
      .catch(() => {
        if (abortController.signal.aborted) return;
        setLoading(false);
      });
    return () => abortController.abort();
  }, [id]);

  const handleSubmit = async (data: SocietyFormSubmitData) => {
    const body: Record<string, unknown> = {
      name: data.name,
      slug: data.slug,
      bio: data.bio,
      defaultWhatsappLink: data.defaultWhatsappLink,
      isHidden: data.isHidden,
      chairs: data.chairs,
    };

    if (data.logoFile || data.bannerFile) {
      const fd = new FormData();
      Object.entries(body).forEach(([key, val]) => {
        fd.append(
          key,
          typeof val === "object" ? JSON.stringify(val) : String(val),
        );
      });
      if (data.logoFile) fd.append("logo", data.logoFile);
      if (data.bannerFile) fd.append("banner", data.bannerFile);
      const res = await fetch(`/api/admin/societies/${societyId}`, {
        method: "PUT",
        body: fd,
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to update society");
      }
    } else {
      const res = await fetch(`/api/admin/societies/${societyId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to update society");
      }
    }
    navigate({ to: "/admin/societies/$id", params: { id: societyId } });
  };

  if (loading) {
    return (
      <div className="space-y-6 max-w-2xl">
        <div className="flex items-center gap-4">
          <Skeleton className="h-8 w-8 rounded-lg" />
          <div className="space-y-1">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <div className="rounded-xl border bg-card p-6 space-y-3">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
        <div className="rounded-xl border bg-card p-6 space-y-3">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-4">
        <Link
          to="/admin/societies/$id"
          params={{ id: societyId }}
          className="inline-flex items-center justify-center rounded-lg border border-border p-2 text-muted-foreground hover:bg-muted transition-colors"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Edit Society</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {initialData?.name || ""}
          </p>
        </div>
      </div>

      {initialData && (
        <SocietyForm
          mode="edit"
          initialData={initialData}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  );
}
