"use client";

import { useNavigate, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { SocietyForm } from "./SocietyForm";
import type { SocietyFormSubmitData } from "./SocietyForm";

export default function NewSocietyPage() {
  const navigate = useNavigate();

  const handleSubmit = async (data: SocietyFormSubmitData) => {
    const fd = new FormData();
    fd.append("name", data.name);
    fd.append("slug", data.slug);
    fd.append("bio", data.bio);
    fd.append("isHidden", String(data.isHidden));
    fd.append("chairs", JSON.stringify(data.chairs));
    if (data.defaultWhatsappLink)
      fd.append("defaultWhatsappLink", data.defaultWhatsappLink);
    if (data.logoFile) fd.append("logo", data.logoFile);
    if (data.bannerFile) fd.append("banner", data.bannerFile);

    const res = await fetch("/api/admin/societies", {
      method: "POST",
      body: fd,
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || "Failed to create society");
    }

    const json = await res.json();
    toast.success("Society created");
    navigate({ to: "/admin/societies/$id", params: { id: json.society.id } });
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-4">
        <Link
          to="/admin/societies"
          className="inline-flex items-center justify-center rounded-lg border border-border p-2 text-muted-foreground hover:bg-muted transition-colors"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Create Society</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Add a new IEEE society
          </p>
        </div>
      </div>

      <SocietyForm mode="create" onSubmit={handleSubmit} />
    </div>
  );
}
