"use client";

import { useState, useEffect } from "react";
import { useNavigate, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { CalendarDays, MapPin, Loader2, ArrowLeft, Ticket } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import type { FormField } from "@/components/admin/CustomFieldBuilder";
import { formatDate, formatTime } from "@/lib/dates";

interface PageProps {
  eventId: string;
}

// ─── Dynamic Field Renderer ─────────────────────────────────────────

function DynamicField({
  field,
  value,
  onChange,
  error,
}: {
  field: FormField;
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  const baseInput =
    "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring/50";
  const errorBorder = error ? "border-destructive" : "border-input";

  const sharedInput = `${baseInput} ${errorBorder}`;

  switch (field.type) {
    case "text":
    case "email":
    case "phone":
      return (
        <input
          type={
            field.type === "email"
              ? "email"
              : field.type === "phone"
                ? "tel"
                : "text"
          }
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          required={field.required}
          className={sharedInput}
        />
      );
    case "textarea":
      return (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          required={field.required}
          rows={3}
          className={`${sharedInput} resize-y min-h-[80px]`}
        />
      );
    case "number":
      return (
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          required={field.required}
          className={sharedInput}
        />
      );
    case "date":
      return (
        <input
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={field.required}
          className={sharedInput}
        />
      );
    case "select":
      return (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={field.required}
          className={sharedInput}
        >
          <option value="">{field.placeholder || "Select..."}</option>
          {field.options.map((opt, i) => (
            <option key={i} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      );
    case "radio":
      return (
        <div className="space-y-2">
          {field.options.map((opt, i) => (
            <label key={i} className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name={field.id}
                value={opt}
                checked={value === opt}
                onChange={(e) => onChange(e.target.value)}
                required={field.required}
                className="rounded-full border-input"
              />
              <span className="text-sm">{opt}</span>
            </label>
          ))}
        </div>
      );
    case "checkbox":
      return (
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={value === "true"}
            onChange={(e) => onChange(e.target.checked ? "true" : "false")}
            className="rounded border-input"
          />
          <span className="text-sm">{field.defaultValue || field.label}</span>
        </label>
      );
    case "boolean":
      return (
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name={field.id}
              value="yes"
              checked={value === "yes"}
              onChange={(e) => onChange(e.target.value)}
              required={field.required}
              className="rounded-full border-input"
            />
            <span className="text-sm">Yes</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name={field.id}
              value="no"
              checked={value === "no"}
              onChange={(e) => onChange(e.target.value)}
              required={field.required}
              className="rounded-full border-input"
            />
            <span className="text-sm">No</span>
          </label>
        </div>
      );
    default:
      return (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          className={sharedInput}
        />
      );
  }
}

// ─── Page Component ─────────────────────────────────────────────────

export default function RegisterPage({ eventId }: PageProps) {
  const navigate = useNavigate();
  const { user, status: authStatus, signIn } = useAuth();
  const [event, setEvent] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formResponses, setFormResponses] = useState<Record<string, string>>(
    {},
  );
  const [ieeeMembershipId, setIeeeMembershipId] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [couponStatus, setCouponStatus] = useState<{
    valid: boolean;
    discountAmount?: number;
    finalPrice?: string;
  } | null>(null);
  const [validatingCoupon, setValidatingCoupon] = useState(false);

  const validateCoupon = async () => {
    if (!couponCode.trim() || !event) return;
    setValidatingCoupon(true);
    setCouponStatus(null);
    try {
      const res = await fetch("/api/events/validate-coupon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId: event.id, code: couponCode }),
      });
      const data = await res.json();
      if (res.ok && data.valid) {
        setCouponStatus({
          valid: true,
          discountAmount: data.coupon.discountAmount,
          finalPrice: data.coupon.finalPrice,
        });
      } else {
        setCouponStatus({ valid: false });
      }
    } catch {
      setCouponStatus({ valid: false });
    } finally {
      setValidatingCoupon(false);
    }
  };

  const fields: FormField[] = event?.formTemplate || [];
  const collectIeeeMember = !!event?.collectIeeeMember;

  useEffect(() => {
    fetch(`/api/events/${eventId}`)
      .then((r) => r.json())
      .then((data) => {
        if (!data.event) throw new Error("Event not found");
        setEvent(data.event);
        setLoading(false);
      })
      .catch(() => {
        setError("Event not found");
        setLoading(false);
      });
  }, [eventId]);

  // Pre-fill user info
  useEffect(() => {
    if (user) {
      setFormResponses((prev) => ({
        ...prev,
        name: prev.name || user.name || "",
        email: prev.email || user.email || "",
      }));
    }
  }, [user]);

  const updateField = (fieldId: string, value: string) => {
    setFormResponses((prev) => ({ ...prev, [fieldId]: value }));
    if (fieldErrors[fieldId]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[fieldId];
        return next;
      });
    }
  };

  const validate = (): boolean => {
    const errors: Record<string, string> = {};
    for (const field of fields) {
      if (field.required) {
        const val = formResponses[field.id];
        if (!val || (typeof val === "string" && val.trim() === "")) {
          errors[field.id] = "This field is required";
        }
      }
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    if (!event?.registrationOpen) {
      setError("Registration is closed for this event");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const responses = { ...formResponses };
      if (collectIeeeMember && ieeeMembershipId) {
        responses.ieeeMembershipId = ieeeMembershipId;
      }

      const res = await fetch("/api/registrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          eventId: event.id,
          formResponses: responses,
          couponCode: couponStatus?.valid ? couponCode : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Registration failed");

      toast.success("Registration successful!");
      navigate({ to: `/ticket/${data.ticketId}` });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
      setSubmitting(false);
    }
  };

  // ─── Render ─────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8F9FA]">
        <Navbar />
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="w-8 h-8 text-ieee-blue animate-spin" />
        </div>
        <Footer />
      </div>
    );
  }

  if (!event || (error && !event)) {
    return (
      <div className="min-h-screen bg-[#F8F9FA]">
        <Navbar />
        <div className="text-center py-20 px-4">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Event Not Found
          </h1>
          <p className="text-gray-600 mb-6">
            {error || "This event could not be found."}
          </p>
          <Link
            to="/events"
            className="text-ieee-blue hover:underline font-medium"
          >
            Back to Events
          </Link>
        </div>
        <Footer />
      </div>
    );
  }

  // Registration closed
  if (!event.registrationOpen) {
    return (
      <div className="min-h-screen bg-[#F8F9FA]">
        <Navbar />
        <div className="max-w-lg mx-auto py-20 px-4 text-center">
          <Ticket className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Registration Closed
          </h1>
          <p className="text-gray-600 mb-2">
            This event is not currently accepting registrations.
          </p>
          {event.externalFormUrl && (
            <p className="text-sm text-gray-500 mb-6">
              This event uses an external registration form.
            </p>
          )}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            {event.externalFormUrl && (
              <a
                href={event.externalFormUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-ieee-blue text-white px-6 py-3 rounded-xl font-semibold hover:bg-ieee-blue/90 transition-colors"
              >
                Register Externally
              </a>
            )}
            <Link
              to="/events"
              className="text-ieee-blue hover:underline font-medium"
            >
              Back to Events
            </Link>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  // Not authenticated
  if (authStatus === "unauthenticated") {
    return (
      <div className="min-h-screen bg-[#F8F9FA]">
        <Navbar />
        <div className="max-w-lg mx-auto py-20 px-4 text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Sign In Required
          </h1>
          <p className="text-gray-600 mb-6">
            Please sign in to register for this event.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={signIn}
              className="bg-ieee-blue text-white px-6 py-3 rounded-xl font-semibold hover:bg-ieee-blue/90 transition-colors"
            >
              Sign In
            </button>
            <Link
              to="/events"
              className="text-ieee-blue hover:underline font-medium"
            >
              Back to Events
            </Link>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  // Registration form
  return (
    <div className="min-h-screen bg-[#F8F9FA]">
      <Navbar />
      <main className="py-12 px-4">
        <div className="max-w-2xl mx-auto">
          <Link
            to="/events"
            className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 mb-8 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Events
          </Link>

          {/* Event Info */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 mb-6"
          >
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              {event.title}
            </h1>
            {event.description && (
              <p className="text-gray-600 text-sm mb-4 line-clamp-2">
                {event.description}
              </p>
            )}
            <div className="flex flex-wrap gap-4 text-sm text-gray-500">
              {event.date && (
                <span className="flex items-center gap-1.5">
                  <CalendarDays className="w-4 h-4" /> {formatDate(event.date)}{" "}
                  at {formatTime(event.date)}
                </span>
              )}
              {event.venue && (
                <span className="flex items-center gap-1.5">
                  <MapPin className="w-4 h-4" /> {event.venue}
                </span>
              )}
              {event.isPaid ? (
                <span className="font-semibold text-ieee-blue">
                  ₹{event.price}
                </span>
              ) : (
                <span className="text-green-600 font-medium">Free</span>
              )}
            </div>
          </motion.div>

          {/* Form */}
          <motion.form
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            onSubmit={handleSubmit}
            className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 space-y-5"
          >
            <h2 className="text-lg font-bold text-gray-900">Registration</h2>

            {error && (
              <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}

            {/* Name */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">
                Full Name *
              </label>
              <input
                type="text"
                value={formResponses.name || ""}
                onChange={(e) => updateField("name", e.target.value)}
                required
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring/50"
              />
            </div>

            {/* Email */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">
                Email *
              </label>
              <input
                type="email"
                value={formResponses.email || ""}
                onChange={(e) => updateField("email", e.target.value)}
                required
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring/50"
              />
            </div>

            {/* Phone */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">Phone</label>
              <input
                type="tel"
                value={formResponses.phone || ""}
                onChange={(e) => updateField("phone", e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring/50"
              />
            </div>

            {/* IEEE Membership ID */}
            {collectIeeeMember && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">
                  IEEE Membership ID
                </label>
                <input
                  type="text"
                  value={ieeeMembershipId}
                  onChange={(e) => setIeeeMembershipId(e.target.value)}
                  placeholder="e.g. 98765432"
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring/50"
                />
                <p className="text-xs text-gray-400">
                  If you are an IEEE member, enter your membership number
                </p>
              </div>
            )}

            {/* Custom Fields */}
            {fields.length > 0 && (
              <>
                <hr className="border-gray-100" />
                <p className="text-sm font-medium text-gray-700">
                  Additional Information
                </p>
                {fields.map((field) => (
                  <div key={field.id} className="space-y-1.5">
                    <label className="text-sm font-medium text-gray-700">
                      {field.label}{" "}
                      {field.required && (
                        <span className="text-destructive">*</span>
                      )}
                    </label>
                    <DynamicField
                      field={field}
                      value={formResponses[field.id] || ""}
                      onChange={(val) => updateField(field.id, val)}
                      error={fieldErrors[field.id]}
                    />
                    {fieldErrors[field.id] && (
                      <p className="text-xs text-destructive">
                        {fieldErrors[field.id]}
                      </p>
                    )}
                  </div>
                ))}
              </>
            )}

            {/* Coupon Code */}
            {event.isPaid && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">
                  Coupon Code
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={couponCode}
                    onChange={(e) => {
                      setCouponCode(e.target.value);
                      setCouponStatus(null);
                    }}
                    placeholder="Enter coupon code"
                    className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring/50 uppercase"
                  />
                  <button
                    type="button"
                    onClick={validateCoupon}
                    disabled={validatingCoupon || !couponCode.trim()}
                    className="rounded-lg bg-gray-100 text-gray-700 px-4 py-2 text-sm font-medium hover:bg-gray-200 transition-colors disabled:opacity-50"
                  >
                    {validatingCoupon ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      "Apply"
                    )}
                  </button>
                </div>
                {couponStatus && (
                  <p
                    className={`text-xs ${couponStatus.valid ? "text-green-600" : "text-destructive"}`}
                  >
                    {couponStatus.valid
                      ? `Discount applied! ₹${couponStatus.discountAmount} off`
                      : "Invalid or expired coupon code"}
                  </p>
                )}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-ieee-blue text-white py-3 rounded-xl font-semibold hover:bg-ieee-blue/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Registering...
                </>
              ) : (
                <>Register {event.isPaid ? `• ₹${event.price}` : ""}</>
              )}
            </button>
          </motion.form>
        </div>
      </main>
      <Footer />
    </div>
  );
}
