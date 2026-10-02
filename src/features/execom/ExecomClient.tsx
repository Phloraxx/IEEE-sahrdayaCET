import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Link, useSearchParams } from "react-router";
import { Dialog } from "radix-ui";
import {
  ArrowRight,
  ArrowUpRight,
  Globe2,
  Grid3X3,
  List,
  Search,
  Users,
  X,
} from "lucide-react";
import { Instagram, Linkedin } from "@/components/icons";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import { TechnicalDetails } from "@/components/TechnicalDetails";
import { StarsBackground } from "@/components/ui/stars-background";

export interface ExecomMemberDoc {
  id: string;
  order: number;
  slNo: number;
  name: string;
  department: string;
  semester: string;
  position: string;
  section: string;
  sectionId: string;
  photoUrl?: string;
  linkedin?: string;
  instagram?: string;
  portfolio?: string;
}

type ViewMode = "grid" | "roster";

interface ExecomClientProps {
  initialDocs: ExecomMemberDoc[];
}

const SECTION_ORDER = [
  "core", "cs", "ias", "ies", "sight", "sps", "npss", "edsoc", "css",
  "embs", "pes", "wie", "cass", "ras", "tech", "epd", "media", "ec",
  "design", "content", "qrt",
] as const;

const SECTION_LABEL: Record<string, string> = {
  core: "Core", cs: "CS", ias: "IAS", ies: "IES", sight: "SIGHT",
  sps: "SPS", npss: "NPSS", edsoc: "EdSoc", css: "CSS", embs: "EMBS",
  pes: "PES", wie: "WIE", cass: "CAS", ras: "RAS", tech: "Tech",
  epd: "EPD", media: "Media", ec: "Event", design: "Design",
  content: "Content", qrt: "QRT",
};

const SECTION_LONG_LABEL: Record<string, string> = {
  core: "Branch Core",
  cs: "Computer Society",
  ias: "Industry Applications Society",
  ies: "Industrial Electronics Society",
  sight: "SIGHT",
  sps: "Signal Processing Society",
  npss: "Nuclear & Plasma Sciences Society",
  edsoc: "Education Society",
  css: "Control Systems Society",
  embs: "Engineering in Medicine & Biology",
  pes: "Power & Energy Society",
  wie: "Women in Engineering",
  cass: "Circuits and Systems Society",
  ras: "Robotics & Automation Society",
  tech: "Technical Team",
  epd: "EPD Team",
  media: "Media Team",
  ec: "Event Coordination",
  design: "Design Team",
  content: "Content Team",
  qrt: "QRT",
};

const SOCIETY_SECTIONS = new Set([
  "cs", "ias", "ies", "sight", "sps", "npss", "edsoc", "css", "embs",
  "pes", "wie", "cass", "ras",
]);

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function sectionLabel(id: string) {
  return SECTION_LABEL[id] ?? id.toUpperCase();
}

function sectionLongLabel(id: string) {
  return SECTION_LONG_LABEL[id] ?? sectionLabel(id);
}

