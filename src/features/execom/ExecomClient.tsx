"use client";

import React, { useState, useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { X, Users } from "lucide-react";
import { Linkedin, Instagram } from "@/components/icons";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export interface ExecomMemberDoc {
  id: string;
  order: number;
  slNo: number;
  name: string;
  department: string;
  semester: string;
  position: string;
  category: string;
  section: string;
  sectionId: string;
  photoUrl?: string;
  linkedin?: string;
  instagram?: string;
}

// ===== TYPES =====
interface Member {
  id: string;
  slNo: number;
  name: string;
  department: string;
  semester: string;
  position: string;
  sectionId: string;
  photoUrl?: string;
  linkedin?: string;
  instagram?: string;
}

interface ExecomClientProps {
  initialDocs: ExecomMemberDoc[];
}

// ===== SECTION CONFIG =====
// Canonical display order for the filter pills (mirrors the live execom page).
const SECTION_ORDER = [
  "core", "cs", "ias", "ies", "sight", "sps", "npss", "edsoc", "css",
  "embs", "pes", "wie", "cass", "ras", "tech", "epd", "media", "ec",
  "design", "content", "qrt",
] as const;

const SECTION_LABEL: Record<string, string> = {
  core: "Core", cs: "CS", ias: "IAS", ies: "IES", sight: "SIGHT",
  sps: "SPS", npss: "NPSS", edsoc: "EdSoc", css: "CSS", embs: "EMBS",
  pes: "PES", wie: "WIE", cass: "CASS", ras: "RAS", tech: "Tech",
  epd: "EPD", media: "Media", ec: "Event", design: "Design",
  content: "Content", qrt: "QRT",
};

const IEEE_BLUE = "#00629B";

function initials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function docToMember(doc: ExecomMemberDoc): Member {
  return {
    id: doc.id,
    slNo: doc.slNo,
    name: doc.name,
    department: doc.department,
    semester: doc.semester,
    position: doc.position,
    sectionId: doc.sectionId,
    photoUrl: doc.photoUrl,
    linkedin: doc.linkedin,
    instagram: doc.instagram,
  };
}

// ===== MEMBER DETAIL MODAL =====
const MemberDetailModal: React.FC<{ member: Member; onClose: () => void }> = ({
  member,
  onClose,
}) => {
  const [imgError, setImgError] = useState(false);
  const imageSrc = member.photoUrl || "";
  const hasContactInfo = !!(
    member.linkedin || member.instagram
  );

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        role="dialog"
        aria-modal="true"
        aria-label={member.name}
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
        onClick={onClose}
        onKeyDown={(e: React.KeyboardEvent) => e.key === "Escape" && onClose()}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 16 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 16 }}
          transition={{ type: "spring", damping: 26, stiffness: 320 }}
          className="relative my-4 w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl"
          onClick={(e) => e.stopPropagation()}
          tabIndex={-1}
        >
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-gray-600 shadow-md backdrop-blur-sm transition hover:scale-105 hover:bg-white"
          >
            <X className="h-5 w-5" />
          </button>

          <div className="relative aspect-[4/5] overflow-hidden bg-gray-100">
            {imageSrc && !imgError ? (
              <img
                src={imageSrc}
                alt={member.name}
                loading="lazy"
                onError={() => setImgError(true)}
                className="absolute inset-0 h-full w-full object-cover object-top"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-gray-50 to-gray-200">
                <span className="text-6xl font-light text-gray-300">
                  {initials(member.name)}
                </span>
              </div>
            )}
          </div>

          <div className="p-6">
            <div
              className="text-xs font-semibold uppercase tracking-wider"
              style={{ color: IEEE_BLUE }}
            >
              {member.position || "Member"}
            </div>
            <h2 className="mt-2 text-2xl font-bold text-gray-900">{member.name}</h2>
            {(member.department || member.semester) && (
              <div className="mt-2 flex items-center gap-3 text-sm text-gray-500">
                {member.department && (
                  <span className="font-medium">{member.department}</span>
                )}
                {member.department && member.semester && (
                  <span className="h-1.5 w-1.5 rounded-full bg-gray-300" />
                )}
                {member.semester && (
                  <span className="font-medium">{member.semester}</span>
                )}
              </div>
            )}

            {hasContactInfo && (
              <div className="mt-5 border-t border-gray-100 pt-5">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
                  Connect
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {member.linkedin && (
                    <a
                      href={member.linkedin}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 rounded-xl bg-[#0077B5] px-4 py-2.5 text-white transition hover:scale-[1.03]"
                    >
                      <Linkedin className="h-4 w-4" />
                      <span className="text-sm font-medium">LinkedIn</span>
                    </a>
                  )}
                  {member.instagram && (
                    <a
                      href={member.instagram}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 rounded-xl bg-gradient-to-br from-[#833AB4] via-[#E1306C] to-[#F77737] px-4 py-2.5 text-white transition hover:scale-[1.03]"
                    >
                      <Instagram className="h-4 w-4" />
                      <span className="text-sm font-medium">Instagram</span>
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

// ===== MEMBER CARD (flat, Enumera-style) =====
const MemberCard: React.FC<{
  member: Member;
  index: number;
  onClick: () => void;
}> = React.memo(({ member, index, onClick }) => {
  const [imgError, setImgError] = useState(false);
  const imageSrc = member.photoUrl || "";

  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: Math.min(index * 0.025, 0.4) }}
      onClick={onClick}
      className="group rounded-2xl text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00629B] focus-visible:ring-offset-2"
    >
      <div className="relative aspect-[3/4] overflow-hidden rounded-2xl bg-gray-100">
        {imageSrc && !imgError ? (
          <img
            src={imageSrc}
            alt={member.name}
            loading="lazy"
            onError={() => setImgError(true)}
            className="absolute inset-0 h-full w-full object-cover object-top transition-transform duration-700 group-hover:scale-[1.04]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
            <span className="text-4xl font-light text-gray-300">
              {initials(member.name)}
            </span>
          </div>
        )}
      </div>
      <h3 className="mt-3 text-[15px] font-semibold leading-snug text-gray-900">
        {member.name}
      </h3>
      <p className="mt-0.5 text-[13px] text-gray-500">
        {member.position || "Member"}
      </p>
    </motion.button>
  );
});
MemberCard.displayName = "MemberCard";

// ===== FILTER PILL =====
const FilterPill: React.FC<{
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ active, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    className={cn(
      "rounded-full px-4 py-1.5 text-[13px] font-medium uppercase tracking-wide transition-colors",
      active
        ? "bg-[#00629B] text-white"
        : "border border-gray-300 text-gray-600 hover:border-gray-400 hover:bg-gray-50",
    )}
  >
    {children}
  </button>
);

// ===== MAIN =====
const FullExecom: React.FC<ExecomClientProps> = ({ initialDocs }) => {
  const [docs, setDocs] = useState(initialDocs);
  const [activeFilter, setActiveFilter] = useState<string>("core");
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);

  // Sections actually present, in canonical order → drives the filter pills.
  const presentSections = useMemo(() => {
    const present = new Set(docs.map((d) => d.sectionId));
    return SECTION_ORDER.filter((id) => present.has(id));
  }, [docs]);

  const members = useMemo(
    () =>
      docs
        .map(docToMember)
        .sort((a, b) => a.slNo - b.slNo)
        .filter((m) => m.sectionId === activeFilter),
    [docs, activeFilter],
  );


  // Empty state
  if (!docs.length) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white px-4">
        <div className="max-w-md text-center">
          <Users className="mx-auto mb-6 h-14 w-14 text-gray-300" />
          <h2 className="mb-2 text-2xl font-bold text-gray-900">
            No execom data available
          </h2>
          <p className="mb-6 text-gray-500">
            The execom directory could not be loaded. Please try again later.
          </p>
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-full bg-[#00629B] px-6 py-3 text-sm font-bold text-white transition hover:bg-[#004a7c]"
          >
            Go Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      {selectedMember && (
        <MemberDetailModal
          member={selectedMember}
          onClose={() => setSelectedMember(null)}
        />
      )}

      <div className="mx-auto max-w-7xl px-6 py-10 sm:px-10 lg:px-16 lg:py-16">
        {/* Breadcrumb */}
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-[0.25em] text-gray-500">
            {"// Our Team"}
          </span>
          <Link
            to="/"
            className="text-xs font-medium uppercase tracking-[0.15em] text-gray-400 transition-colors hover:text-gray-700"
          >
            Home
          </Link>
        </div>

        <div className="mt-5 border-t border-gray-200" />

        {/* Title + filters */}
        <div className="mt-8 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <h1 className="text-4xl font-medium leading-[1.05] tracking-tight text-gray-900 sm:text-5xl lg:text-6xl">
            Meet the
            <br />
            Execom 2026
          </h1>

          <div className="flex flex-wrap gap-2 lg:max-w-2xl lg:justify-end">
            {presentSections.map((id) => (
              <FilterPill
                key={id}
                active={activeFilter === id}
                onClick={() => setActiveFilter(id)}
              >
                {SECTION_LABEL[id] ?? id}
              </FilterPill>
            ))}
          </div>
        </div>

        {/* Grid */}
        <div className="mt-12 lg:mt-16">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeFilter}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.25 }}
            >
              {members.length > 0 ? (
                <div className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                  {members.map((member, idx) => (
                    <MemberCard
                      key={member.id}
                      member={member}
                      index={idx}
                      onClick={() => setSelectedMember(member)}
                    />
                  ))}
                </div>
              ) : (
                <p className="py-16 text-center text-sm text-gray-400">
                  No members in this section yet.
                </p>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <Footer />
    </div>
  );
};

export { FullExecom as default };
