"use client";

import React, { useState, useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Users,
  Cpu,
  Zap,
  Radio,
  Atom,
  GraduationCap,
  Activity,
  Bolt,
  Heart,
  Cog,
  Wrench,
  Sparkles,
  Camera,
  FileText,
  MessageSquare,
  Palette,
  X,
  Mail,
  Phone,
} from "lucide-react";
import { Linkedin, Instagram } from "@/components/icons";

interface Member {
  slNo: number;
  name: string;
  department: string;
  semester: string;
  position: string;
  photoUrl?: string;
  linkedin?: string;
  instagram?: string;
  email?: string;
  phone?: string;
}

export interface ExecomMemberDoc {
  id: string;
  order?: number;
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
  email?: string;
  phone?: string;
}

interface Section {
  id: string;
  title: string;
  shortTitle: string;
  icon: React.ReactNode;
  members: Member[];
}

interface ExecomClientProps {
  initialDocs: ExecomMemberDoc[];
}

const getSectionIcon = (sectionId: string): React.ReactNode => {
  const iconMap: { [key: string]: React.ReactNode } = {
    core: <Users className="w-4 h-4" />,
    cs: <Cpu className="w-4 h-4" />,
    ias: <Cog className="w-4 h-4" />,
    ies: <Zap className="w-4 h-4" />,
    sight: <Sparkles className="w-4 h-4" />,
    sps: <Radio className="w-4 h-4" />,
    npss: <Atom className="w-4 h-4" />,
    edsoc: <GraduationCap className="w-4 h-4" />,
    css: <Activity className="w-4 h-4" />,
    embs: <Heart className="w-4 h-4" />,
    pes: <Bolt className="w-4 h-4" />,
    wie: <Users className="w-4 h-4" />,
    cass: <Wrench className="w-4 h-4" />,
    ras: <Cog className="w-4 h-4" />,
    tech: <Cpu className="w-4 h-4" />,
    epd: <FileText className="w-4 h-4" />,
    media: <Camera className="w-4 h-4" />,
    ec: <Users className="w-4 h-4" />,
    design: <Palette className="w-4 h-4" />,
    content: <MessageSquare className="w-4 h-4" />,
    qrt: <Zap className="w-4 h-4" />,
  };
  return iconMap[sectionId] || <Users className="w-4 h-4" />;
};

const getShortTitle = (sectionId: string, fullTitle: string): string => {
  const shortMap: { [key: string]: string } = {
    core: "Core",
    cs: "CS",
    ias: "IAS",
    ies: "IES",
    sight: "SIGHT",
    sps: "SPS",
    npss: "NPSS",
    edsoc: "EdSoc",
    css: "CSS",
    embs: "EMBS",
    pes: "PES",
    wie: "WIE",
    cass: "CASS",
    ras: "RAS",
    tech: "Tech",
    epd: "EPD",
    media: "Media",
    ec: "Event",
    design: "Design",
    content: "Content",
    qrt: "QRT",
  };
  return shortMap[sectionId] || fullTitle;
};

const transformToSections = (documents: ExecomMemberDoc[]): Section[] => {
  const groupedBySectionId: {
    [key: string]: { title: string; members: Member[] };
  } = {};

  documents.forEach((doc) => {
    if (!groupedBySectionId[doc.sectionId]) {
      groupedBySectionId[doc.sectionId] = {
        title: doc.section,
        members: [],
      };
    }
    groupedBySectionId[doc.sectionId].members.push({
      slNo: doc.slNo,
      name: doc.name,
      department: doc.department,
      semester: doc.semester,
      position: doc.position,
      photoUrl: doc.photoUrl,
      linkedin: doc.linkedin,
      instagram: doc.instagram,
      email: doc.email,
      phone: doc.phone,
    });
  });

  const sectionOrder = [
    "core",
    "cs",
    "ias",
    "ies",
    "sight",
    "sps",
    "npss",
    "edsoc",
    "css",
    "embs",
    "pes",
    "wie",
    "cass",
    "ras",
    "tech",
    "epd",
    "media",
    "ec",
    "design",
    "content",
    "qrt",
  ];

  return sectionOrder
    .filter((sectionId) => groupedBySectionId[sectionId])
    .map((sectionId) => ({
      id: sectionId,
      title: groupedBySectionId[sectionId].title,
      shortTitle: getShortTitle(sectionId, groupedBySectionId[sectionId].title),
      icon: getSectionIcon(sectionId),
      members: groupedBySectionId[sectionId].members.sort(
        (a, b) => a.slNo - b.slNo,
      ),
    }));
};

