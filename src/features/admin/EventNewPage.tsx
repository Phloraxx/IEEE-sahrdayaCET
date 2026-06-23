"use client";

import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { EventForm } from "@/features/admin/EventForm";
import type { FormValues } from "@/features/admin/EventForm";

export default function NewEventPage() {
  const navigate = useNavigate();

  const handleCreate = async (data: FormValues) => {
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

    const res = await fetch("/api/admin/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.error || "Failed to create event");
    }

    const result = await res.json();
    const eventId = result.event.id;

    // Upload banner if present
    if (data.bannerFile) {
      const formData = new FormData();
      formData.append("banner", data.bannerFile);
      await fetch(`/api/admin/events/${eventId}`, {
        method: "PUT",
        body: formData,
      }).catch(() => {
        /* banner upload is non-critical */
      });
    }

    toast.success("Event created");
    navigate({ to: `/admin/events/${eventId}` });
  };

  return <EventForm mode="create" onSubmit={handleCreate} />;
}
