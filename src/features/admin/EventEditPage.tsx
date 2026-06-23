"use client";

import { useState, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { EventForm, toDatetimeLocal } from "@/features/admin/EventForm";
import type { EventFormData, FormValues } from "@/features/admin/EventForm";

interface PageProps {
  id: string;
}

export default function EditEventPage({ id }: PageProps) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [initialData, setInitialData] = useState<EventFormData | undefined>();

  useEffect(() => {
    const abortController = new AbortController();
    fetch(`/api/admin/events/${id}`, { signal: abortController.signal })
      .then((r) => r.json())
      .then((data) => {
        if (abortController.signal.aborted) return;
        const e = data.event;
        setInitialData({
          title: e.title || "",
          description: e.description || "",
          date: e.date ? toDatetimeLocal(e.date) : "",
          endDate: e.endDate ? toDatetimeLocal(e.endDate) : "",
          venue: e.venue || "",
          societyId: e.society || "",
          price: String(e.price || 0),
          maxCapacity: e.maxCapacity ? String(e.maxCapacity) : "",
          registrationOpen: !!e.registrationOpen,
          checkInEnabled: e.checkInEnabled !== false,
          collectIeeeMember: !!e.collectIeeeMember,
          status: e.status || "draft",
          registrationStart: e.registrationStart
            ? toDatetimeLocal(e.registrationStart)
            : "",
          registrationDeadline: e.registrationDeadline
            ? toDatetimeLocal(e.registrationDeadline)
            : "",
          contactEmail: e.contactEmail || "",
          contactPhone: e.contactPhone || "",
          whatsappLink: e.whatsappLink || "",
          externalLink: e.externalLink || "",
          tags: e.tags || "",
          externalFormUrl: e.externalFormUrl || "",
          bannerUrl: e.bannerUrl || undefined,
          formTemplate: e.formTemplate || undefined,
          coupons: e.coupons || undefined,
        });
        setLoading(false);
      })
      .catch(() => {
        if (abortController.signal.aborted) return;
        setLoading(false);
      });
    return () => abortController.abort();
  }, [id]);

  const handleEdit = async (data: FormValues) => {
    const body: Record<string, unknown> = {
      title: data.title,
      description: data.description,
      date: data.date,
      endDate: data.endDate,
      venue: data.venue,
      society: data.society,
      price: data.price,
      maxCapacity: data.maxCapacity,
      registrationOpen: data.registrationOpen,
      checkInEnabled: data.checkInEnabled,
      collectIeeeMember: data.collectIeeeMember,
      status: data.status,
      registrationStart: data.registrationStart,
      registrationDeadline: data.registrationDeadline,
      contactEmail: data.contactEmail,
      contactPhone: data.contactPhone,
      whatsappLink: data.whatsappLink,
      externalLink: data.externalLink,
      tags: data.tags,
      externalFormUrl: data.externalFormUrl,
      formTemplate: data.formTemplate,
      coupons: data.coupons,
    };

    if (data.bannerFile) {
      const fd = new FormData();
      fd.append("banner", data.bannerFile);
      Object.entries(body).forEach(([key, val]) => {
        if (val !== undefined && val !== null) {
          fd.append(
            key,
            typeof val === "object" ? JSON.stringify(val) : String(val),
          );
        }
      });
      const res = await fetch(`/api/admin/events/${id}`, {
        method: "PUT",
        body: fd,
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(
          errData.error || errData.details?.message || "Failed to update event",
        );
      }
    } else {
      const res = await fetch(`/api/admin/events/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(
          errData.error || errData.details?.message || "Failed to update event",
        );
      }
    }

    toast.success("Event updated");
    navigate({ to: "/admin/events/$id", params: { id: id } });
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-8 w-8 rounded-lg" />
          <div className="space-y-1">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="rounded-xl border bg-card p-6 space-y-3">
                <Skeleton className="h-5 w-36" />
                <Skeleton className="h-4 w-56" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-32 w-full" />
              </div>
            ))}
          </div>
          <div className="space-y-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-xl border bg-card p-6 space-y-3">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <EventForm
      mode="edit"
      initialData={initialData}
      onSubmit={handleEdit}
      eventId={id}
    />
  );
}
