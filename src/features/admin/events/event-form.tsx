import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EVENT_STATUS } from "@/lib/constants";

interface SocietyOption {
  id: string;
  name: string;
}

interface EventFormState {
  title: string;
  description: string;
  date: string;
  endDate: string;
  venue: string;
  price: string;
  maxCapacity: string;
  status: string;
  society: string;
  registrationOpen: boolean;
  registrationDeadline: string;
  contactEmail: string;
  contactPhone: string;
  externalLink: string;
}

const EMPTY_STATE: EventFormState = {
  title: "",
  description: "",
  date: "",
  endDate: "",
  venue: "",
  price: "0",
  maxCapacity: "",
  status: "draft",
  society: "",
  registrationOpen: false,
  registrationDeadline: "",
  contactEmail: "",
  contactPhone: "",
  externalLink: "",
};

function toLocalInput(dateString: string | undefined): string {
  if (!dateString) return "";
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toIso(value: string): string | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

function csrfToken(): string {
  if (typeof document === "undefined") return "";
  return (
    document.cookie
      .split("; ")
      .find((c) => c.startsWith("csrf="))
      ?.split("=")[1] ?? ""
  );
}

interface EventFormProps {
  mode: "create" | "edit";
  eventId?: string;
}

export function EventForm({ mode, eventId }: EventFormProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isEdit = mode === "edit";
  const [form, setForm] = useState<EventFormState>(EMPTY_STATE);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const { data: societies } = useQuery<{ societies: SocietyOption[] }>({
    queryKey: ["admin-societies-options"],
    queryFn: async () => {
      const res = await fetch("/api/admin/societies?perPage=200", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load societies");
      return res.json();
    },
    staleTime: 60_000,
  });

  const { data: existing, isLoading: existingLoading } = useQuery<{
    event: Record<string, unknown>;
  }>({
    queryKey: ["admin-event", eventId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/events/${eventId}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load event");
      return res.json();
    },
    enabled: isEdit && Boolean(eventId),
  });

  useEffect(() => {
    if (!isEdit) return;
    if (existing?.event) {
      const e = existing.event as Record<string, unknown>;
      setForm({
        title: String(e.title ?? ""),
        description: String(e.description ?? ""),
        date: toLocalInput(e.date as string | undefined),
        endDate: toLocalInput(e.endDate as string | undefined),
        venue: String(e.venue ?? ""),
        price: String(e.price ?? "0"),
        maxCapacity:
          e.maxCapacity != null && Number(e.maxCapacity) > 0
            ? String(e.maxCapacity)
            : "",
        status: String(e.status ?? "draft"),
        society: String(e.society ?? ""),
        registrationOpen: Boolean(e.registrationOpen),
        registrationDeadline: toLocalInput(
          e.registrationDeadline as string | undefined,
        ),
        contactEmail: String(e.contactEmail ?? ""),
        contactPhone: String(e.contactPhone ?? ""),
        externalLink: String(e.externalLink ?? ""),
      });
    }
  }, [existing, isEdit]);

  const mutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        title: form.title.trim(),
        description: form.description,
        venue: form.venue,
        price: Number(form.price) || 0,
        status: form.status,
        society: form.society,
        registrationOpen: form.registrationOpen,
        date: toIso(form.date),
        endDate: toIso(form.endDate),
        registrationDeadline: toIso(form.registrationDeadline),
        contactEmail: form.contactEmail || undefined,
        contactPhone: form.contactPhone || undefined,
        externalLink: form.externalLink || undefined,
      };
      if (form.maxCapacity) payload.maxCapacity = Number(form.maxCapacity);
      Object.keys(payload).forEach((k) => {
        if (payload[k] === undefined || payload[k] === "") delete payload[k];
      });

      const url = isEdit ? `/api/admin/events/${eventId}` : "/api/admin/events";
      const res = await fetch(url, {
        method: isEdit ? "PUT" : "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken(),
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Request failed (${res.status})`);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-events"] });
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
      if (eventId) {
        queryClient.invalidateQueries({ queryKey: ["admin-event", eventId] });
      }
      navigate({ to: "/admin/events" });
    },
    onError: (err: Error) => setSubmitError(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    if (!form.title.trim()) return setSubmitError("Title is required");
    if (!form.date) return setSubmitError("Date is required");
    if (!form.society) return setSubmitError("Society is required");
    mutation.mutate();
  };

  if (isEdit && existingLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-6">
        <form onSubmit={handleSubmit} className="grid gap-6">
          <FormSection title="Identity" description="What and who is hosting this event.">
            <div className="grid gap-1.5">
              <Label htmlFor="evt-title">Title *</Label>
              <Input
                id="evt-title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. WIE Workshop on AI Ethics"
                required
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="evt-description">Description</Label>
              <Textarea
                id="evt-description"
                rows={5}
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
                placeholder="What is this event about?"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="evt-society">Society *</Label>
                <Select
                  value={form.society}
                  onValueChange={(v) => setForm({ ...form, society: v })}
                >
                  <SelectTrigger id="evt-society">
                    <SelectValue placeholder="Pick a society" />
                  </SelectTrigger>
                  <SelectContent>
                    {(societies?.societies ?? []).map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="evt-status">Status</Label>
                <Select
                  value={form.status}
                  onValueChange={(v) => setForm({ ...form, status: v })}
                >
                  <SelectTrigger id="evt-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EVENT_STATUS.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s.charAt(0).toUpperCase() + s.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </FormSection>

          <FormSection title="Schedule" description="When and where.">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="evt-date">Date *</Label>
                <Input
                  id="evt-date"
                  type="datetime-local"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                  required
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="evt-end-date">End date</Label>
                <Input
                  id="evt-end-date"
                  type="datetime-local"
                  value={form.endDate}
                  onChange={(e) =>
                    setForm({ ...form, endDate: e.target.value })
                  }
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="evt-venue">Venue</Label>
              <Input
                id="evt-venue"
                value={form.venue}
                onChange={(e) => setForm({ ...form, venue: e.target.value })}
                placeholder="Main Auditorium"
              />
            </div>
          </FormSection>

          <FormSection
            title="Registration"
            description="Pricing, capacity, and deadlines."
          >
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="grid gap-1.5">
                <Label htmlFor="evt-price">Price (₹)</Label>
                <Input
                  id="evt-price"
                  type="number"
                  min="0"
                  step="1"
                  value={form.price}
                  onChange={(e) =>
                    setForm({ ...form, price: e.target.value })
                  }
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="evt-capacity">Max capacity</Label>
                <Input
                  id="evt-capacity"
                  type="number"
                  min="0"
                  step="1"
                  value={form.maxCapacity}
                  onChange={(e) =>
                    setForm({ ...form, maxCapacity: e.target.value })
                  }
                  placeholder="Unlimited"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="evt-deadline">Reg. deadline</Label>
                <Input
                  id="evt-deadline"
                  type="datetime-local"
                  value={form.registrationDeadline}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      registrationDeadline: e.target.value,
                    })
                  }
                />
              </div>
            </div>
            <label className="flex cursor-pointer items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-border accent-primary"
                checked={form.registrationOpen}
                onChange={(e) =>
                  setForm({ ...form, registrationOpen: e.target.checked })
                }
              />
              <span>Registration is open</span>
            </label>
          </FormSection>

          <FormSection
            title="Contact"
            description="Where to reach out about this event."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="evt-contact-email">Contact email</Label>
                <Input
                  id="evt-contact-email"
                  type="email"
                  value={form.contactEmail}
                  onChange={(e) =>
                    setForm({ ...form, contactEmail: e.target.value })
                  }
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="evt-contact-phone">Contact phone</Label>
                <Input
                  id="evt-contact-phone"
                  type="tel"
                  value={form.contactPhone}
                  onChange={(e) =>
                    setForm({ ...form, contactPhone: e.target.value })
                  }
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="evt-external">External link</Label>
              <Input
                id="evt-external"
                type="url"
                value={form.externalLink}
                onChange={(e) =>
                  setForm({ ...form, externalLink: e.target.value })
                }
                placeholder="https://forms.gle/…"
              />
            </div>
          </FormSection>

          {submitError && (
            <p
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            >
              {submitError}
            </p>
          )}

          <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate({ to: "/admin/events" })}
              disabled={mutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              )}
              {isEdit ? "Save changes" : "Create event"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-4 border-b border-border pb-6 last:border-b-0 last:pb-0">
      <div>
        <h2 className="text-sm font-semibold tracking-tight text-foreground">
          {title}
        </h2>
        {description && (
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      <div className="grid gap-4">{children}</div>
    </section>
  );
}
