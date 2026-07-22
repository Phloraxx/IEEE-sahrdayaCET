"use client";

import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router";
import { motion } from "framer-motion";
import { CalendarDays, MapPin, Loader2, ArrowLeft, Ticket } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import type { FormField } from "@/types";
import { formatDate } from "@/lib/dates";
import { createRegistration, getPublicEvent } from "@/lib/data/public-client";

interface PageProps {
  eventId: string;
  initialEvent?: Record<string, unknown> | null;
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
          type={field.type}
          id={field.id}
          placeholder={field.placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={sharedInput}
          required={field.required}
          aria-invalid={!!error}
          aria-describedby={error ? `${field.id}-error` : undefined}
        />
      );
    case "textarea":
      return (
        <textarea
          id={field.id}
          placeholder={field.placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`${sharedInput} min-h-[80px] resize-y`}
          required={field.required}
          aria-invalid={!!error}
          aria-describedby={error ? `${field.id}-error` : undefined}
        />
      );
    case "number":
      return (
        <input
          type="number"
          id={field.id}
          placeholder={field.placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={sharedInput}
          required={field.required}
          aria-invalid={!!error}
          aria-describedby={error ? `${field.id}-error` : undefined}
        />
      );
    case "date":
      return (
        <input
          type="date"
          id={field.id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={sharedInput}
          required={field.required}
          aria-invalid={!!error}
          aria-describedby={error ? `${field.id}-error` : undefined}
        />
      );
    case "select":
      return (
        <select
          id={field.id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={sharedInput}
          required={field.required}
          aria-invalid={!!error}
          aria-describedby={error ? `${field.id}-error` : undefined}
        >
          <option value="">Select...</option>
          {field.options?.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      );
    case "radio":
      return (
        <div className="space-y-2" role="radiogroup" aria-label={field.label} aria-invalid={!!error} aria-describedby={error ? `${field.id}-error` : undefined}>
          {field.options?.map((opt) => (
            <label
              key={opt}
              className="flex items-center gap-2 cursor-pointer"
            >
              <input
                type="radio"
                id={`${field.id}-${opt}`}
                name={`field_${field.label}`}
                value={opt}
                checked={value === opt}
                onChange={(e) => onChange(e.target.value)}
                className="accent-ieee-blue"
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
            id={field.id}
            checked={value === "true"}
            onChange={(e) => onChange(e.target.checked ? "true" : "false")}
            className="accent-ieee-blue rounded"
            aria-invalid={!!error}
            aria-describedby={error ? `${field.id}-error` : undefined}
          />
          <span className="text-sm">{field.label}</span>
        </label>
      );
    case "boolean":
      return (
        <div className="flex items-center gap-4" role="radiogroup" aria-label={field.label} aria-invalid={!!error} aria-describedby={error ? `${field.id}-error` : undefined}>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              id={`${field.id}-yes`}
              name={`field_${field.label}`}
              value="yes"
              checked={value === "yes"}
              onChange={() => onChange("yes")}
              className="accent-ieee-blue"
            />
            <span className="text-sm">Yes</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              id={`${field.id}-no`}
              name={`field_${field.label}`}
              value="no"
              checked={value === "no"}
              onChange={() => onChange("no")}
              className="accent-ieee-blue"
            />
            <span className="text-sm">No</span>
          </label>
        </div>
      );
    default:
      return (
        <input
          type="text"
          id={field.id}
          placeholder={field.placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={sharedInput}
          required={field.required}
          aria-invalid={!!error}
          aria-describedby={error ? `${field.id}-error` : undefined}
        />
      );
  }
}

// ─── Registration Form Fields ─────────────────────────────────────────

function RegistrationFormFields({
  name,
  setName,
  email,
  setEmail,
  phone,
  setPhone,
  college,
  setCollege,
  branch,
  setBranch,
  semester,
  setSemester,
  isIeeeMember,
  setIsIeeeMember,
  ieeeMembershipId,
  setIeeeMembershipId,
  errors,
  event,
  customFields,
  setCustomFields,
}: {
  name: string;
  setName: (v: string) => void;
  email: string;
  setEmail: (v: string) => void;
  phone: string;
  setPhone: (v: string) => void;
  college: string;
  setCollege: (v: string) => void;
  branch: string;
  setBranch: (v: string) => void;
  semester: string;
  setSemester: (v: string) => void;
  isIeeeMember: boolean;
  setIsIeeeMember: (v: boolean) => void;
  ieeeMembershipId: string;
  setIeeeMembershipId: (v: string) => void;
  errors: Record<string, string>;
  event: { collectIeeeMember?: boolean; formFields?: FormField[] };
  customFields: Record<string, string>;
  setCustomFields: React.Dispatch<React.SetStateAction<Record<string, string>>>;
}) {
  return (
    <>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">
          Personal Information
        </h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="name">
              Full Name *
            </label>
            <input
              type="text"
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring/50"
              placeholder="Enter your full name"
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? "name-error" : undefined}
            />
            {errors.name && (
              <p id="name-error" className="text-xs text-red-500 mt-1" role="alert">{errors.name}</p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="email">
                Email *
              </label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring/50"
                placeholder="your.email@example.com"
                aria-invalid={!!errors.email}
                aria-describedby={errors.email ? "email-error" : undefined}
              />
              {errors.email && (
                <p id="email-error" className="text-xs text-red-500 mt-1" role="alert">{errors.email}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="phone">
                Phone *
              </label>
              <input
                type="tel"
                id="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring/50"
                placeholder="+91 98765 43210"
                aria-invalid={!!errors.phone}
                aria-describedby={errors.phone ? "phone-error" : undefined}
              />
              {errors.phone && (
                <p id="phone-error" className="text-xs text-red-500 mt-1" role="alert">{errors.phone}</p>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="college">
              College / Institution *
            </label>
            <input
              type="text"
              id="college"
              value={college}
              onChange={(e) => setCollege(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring/50"
              placeholder="Enter your college name"
              aria-invalid={!!errors.college}
              aria-describedby={errors.college ? "college-error" : undefined}
            />
            {errors.college && (
              <p id="college-error" className="text-xs text-red-500 mt-1" role="alert">{errors.college}</p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="branch">
                Branch / Department
              </label>
              <input
                type="text"
                id="branch"
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring/50"
                placeholder="e.g. Computer Science"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="semester">
                Semester
              </label>
              <input
                type="text"
                id="semester"
                value={semester}
                onChange={(e) => setSemester(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring/50"
                placeholder="e.g. S6"
              />
            </div>
          </div>

          {/* IEEE Member Section */}
          {(event.collectIeeeMember === undefined ||
            event.collectIeeeMember) && (
            <div className="pt-4 border-t border-gray-100">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isIeeeMember}
                  onChange={(e) => setIsIeeeMember(e.target.checked)}
                  className="accent-ieee-blue w-4 h-4"
                  id="ieee-member"
                />
                <span className="text-sm font-medium text-gray-700">
                  I am an IEEE Member
                </span>
              </label>

              {isIeeeMember && (
                <div className="mt-3">
                  <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="ieee-membership-id">
                    IEEE Membership ID
                  </label>
                  <input
                    type="text"
                    id="ieee-membership-id"
                    value={ieeeMembershipId}
                    onChange={(e) => setIeeeMembershipId(e.target.value)}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring/50"
                    placeholder="Enter your IEEE membership ID"
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Custom Fields (if any) */}
      {event.formFields && event.formFields.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4">
            Additional Information
          </h2>
          <div className="space-y-4">
            {event.formFields.map((field) => (
              <div key={field.label}>
                <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor={field.id}>
                  {field.label}
                  {field.required && " *"}
                </label>
                <DynamicField
                  field={field}
                  value={customFields[field.label] || ""}
                  onChange={(value) =>
                    setCustomFields((prev) => ({
                      ...prev,
                      [field.label]: value,
                    }))
                  }
                  error={errors[field.id]}
                />
                {errors[field.id] && (
                  <p id={`${field.id}-error`} className="text-xs text-red-500 mt-1" role="alert">{errors[field.id]}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

// ─── Event Registration Page ──────────────────────────────────────────

export default function RegisterPage({ eventId, initialEvent }: PageProps) {
  const navigate = useNavigate();
  const { user, signIn } = useAuth();

  const [event, setEvent] = useState<{
    id: string;
    title: string;
    description: string;
    date: string;
    endDate: string;
    venue: string;
    price: number;
    isPaid: boolean;
    bannerUrl: string;
    registrationOpen: boolean;
    maxCapacity: number;
    registeredCount: number;
    collectIeeeMember?: boolean;
    formFields?: FormField[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Core form fields
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [college, setCollege] = useState("");
  const [branch, setBranch] = useState("");
  const [semester, setSemester] = useState("");
  const [isIeeeMember, setIsIeeeMember] = useState(false);
  const [ieeeMembershipId, setIeeeMembershipId] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Dynamic custom fields
  const [customFields, setCustomFields] = useState<Record<string, string>>({});

  // Form validity
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  useEffect(() => {
    if (initialEvent) {
      setEvent(initialEvent as unknown as typeof event);
      const formTemplate = (initialEvent as Record<string, unknown>).formTemplate || (initialEvent as Record<string, unknown>).formFields;
      if (Array.isArray(formTemplate)) {
        const initial: Record<string, string> = {};
        formTemplate.forEach((f: FormField) => {
          initial[f.label] = f.type === "checkbox" ? "false" : "";
        });
        setCustomFields(initial);
      }
      setLoading(false);
      return;
    }
    const fetchEvent = async () => {
      try {
        const eventData = await getPublicEvent(eventId);
        if (eventData) {
          setEvent(eventData as typeof event);
          const formTemplate = eventData.formTemplate;
          if (Array.isArray(formTemplate)) {
            const initial: Record<string, string> = {};
            formTemplate.forEach((f: FormField) => {
              initial[f.label] = f.type === "checkbox" ? "false" : "";
            });
            setCustomFields(initial);
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load event");
      } finally {
        setLoading(false);
      }
    };
    fetchEvent();
  }, [eventId, initialEvent]);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!name.trim()) newErrors.name = "Name is required";
    if (!email.trim()) newErrors.email = "Email is required";
    if (!phone.trim()) newErrors.phone = "Phone is required";
    if (!college.trim()) newErrors.college = "College is required";
    if (!acceptedTerms) newErrors.terms = "You must accept the terms";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      const body = {
        eventId,
        formResponses: {
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim(),
          college: college.trim(),
          branch: branch.trim(),
          semester: semester.trim(),
          isIeeeMember,
          ieeeMembershipId: ieeeMembershipId.trim() || undefined,
          ...customFields,
        },
      };

      if (!user?.id) throw new Error("Please sign in before registering");
      const result = await createRegistration({
        userId: user.id,
        eventId: body.eventId,
        formResponses: body.formResponses,
      });

      toast.success("Registration successful!");
      navigate(`/ticket/${result.ticketId}`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Something went wrong",
      );
    } finally {
      setSubmitting(false);
    }
  };

  // ── Loading State ──
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-ieee-blue animate-spin mx-auto mb-4" />
          <p className="text-gray-600 font-medium">Loading event details...</p>
        </div>
      </div>
    );
  }

  // ── Error State ──
  if (error || !event) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-md mx-auto px-4">
          <div className="bg-red-50 border border-red-200 rounded-2xl p-8">
            <h1 className="text-xl font-bold text-red-700 mb-2">
              {error || "Event not found"}
            </h1>
            <p className="text-red-600/80 mb-6">
              The event you're looking for doesn't exist or has been removed.
            </p>
            <Link
              to="/events"
              className="inline-flex items-center gap-2 bg-ieee-blue text-white px-6 py-2.5 rounded-xl hover:bg-blue-700 transition-colors font-medium"
            >
              <ArrowLeft className="w-4 h-4" />
              Browse Events
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ── Registration Closed ──
  if (!event.registrationOpen) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-md mx-auto px-4">
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-8">
            <h1 className="text-xl font-bold text-amber-700 mb-2">
              Registration Closed
            </h1>
            <p className="text-amber-600/80 mb-6">
              Registration for this event is currently closed.
            </p>
            <Link
              to="/events"
              className="inline-flex items-center gap-2 bg-ieee-blue text-white px-6 py-2.5 rounded-xl hover:bg-blue-700 transition-colors font-medium"
            >
              <ArrowLeft className="w-4 h-4" />
              Browse Events
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ── Capacity Full ──
  if (
    event.maxCapacity > 0 &&
    event.registeredCount >= event.maxCapacity
  ) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-md mx-auto px-4">
          <div className="bg-red-50 border border-red-200 rounded-2xl p-8">
            <h1 className="text-xl font-bold text-red-700 mb-2">
              Event Full
            </h1>
            <p className="text-red-600/80 mb-6">
              All seats for this event have been filled.
            </p>
            <Link
              to="/events"
              className="inline-flex items-center gap-2 bg-ieee-blue text-white px-6 py-2.5 rounded-xl hover:bg-blue-700 transition-colors font-medium"
            >
              <ArrowLeft className="w-4 h-4" />
              Browse Events
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ── Registration Form ──
  return (
    <div className="min-h-screen bg-linear-to-br from-gray-50 to-gray-100">
      <Navbar />

      <main className="max-w-3xl mx-auto px-4 py-8">
        {/* Back button */}
        <Link
          to="/events"
          className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm font-medium">Back to Events</span>
        </Link>

        {/* Event Header Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden mb-6"
        >
          {event.bannerUrl ? (
            <div className="relative h-40 sm:h-48">
              <img
                src={event.bannerUrl}
                alt={event.title}
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                className="absolute inset-0 w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-linear-to-t from-black/60 to-transparent" />
              <div className="absolute bottom-4 left-4 right-4">
                <h1 className="text-xl sm:text-2xl font-bold text-white mb-1">
                  {event.title}
                </h1>
                <div className="flex flex-wrap items-center gap-3 text-white/80 text-xs sm:text-sm">
                  <span className="flex items-center gap-1">
                    <CalendarDays className="w-3.5 h-3.5" />
                    {formatDate(event.date)}
                  </span>
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5" />
                    {event.venue}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-6 bg-linear-to-br from-ieee-blue to-purple-600">
              <h1 className="text-xl sm:text-2xl font-bold text-white mb-1">
                {event.title}
              </h1>
              <div className="flex flex-wrap items-center gap-3 text-white/80 text-xs sm:text-sm">
                <span className="flex items-center gap-1">
                  <CalendarDays className="w-3.5 h-3.5" />
                  {formatDate(event.date)}
                </span>
                <span className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" />
                  {event.venue}
                </span>
              </div>
            </div>
          )}
          <div className="px-6 py-4 flex items-center justify-between bg-gray-50 border-t border-gray-100">
            <div className="flex items-center gap-4 text-sm text-gray-600">
              <span>
                <strong>{event.registeredCount}</strong> /{" "}
                {event.maxCapacity > 0 ? event.maxCapacity : "∞"} registered
              </span>
              {event.isPaid && (
                <span className="font-semibold text-ieee-blue">
                  ₹{event.price}
                </span>
              )}
            </div>
          </div>
        </motion.div>

        {/* Registration Form */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          {!user ? (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center">
              <Ticket className="w-16 h-16 text-ieee-blue mx-auto mb-4" />
              <h2 className="text-xl font-bold text-gray-900 mb-2">
                Sign in to Register
              </h2>
              <p className="text-gray-600 mb-6">
                Please sign in with your Google account to register for this
                event.
              </p>
              <button
                onClick={signIn}
                className="inline-flex items-center gap-2 bg-ieee-blue text-white px-6 py-3 rounded-xl hover:bg-blue-700 transition-colors font-medium"
              >
                Sign in with Google
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              <RegistrationFormFields
                name={name}
                setName={setName}
                email={email}
                setEmail={setEmail}
                phone={phone}
                setPhone={setPhone}
                college={college}
                setCollege={setCollege}
                branch={branch}
                setBranch={setBranch}
                semester={semester}
                setSemester={setSemester}
                isIeeeMember={isIeeeMember}
                setIsIeeeMember={setIsIeeeMember}
                ieeeMembershipId={ieeeMembershipId}
                setIeeeMembershipId={setIeeeMembershipId}
                errors={errors}
                event={event}
                customFields={customFields}
                setCustomFields={setCustomFields}
              />

              {/* Terms and Submit */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
                <label className="flex items-start gap-3 cursor-pointer mb-6">
                  <input
                    type="checkbox"
                    checked={acceptedTerms}
                    onChange={(e) => setAcceptedTerms(e.target.checked)}
                    className="accent-ieee-blue w-4 h-4 mt-0.5"
                  />
                  <span className="text-sm text-gray-600">
                    I confirm that the information provided is accurate and I
                    agree to the terms and conditions of the event. *
                  </span>
                </label>
                {errors.terms && (
                  <p className="text-xs text-red-500 mb-4">{errors.terms}</p>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full bg-ieee-blue hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white py-3 rounded-xl transition-colors font-semibold flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Ticket className="w-5 h-5" />
                      {event.isPaid ? "Proceed to Payment" : "Register Now"}
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </motion.div>
      </main>

      <Footer />
    </div>
  );
}