function MemberPortrait({
  member,
  className = "",
  eager = false,
}: {
  member: ExecomMemberDoc;
  className?: string;
  eager?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  if (!member.photoUrl || failed) {
    return (
      <div className={`grid place-items-center bg-[#edf1f3] ${className}`}>
        <span className="font-pixel text-2xl text-slate-300">{initials(member.name)}</span>
      </div>
    );
  }
  return (
    <img
      src={member.photoUrl}
      alt={member.name}
      loading={eager ? "eager" : "lazy"}
      onError={() => setFailed(true)}
      className={`object-cover object-top ${className}`}
    />
  );
}

function MemberDrawer({
  member,
  onClose,
}: {
  member: ExecomMemberDoc;
  onClose: () => void;
}) {
  const opener = useRef<HTMLElement | null>(null);
  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[130] bg-[#06111e]/55 backdrop-blur-sm" />
        <Dialog.Content
          onOpenAutoFocus={() => { opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; }}
          onCloseAutoFocus={(event) => { if (opener.current?.isConnected) { event.preventDefault(); opener.current.focus(); } }}
          className="fixed inset-y-0 right-0 z-[131] flex w-full max-w-[520px] flex-col overflow-y-auto bg-[#f7f8f8] pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] pt-[env(safe-area-inset-top,0px)] shadow-2xl focus:outline-none"
        >
        <div className="flex items-center justify-between border-b border-black/10 px-5 py-4 sm:px-7">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-black/40">
            Execom / {sectionLabel(member.sectionId)} / {String(member.slNo).padStart(2, "0")}
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close member profile"
            className="grid h-11 w-11 place-items-center rounded-full border border-black/10 text-black/55 transition hover:border-ieee-blue hover:text-ieee-blue"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 sm:p-7">
          <div className="relative aspect-[4/5] overflow-hidden bg-slate-100">
            <MemberPortrait member={member} className="h-full w-full" eager />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/45 to-transparent" />
            <span className="absolute bottom-4 right-4 font-pixel text-5xl text-white/55">
              {String(member.slNo).padStart(2, "0")}
            </span>
          </div>

          <div className="border-b border-black/10 py-7">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-ieee-blue">
              {member.position || "Execom member"}
            </p>
            <Dialog.Title className="mt-2 break-words text-4xl font-bold leading-[0.96] tracking-[-0.05em] text-gray-950 sm:text-5xl">
              {member.name}
            </Dialog.Title>
            <Dialog.Description className="mt-4 text-sm leading-6 text-black/60">
              {sectionLongLabel(member.sectionId)}
              {(member.department || member.semester) && " · "}
              {[member.department, member.semester].filter(Boolean).join(" / ")}
            </Dialog.Description>
          </div>

          {(member.linkedin || member.instagram || member.portfolio) && (
            <div className="py-6">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-black/60">Connect</p>
              <div className="mt-4 divide-y divide-black/10 border-y border-black/10">
                {member.linkedin && (
                  <a href={member.linkedin} target="_blank" rel="noopener noreferrer" className="group flex items-center justify-between py-4 text-sm font-semibold transition hover:text-ieee-blue">
                    <span className="inline-flex items-center gap-3"><Linkedin className="h-4 w-4" /> LinkedIn</span><ArrowUpRight className="h-4 w-4 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                  </a>
                )}
                {member.instagram && (
                  <a href={member.instagram} target="_blank" rel="noopener noreferrer" className="group flex items-center justify-between py-4 text-sm font-semibold transition hover:text-ieee-blue">
                    <span className="inline-flex items-center gap-3"><Instagram className="h-4 w-4" /> Instagram</span><ArrowUpRight className="h-4 w-4 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                  </a>
                )}
                {member.portfolio && (
                  <a href={member.portfolio} target="_blank" rel="noopener noreferrer" className="group flex items-center justify-between py-4 text-sm font-semibold transition hover:text-ieee-blue">
                    <span className="inline-flex items-center gap-3"><Globe2 className="h-4 w-4" /> Portfolio</span><ArrowUpRight className="h-4 w-4 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                  </a>
                )}
              </div>
            </div>
          )}
        </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function GridMemberCard({
  member,
  index,
  onOpen,
}: {
  member: ExecomMemberDoc;
  index: number;
  onOpen: () => void;
}) {
  return (
    <article data-execom-member className="group min-w-0">
      <button
        type="button"
        onClick={onOpen}
        className="block w-full text-left outline-none focus-visible:ring-2 focus-visible:ring-ieee-blue focus-visible:ring-offset-4"
        aria-label={`View details for ${member.name}`}
      >
        <div className="relative aspect-[3/4] overflow-hidden rounded-2xl bg-[#edf1f3]">
          <MemberPortrait member={member} className="h-full w-full transition duration-700 group-hover:scale-[1.025]" eager={index < 8} />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/55 to-transparent opacity-0 transition duration-300 group-hover:opacity-100" />
          <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-black/55 backdrop-blur-sm">
            {sectionLabel(member.sectionId)}
          </span>
          <span className="absolute bottom-3 right-3 font-pixel text-3xl text-white opacity-0 transition duration-300 group-hover:opacity-60">
            {String(member.slNo).padStart(2, "0")}
          </span>
        </div>
        <div className="pt-3.5">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-ieee-blue">{member.position || "Member"}</p>
          <h3 className="mt-1.5 text-[15px] font-semibold leading-snug text-gray-900 transition group-hover:text-ieee-blue sm:text-base">{member.name}</h3>
          <p className="mt-1 truncate text-[13px] text-gray-500">{[member.department, member.semester].filter(Boolean).join(" · ") || sectionLongLabel(member.sectionId)}</p>
        </div>
      </button>
      {member.portfolio && (
        <a
          href={member.portfolio}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Visit ${member.name}'s portfolio`}
          className="mt-2 inline-flex min-h-11 items-center gap-1.5 text-xs font-semibold text-ieee-blue underline-offset-4 transition hover:underline"
        >
          <Globe2 className="h-3.5 w-3.5" />
          Portfolio
        </a>
      )}
    </article>
  );
}

function RosterView({
  members,
  onOpen,
}: {
  members: ExecomMemberDoc[];
  onOpen: (member: ExecomMemberDoc) => void;
}) {
  const [previewId, setPreviewId] = useState(members[0]?.id ?? "");
  useEffect(() => {
    if (!members.some((member) => member.id === previewId)) setPreviewId(members[0]?.id ?? "");
  }, [members, previewId]);
  const preview = members.find((member) => member.id === previewId) ?? members[0];

  return (
    <div data-testid="execom-roster" className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="border-t border-black/12">
        <div className="hidden grid-cols-[54px_minmax(180px,1.1fr)_minmax(150px,0.9fr)_minmax(120px,0.7fr)_90px] gap-4 border-b border-black/10 py-3 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-black/60 md:grid">
          <span>No.</span><span>Name</span><span>Role</span><span>Group</span><span>Course</span>
        </div>
        {members.map((member, index) => (
          <button
            key={member.id}
            type="button"
            data-execom-roster-row
            onMouseEnter={() => setPreviewId(member.id)}
            onFocus={() => setPreviewId(member.id)}
            onClick={() => onOpen(member)}
            aria-label={`View details for ${member.name}`}
            className="group grid w-full grid-cols-[60px_minmax(0,1fr)_18px] items-center gap-3 border-b border-black/10 py-3 text-left outline-none transition hover:bg-ieee-blue/[0.035] focus-visible:bg-ieee-blue/[0.055] md:grid-cols-[54px_minmax(180px,1.1fr)_minmax(150px,0.9fr)_minmax(120px,0.7fr)_90px] md:gap-4 md:py-4"
          >
            <div className="md:hidden"><MemberPortrait member={member} className="h-[72px] w-[54px]" /></div>
            <span className="hidden font-pixel text-[9px] text-black/30 md:block">{String(index + 1).padStart(2, "0")}</span>
            <span className="min-w-0">
              <span className="block break-words text-sm font-bold text-gray-950 transition group-hover:text-ieee-blue md:text-base">{member.name}</span>
              <span className="mt-1 block font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-ieee-blue md:hidden">{member.position || "Member"} · {sectionLabel(member.sectionId)}</span>
            </span>
            <span className="hidden break-words text-xs text-black/60 md:block">{member.position || "Member"}</span>
            <span className="hidden truncate font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-black/60 md:block">{sectionLabel(member.sectionId)}</span>
            <span className="hidden truncate text-[11px] text-black/60 md:block">{[member.department, member.semester].filter(Boolean).join(" / ") || "—"}</span>
            <ArrowRight className="h-3.5 w-3.5 text-black/25 transition group-hover:translate-x-1 group-hover:text-ieee-blue md:hidden" />
          </button>
        ))}
      </div>

      {preview && (
        <aside className="sticky top-28 hidden h-fit xl:block">
          <button type="button" onClick={() => onOpen(preview)} aria-label={`View details for ${preview.name}`} className="group block w-full text-left">
            <div className="relative aspect-[3/4] overflow-hidden bg-[#edf1f3]">
              <MemberPortrait member={preview} className="h-full w-full transition duration-500 group-hover:scale-[1.02]" eager />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/60 to-transparent" />
              <span className="absolute bottom-4 left-4 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-white/65">Preview / {sectionLabel(preview.sectionId)}</span>
              <span className="absolute bottom-4 right-4 font-pixel text-4xl text-white/60">{String(preview.slNo).padStart(2, "0")}</span>
            </div>
            <div className="border-b border-black/10 py-4">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-ieee-blue">{preview.position || "Member"}</p>
              <h3 className="mt-1 text-2xl font-bold tracking-[-0.04em] text-gray-950">{preview.name}</h3>
              <p className="mt-2 text-xs text-black/60">{sectionLongLabel(preview.sectionId)}</p>
            </div>
          </button>
          {preview.portfolio && (
            <a
              href={preview.portfolio}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Visit ${preview.name}'s portfolio`}
              className="group flex items-center justify-between border-b border-black/10 py-3 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-black/60 transition hover:text-ieee-blue"
            >
              <span>Portfolio</span>
              <ArrowUpRight className="h-3.5 w-3.5 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </a>
          )}
        </aside>
      )}
    </div>
  );
}

const FullExecom: React.FC<ExecomClientProps> = ({ initialDocs }) => {
  const reduceMotion = Boolean(useReducedMotion());
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedGroup = searchParams.get("group") || "all";
  const activeFilter = initialDocs.some(member => member.sectionId === requestedGroup) ? requestedGroup : "all";
  const viewMode: ViewMode = searchParams.get("view") === "roster" ? "roster" : "grid";
  const query = searchParams.get("q") || "";
  const updateFilter = (key: string, value: string) => setSearchParams(previous => {
    const next = new URLSearchParams(previous);
    if (value && value !== "all" && value !== "grid") next.set(key, value); else next.delete(key);
    return next;
  }, { replace: true, preventScrollReset: true });
  const setActiveFilter = (value: string) => updateFilter("group", value);
  const setViewMode = (value: ViewMode) => updateFilter("view", value);
  const setQuery = (value: string) => updateFilter("q", value);
  const resetDirectory = () => setSearchParams(previous => {
    const next = new URLSearchParams(previous); next.delete("group"); next.delete("q"); return next;
  }, { replace: true, preventScrollReset: true });
  const [selectedMember, setSelectedMember] = useState<ExecomMemberDoc | null>(null);

  const docs = useMemo(
    () => [...initialDocs].sort((a, b) => a.slNo - b.slNo || a.name.localeCompare(b.name)),
    [initialDocs],
  );

  const presentSections = useMemo(() => {
    const remaining = new Set(docs.map((doc) => doc.sectionId.trim()).filter(Boolean));
    const ordered = SECTION_ORDER.filter((id) => remaining.delete(id));
    return [...ordered, ...Array.from(remaining).sort()];
  }, [docs]);

  const counts = useMemo(() => {
    const bySection = new Map<string, number>();
    docs.forEach((doc) => bySection.set(doc.sectionId, (bySection.get(doc.sectionId) ?? 0) + 1));
    return bySection;
  }, [docs]);

  const visibleMembers = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return docs.filter((member) => {
      if (activeFilter !== "all" && member.sectionId !== activeFilter) return false;
      if (!needle) return true;
      return [
        member.name,
        member.position,
        member.department,
        member.semester,
        member.section,
        sectionLabel(member.sectionId),
        sectionLongLabel(member.sectionId),
      ].join(" ").toLowerCase().includes(needle);
    });
  }, [activeFilter, docs, query]);

  const societyCount = presentSections.filter((section) => SOCIETY_SECTIONS.has(section)).length;
  const currentLabel = activeFilter === "all" ? "All groups" : sectionLongLabel(activeFilter);

  if (!docs.length) {
    return (
      <div className="relative min-h-screen overflow-x-hidden bg-[#f7f8f8] text-gray-950">
        <Navbar />
        <main className="relative z-20 mx-auto grid min-h-[60vh] w-full max-w-[1440px] place-items-center px-5 pb-24 pt-28 text-center sm:px-8 sm:pt-32 lg:px-12">
          <div className="max-w-md">
            <Users className="mx-auto h-12 w-12 text-slate-300" />
            <h1 className="mt-6 text-3xl font-bold tracking-[-0.04em]">The team directory is being updated.</h1>
            <p className="mt-3 text-sm leading-6 text-black/60">Committee profiles will appear here when they are published. You can contact the branch for current details.</p>
            <Link to="/" className="mt-6 inline-flex min-h-11 items-center gap-2 text-sm font-bold text-ieee-blue">Return home <ArrowRight className="h-4 w-4" /></Link>
          </div>
        </main>
        <div className="relative z-20"><Footer /></div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#f7f8f8] text-gray-950 selection:bg-ieee-blue/20">
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden opacity-70">
        <StarsBackground starDensity={0.00024} allStarsTwinkle={false} starColor="#64748b" />
      </div>
      <Navbar />
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-[100dvh]"><TechnicalDetails /></div>

      {selectedMember && <MemberDrawer member={selectedMember} onClose={() => setSelectedMember(null)} />}

      <main className="relative z-20 mx-auto w-full max-w-[1440px] px-5 pb-24 pt-16 sm:px-8 sm:pt-20 md:pt-32 lg:px-12">
        <header data-testid="execom-directory-header" className="border-t border-black/10 pt-5 sm:pt-7">
          <div className="flex flex-wrap items-center justify-between gap-4 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-black/60">
            <span className="text-black/55">IEEE Sahrdaya / Execom</span>
            <span>Directory / 2026</span>
          </div>

          <div className="mt-8 grid gap-8 border-b border-black/10 pb-9 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-end lg:gap-16 sm:pb-11">
            <div>
              <p className="font-pixel text-[10px] text-ieee-blue">THE PEOPLE / {String(docs.length).padStart(2, "0")}</p>
              <h1 className="mt-4 max-w-4xl text-[2.75rem] font-bold leading-[0.9] tracking-[-0.065em] sm:text-[4.7rem] lg:text-[5rem]">
                {docs.length} people.<br /><span className="text-ieee-blue">One branch.</span>
              </h1>
            </div>
            <div className="grid grid-cols-3 border-y border-black/10 lg:grid-cols-1 lg:border-y-0 lg:border-l lg:pl-7">
              {[
                ["Groups", presentSections.length],
                ["Societies", societyCount],
                ["Year", "2026"],
              ].map(([label, value], index) => (
                <div key={String(label)} className={`py-4 lg:flex lg:items-baseline lg:justify-between lg:gap-5 ${index > 0 ? "border-l border-black/10 lg:border-l-0 lg:border-t" : ""}`}>
                  <span className="block font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-black/60">{label}</span>
                  <span className="mt-2 block font-pixel text-lg text-gray-900 lg:mt-0">{typeof value === "number" ? String(value).padStart(2, "0") : value}</span>
                </div>
              ))}
            </div>
          </div>
        </header>

        <section data-testid="execom-directory" className="pt-8 sm:pt-10">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <div>
              <p className="font-pixel text-[9px] text-ieee-blue">DIRECTORY / {String(visibleMembers.length).padStart(2, "0")}</p>
              <h2 className="mt-2 text-3xl font-bold tracking-[-0.04em] sm:text-4xl">{currentLabel}</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-black/60">Search by name, role, team or course. Switch views without losing your filter.</p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <label className="relative min-w-[250px]">
                <span className="sr-only">Search Execom</span>
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-black/30" />
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search the roster…"
                  className="h-11 w-full rounded-full border border-black/10 bg-white/85 pl-9 pr-11 text-base shadow-sm outline-none transition placeholder:text-black/30 focus:border-ieee-blue lg:text-sm"
                />
                {query && (
                  <button type="button" onClick={() => setQuery("")} aria-label="Clear Execom search" className="absolute right-0 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center text-black/30 hover:text-ieee-blue"><X className="h-4 w-4" /></button>
                )}
              </label>
              <div className="inline-flex rounded-full border border-black/10 bg-white/85 p-1 shadow-sm" aria-label="Execom directory view">
                <button type="button" onClick={() => setViewMode("grid")} aria-pressed={viewMode === "grid"} className={`inline-flex min-h-11 items-center gap-2 rounded-full px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.13em] transition ${viewMode === "grid" ? "bg-gray-950 text-white" : "text-black/60 hover:text-black"}`}><Grid3X3 className="h-3.5 w-3.5" /> Grid</button>
                <button type="button" onClick={() => setViewMode("roster")} aria-pressed={viewMode === "roster"} className={`inline-flex min-h-11 items-center gap-2 rounded-full px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.13em] transition ${viewMode === "roster" ? "bg-gray-950 text-white" : "text-black/60 hover:text-black"}`}><List className="h-3.5 w-3.5" /> Roster</button>
              </div>
            </div>
          </div>

          <label className="mt-6 grid gap-2 border-y border-black/10 py-4 sm:hidden">
            <span className="text-xs font-semibold text-gray-600">Choose a group</span>
            <select aria-label="Filter Execom by group" value={activeFilter} onChange={event => setActiveFilter(event.target.value)} className="h-11 w-full rounded-lg border border-black/15 bg-white px-3 text-base">
              <option value="all">All groups ({docs.length})</option>
              {presentSections.map(section => <option key={section} value={section}>{sectionLongLabel(section)} ({counts.get(section) ?? 0})</option>)}
            </select>
          </label>
          <div className="mt-6 hidden flex-wrap gap-2 border-y border-black/10 py-3 sm:flex" aria-label="Filter Execom by group">
            <button type="button" onClick={() => setActiveFilter("all")} aria-pressed={activeFilter === "all"} className={`inline-flex min-h-11 shrink-0 items-center rounded-full border px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] transition ${activeFilter === "all" ? "border-ieee-blue bg-ieee-blue text-white" : "border-black/10 bg-white/80 text-black/60 hover:border-black/30 hover:text-black"}`}>All <span className="ml-1 opacity-65">{docs.length}</span></button>
            {presentSections.map((section) => (
              <button key={section} type="button" onClick={() => setActiveFilter(section)} aria-pressed={activeFilter === section} className={`inline-flex min-h-11 shrink-0 items-center rounded-full border px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] transition ${activeFilter === section ? "border-ieee-blue bg-ieee-blue text-white" : "border-black/10 bg-white/80 text-black/60 hover:border-black/30 hover:text-black"}`}>
                {sectionLabel(section)} <span className="ml-1 opacity-65">{counts.get(section) ?? 0}</span>
              </button>
            ))}
          </div>

          <div className="mt-4 flex min-h-11 items-center justify-between gap-3 text-xs text-gray-600">
            <p role="status" aria-live="polite">Showing {visibleMembers.length} of {docs.length} people</p>
            {(query || activeFilter !== "all") && <button type="button" onClick={resetDirectory} className="min-h-11 px-3 font-semibold text-ieee-blue">Reset filters</button>}
          </div>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={viewMode}
              initial={reduceMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -4 }}
              transition={{ duration: reduceMotion ? 0 : 0.18 }}
              className="mt-8"
            >
              {visibleMembers.length === 0 ? (
                <div className="border-y border-black/10 py-20 text-center">
                  <Users className="mx-auto h-8 w-8 text-black/20" />
                  <p className="mt-4 text-xl font-bold tracking-[-0.03em]">No matching people.</p>
                  <button type="button" onClick={resetDirectory} className="mt-4 inline-flex min-h-11 items-center px-3 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-ieee-blue">Reset directory</button>
                </div>
              ) : viewMode === "grid" ? (
                <div data-testid="execom-grid" className="grid grid-cols-2 gap-x-5 gap-y-10 sm:grid-cols-3 sm:gap-x-6 lg:grid-cols-4 lg:gap-x-7">
                  {visibleMembers.map((member, index) => <GridMemberCard key={member.id} member={member} index={index} onOpen={() => setSelectedMember(member)} />)}
                </div>
              ) : (
                <RosterView members={visibleMembers} onOpen={setSelectedMember} />
              )}
            </motion.div>
          </AnimatePresence>
        </section>

        <section className="mt-20 grid gap-6 border-t border-black/10 pt-8 sm:mt-24 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <p className="font-pixel text-[9px] text-ieee-blue">NEXT / GET INVOLVED</p>
            <h2 className="mt-3 text-3xl font-bold tracking-[-0.04em] sm:text-4xl">The next roster starts with participation.</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-black/60">Explore the societies, attend programmes and take part in the work behind the branch.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link to="/societies" className="group inline-flex items-center gap-2 rounded-full border border-black/15 bg-white px-5 py-3 text-xs font-bold transition hover:border-ieee-blue hover:text-ieee-blue">Explore societies <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" /></Link>
            <Link to="/events" className="group inline-flex items-center gap-2 rounded-full bg-gray-950 px-5 py-3 text-xs font-bold text-white transition hover:bg-ieee-blue">See the programme <ArrowUpRight className="h-4 w-4" /></Link>
          </div>
        </section>
      </main>

      <div className="relative z-20"><Footer /></div>
    </div>
  );
};

export { FullExecom as default };