const MemberDetailModal: React.FC<{ member: Member; onClose: () => void }> = ({
  member,
  onClose,
}) => {
  const [imgError, setImgError] = useState(false);
  const imageSrc = member.photoUrl || "";
  const hasContactInfo = !!(
    member.linkedin ||
    member.instagram ||
    member.email ||
    member.phone
  );

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-100 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden relative my-4"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-white/90 backdrop-blur-xs shadow-lg flex items-center justify-center hover:bg-white transition-all hover:scale-110"
          >
            <X className="w-5 h-5 text-gray-600" />
          </button>

          <div className="relative h-72 bg-gray-100 overflow-hidden shrink-0">
            {imageSrc && !imgError ? (
              <img
                loading="lazy"
                src={imageSrc}
                alt={member.name}
                onError={() => setImgError(true)}
                className="absolute inset-0 w-full h-full object-contain"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-linear-to-br from-gray-100 to-gray-200">
                <span className="text-6xl font-light text-gray-400">
                  {member.name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .slice(0, 2)}
                </span>
              </div>
            )}
            <div className="absolute top-4 left-4">
              <span className="text-xs font-mono text-white bg-black/40 backdrop-blur-xs px-3 py-1.5 rounded-full">
                #{String(member.slNo).padStart(2, "0")}
              </span>
            </div>
          </div>

          <div className="p-6">
            <div className="mb-4">
              <div className="text-xs font-semibold text-ieee-blue uppercase tracking-wider mb-2">
                {member.position}
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                {member.name}
              </h2>
              <div className="flex items-center gap-3 text-sm text-gray-500">
                <span className="font-medium">{member.department}</span>
                <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
                <span className="font-medium">{member.semester}</span>
              </div>
            </div>

            {hasContactInfo && (
              <div className="space-y-2 pt-4 border-t border-gray-100">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                  Connect
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {member.linkedin && (
                    <a
                      href={member.linkedin}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0077B5] text-white hover:bg-[#006399] transition-all hover:scale-105"
                    >
                      <Linkedin className="w-4 h-4" />
                      <span className="text-sm font-medium">LinkedIn</span>
                    </a>
                  )}
                  {member.instagram && (
                    <a
                      href={member.instagram}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-linear-to-br from-[#833AB4] via-[#E1306C] to-[#F77737] text-white hover:opacity-90 transition-all hover:scale-105"
                    >
                      <Instagram className="w-4 h-4" />
                      <span className="text-sm font-medium">Instagram</span>
                    </a>
                  )}
                  {member.email && (
                    <a
                      href={`mailto:${member.email}`}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gray-100 text-gray-700 hover:bg-gray-200 transition-all hover:scale-105"
                    >
                      <Mail className="w-4 h-4" />
                      <span className="text-sm font-medium">Email</span>
                    </a>
                  )}
                  {member.phone && (
                    <a
                      href={`tel:${member.phone}`}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gray-100 text-gray-700 hover:bg-gray-200 transition-all hover:scale-105"
                    >
                      <Phone className="w-4 h-4" />
                      <span className="text-sm font-medium">Call</span>
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

function MemberCard({
  member,
  index,
  onClick,
}: {
  member: Member;
  index: number;
  onClick: () => void;
}) {
  const [imgError, setImgError] = useState(false);
  const imageSrc = member.photoUrl || "";
  const hasContactInfo = !!(
    member.linkedin ||
    member.instagram ||
    member.email ||
    member.phone
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.03 }}
      className="group cursor-pointer"
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      role="button"
      tabIndex={0}
    >
      <div className="relative bg-white border border-gray-100 rounded-2xl overflow-hidden hover:border-gray-200 hover:shadow-xl transition-all duration-500 hover:scale-105">
        <div className="relative aspect-3/4 bg-gray-50 overflow-hidden">
          {imageSrc && !imgError ? (
            <img
              loading="lazy"
              src={imageSrc}
              alt={member.name}
              onError={() => setImgError(true)}
              className="absolute inset-0 w-full h-full object-cover object-top transition-transform duration-700 group-hover:scale-105"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gray-100">
              <span className="text-4xl font-light text-gray-300">
                {member.name
                  .split(" ")
                  .map((n) => n[0])
                  .join("")
                  .slice(0, 2)}
              </span>
            </div>
          )}
          <div className="absolute top-3 left-3">
            <span className="text-[10px] font-mono text-white/80 bg-black/30 backdrop-blur-xs px-2 py-1 rounded-full">
              {String(member.slNo).padStart(2, "0")}
            </span>
          </div>
          {hasContactInfo && (
            <div className="absolute bottom-3 right-3 transition-all group-hover:scale-110">
              <div className="w-8 h-8 rounded-full bg-ieee-blue/70 backdrop-blur-xs flex items-center justify-center shadow-lg group-hover:bg-ieee-blue">
                <Linkedin className="w-4 h-4 text-white" />
              </div>
            </div>
          )}
        </div>
        <div className="p-4">
          <div className="text-[10px] font-medium text-ieee-blue uppercase tracking-wider mb-1">
            {member.position}
          </div>
          <h3 className="font-semibold text-gray-900 text-sm leading-tight mb-2">
            {member.name}
          </h3>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-gray-400 font-medium">
              {member.department}
            </span>
            <span className="w-1 h-1 rounded-full bg-gray-300" />
            <span className="text-[10px] text-gray-400 font-medium">
              {member.semester}
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

const FullExecom: React.FC<ExecomClientProps> = ({ initialDocs }) => {
  const sections = useMemo(
    () => transformToSections(initialDocs),
    [initialDocs],
  );
  const [activeSection, setActiveSection] = useState("core");
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);

  const currentSection =
    sections.find((s) => s.id === activeSection) || sections[0];

  const scrollToSection = (id: string) => {
    setActiveSection(id);
    setIsMobileNavOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (!sections.length) {
    return (
      <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center">
        <div className="text-center">
          <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">No execom members found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      {selectedMember && (
        <MemberDetailModal
          member={selectedMember}
          onClose={() => setSelectedMember(null)}
        />
      )}

      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-white border-b border-gray-100">
        <div className="flex items-center justify-between px-4 py-3">
          <Link to="/" className="p-2 -ml-2 text-gray-500 hover:text-gray-900">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <span className="font-semibold text-gray-900">EXECOM &apos;26</span>
          <button
            onClick={() => setIsMobileNavOpen(!isMobileNavOpen)}
            className="p-2 -mr-2 text-gray-500"
          >
            <Users className="w-5 h-5" />
          </button>
        </div>
      </div>

      <AnimatePresence>
        {isMobileNavOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="lg:hidden fixed top-14 left-0 right-0 z-40 bg-white border-b border-gray-100 max-h-[60vh] overflow-y-auto"
          >
            <div className="p-4 grid grid-cols-3 gap-2">
              {sections.map((section) => (
                <button
                  key={section.id}
                  onClick={() => scrollToSection(section.id)}
                  className={`p-3 rounded-xl text-center transition-all ${activeSection === section.id ? "bg-ieee-blue text-white" : "bg-gray-50 text-gray-600 hover:bg-gray-100"}`}
                >
                  <div className="flex justify-center mb-1">{section.icon}</div>
                  <span className="text-[10px] font-medium">
                    {section.shortTitle}
                  </span>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <aside className="hidden lg:flex fixed left-0 top-0 bottom-0 w-20 bg-white border-r border-gray-100 flex-col z-50">
        <Link
          to="/"
          className="flex items-center justify-center h-16 border-b border-gray-100 text-gray-400 hover:text-ieee-blue transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <nav className="flex-1 overflow-y-auto py-4 scrollbar-hide">
          <div className="space-y-1 px-2">
            {sections.map((section) => (
              <button
                key={section.id}
                onClick={() => scrollToSection(section.id)}
                className={`group relative w-full flex flex-col items-center py-3 px-1 rounded-xl transition-all duration-300 ${activeSection === section.id ? "bg-ieee-blue text-white" : "text-gray-400 hover:text-gray-600 hover:bg-gray-50"}`}
              >
                {section.icon}
                <span className="text-[8px] font-medium mt-1 text-center leading-tight">
                  {section.shortTitle}
                </span>
                <div className="absolute left-full ml-3 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap z-50">
                  {section.title}
                  <div className="absolute left-0 top-1/2 -translate-x-1 -translate-y-1/2 border-4 border-transparent border-r-gray-900" />
                </div>
              </button>
            ))}
          </div>
        </nav>
        <div className="h-16 flex items-center justify-center border-t border-gray-100">
          <span className="text-[10px] font-bold text-ieee-blue">IEEE</span>
        </div>
      </aside>

      <main className="lg:ml-20 pt-16 lg:pt-0">
        <header className="sticky top-0 lg:top-0 z-30 bg-white/80 backdrop-blur-xl border-b border-gray-100">
          <div className="max-w-6xl mx-auto px-6 py-6 lg:py-8">
            <div className="flex items-start justify-between">
              <div>
                <motion.div
                  key={activeSection}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-center gap-3 mb-2"
                >
                  <div className="w-10 h-10 rounded-xl bg-ieee-blue text-white flex items-center justify-center">
                    {currentSection?.icon}
                  </div>
                  <div>
                    <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">
                      {currentSection?.title}
                    </h1>
                    <p className="text-sm text-gray-400 mt-0.5">
                      {currentSection?.members.length} members
                    </p>
                  </div>
                </motion.div>
              </div>
              <div className="hidden lg:block text-right">
                <p className="text-xs text-gray-400 uppercase tracking-wider">
                  IEEE SB Sahrdaya
                </p>
                <p className="text-lg font-semibold text-gray-900">
                  EXECOM 2026-2027
                </p>
              </div>
            </div>
          </div>
        </header>

        <div className="max-w-6xl mx-auto px-6 py-8 lg:py-12">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeSection}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 lg:gap-6">
                {currentSection?.members.map((member, idx) => (
                  <MemberCard
                    key={`${activeSection}-${idx}`}
                    member={member}
                    index={idx}
                    onClick={() => setSelectedMember(member)}
                  />
                ))}
              </div>
            </motion.div>
          </AnimatePresence>

          <div className="mt-16 pt-8 border-t border-gray-100">
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-4">
              Quick Navigation
            </p>
            <div className="flex flex-wrap gap-2">
              {sections.map((section) => (
                <button
                  key={section.id}
                  onClick={() => scrollToSection(section.id)}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${activeSection === section.id ? "bg-ieee-blue text-white" : "bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"}`}
                >
                  {section.shortTitle}
                </button>
              ))}
            </div>
          </div>
        </div>
      </main>

      <style>{`
                .scrollbar-hide::-webkit-scrollbar { display: none; }
                .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
            `}</style>
    </div>
  );
};

export { FullExecom as default };
