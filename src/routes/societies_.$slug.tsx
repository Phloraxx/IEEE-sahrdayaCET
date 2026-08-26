import { useLoaderData, useParams, type LoaderFunctionArgs } from "react-router";
import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Users,
  Calendar,
  Heart,
  ExternalLink,
  Cpu,
  Zap,
  BookOpen,
  Radio,
  Activity,
  Globe,
  Settings,
  Terminal,
  Plus,
  Pencil,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { getWorkspaceMe } from "@/lib/data/workspace.client";
import { hasScopedWorkspaceCapability } from "@/lib/workspace-permissions";
import { Instagram, Linkedin } from "@/components/icons";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { ContextualBlogLinks } from "@/components/blog/ContextualBlogLinks";
import { formatDate } from "@/lib/dates";
import { canRegisterForEvent } from "@/lib/event-lifecycle";
import { fetchSocietyData, type SocietyPageData } from "@/server/public/society-detail.server";
import { APP_URL } from "@/lib/constants";
import { blogHtmlToPlainText } from "@/lib/blog-content";
import { CanonicalLink } from "@/components/CanonicalLink";
import { EventArtworkPreview } from "@/components/events/EventArtworkPreview";


// Fetch dynamic society data
interface ThemeConfig {
  accentText: string;
  accentBg: string;
  accentBorder: string;
  accentHoverBorder: string;
  accentButtonBg: string;
  accentButtonShadow: string;
  accentLogoGlow: string;
  gradientText: string;
  gradientBg: string;
  borderHighlight: string;
  icon: React.ComponentType<{ className?: string }>;
}

const DEFAULT_THEME = {
  accentText: "text-blue-700",
  accentBg: "bg-blue-50",
  accentBorder: "border-blue-100",
  accentHoverBorder: "hover:border-blue-200",
  accentButtonBg: "from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500",
  accentButtonShadow: "shadow-blue-500/25",
  accentLogoGlow: "from-blue-500/5 to-indigo-500/5",
  gradientText: "from-gray-900 via-blue-800 to-indigo-900",
  gradientBg: "from-blue-100/40",
  borderHighlight: "border-blue-400",
  icon: Users,
};

const SOCIETY_THEMES: Record<string, Partial<ThemeConfig>> = {
  wie: {
    accentText: "text-purple-700",
    accentBg: "bg-purple-50",
    accentBorder: "border-purple-100",
    accentHoverBorder: "hover:border-purple-200",
    accentButtonBg: "from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500",
    accentButtonShadow: "shadow-purple-500/25",
    accentLogoGlow: "from-purple-500/5 to-indigo-500/5",
    gradientText: "from-gray-900 via-purple-800 to-indigo-900",
    gradientBg: "from-purple-100/40",
    borderHighlight: "border-purple-400",
    icon: Heart,
  },
  cs: {
    accentText: "text-blue-700",
    accentBg: "bg-blue-50",
    accentBorder: "border-blue-100",
    accentHoverBorder: "hover:border-blue-200",
    accentButtonBg: "from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500",
    accentButtonShadow: "shadow-blue-500/25",
    accentLogoGlow: "from-blue-500/5 to-indigo-500/5",
    gradientText: "from-gray-900 via-blue-800 to-indigo-900",
    gradientBg: "from-blue-100/40",
    borderHighlight: "border-blue-400",
    icon: Terminal,
  },
  ras: {
    accentText: "text-red-700",
    accentBg: "bg-red-50",
    accentBorder: "border-red-100",
    accentHoverBorder: "hover:border-red-200",
    accentButtonBg: "from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500",
    accentButtonShadow: "shadow-red-500/25",
    accentLogoGlow: "from-red-500/5 to-orange-500/5",
    gradientText: "from-gray-900 via-red-800 to-orange-900",
    gradientBg: "from-red-100/40",
    borderHighlight: "border-red-400",
    icon: Cpu,
  },
  pes: {
    accentText: "text-emerald-700",
    accentBg: "bg-emerald-50",
    accentBorder: "border-emerald-100",
    accentHoverBorder: "hover:border-emerald-200",
    accentButtonBg: "from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500",
    accentButtonShadow: "shadow-emerald-500/25",
    accentLogoGlow: "from-emerald-500/5 to-teal-500/5",
    gradientText: "from-gray-900 via-emerald-800 to-teal-900",
    gradientBg: "from-emerald-100/40",
    borderHighlight: "border-emerald-400",
    icon: Zap,
  },
  ias: {
    accentText: "text-amber-700",
    accentBg: "bg-amber-50",
    accentBorder: "border-amber-100",
    accentHoverBorder: "hover:border-amber-200",
    accentButtonBg: "from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500",
    accentButtonShadow: "shadow-amber-500/25",
    accentLogoGlow: "from-amber-500/5 to-orange-500/5",
    gradientText: "from-gray-900 via-amber-800 to-orange-900",
    gradientBg: "from-amber-100/40",
    borderHighlight: "border-amber-400",
    icon: Settings,
  },
  sps: {
    accentText: "text-teal-700",
    accentBg: "bg-teal-50",
    accentBorder: "border-teal-100",
    accentHoverBorder: "hover:border-teal-200",
    accentButtonBg: "from-teal-600 to-blue-600 hover:from-teal-500 hover:to-blue-500",
    accentButtonShadow: "shadow-teal-500/25",
    accentLogoGlow: "from-teal-500/5 to-blue-500/5",
    gradientText: "from-gray-900 via-teal-800 to-blue-900",
    gradientBg: "from-teal-100/40",
    borderHighlight: "border-teal-400",
    icon: Activity,
  },
  edsoc: {
    accentText: "text-indigo-700",
    accentBg: "bg-indigo-50",
    accentBorder: "border-indigo-100",
    accentHoverBorder: "hover:border-indigo-200",
    accentButtonBg: "from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500",
    accentButtonShadow: "shadow-indigo-500/25",
    accentLogoGlow: "from-indigo-500/5 to-blue-500/5",
    gradientText: "from-gray-900 via-indigo-800 to-blue-900",
    gradientBg: "from-indigo-100/40",
    borderHighlight: "border-indigo-400",
    icon: BookOpen,
  },
  css: {
    accentText: "text-sky-700",
    accentBg: "bg-sky-50",
    accentBorder: "border-sky-100",
    accentHoverBorder: "hover:border-sky-200",
    accentButtonBg: "from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500",
    accentButtonShadow: "shadow-sky-500/25",
    accentLogoGlow: "from-sky-500/5 to-blue-500/5",
    gradientText: "from-gray-900 via-sky-800 to-blue-900",
    gradientBg: "from-sky-100/40",
    borderHighlight: "border-sky-400",
    icon: Radio,
  },
  sight: {
    accentText: "text-amber-700",
    accentBg: "bg-amber-50",
    accentBorder: "border-amber-100",
    accentHoverBorder: "hover:border-amber-200",
    accentButtonBg: "from-amber-600 to-red-600 hover:from-amber-500 hover:to-red-500",
    accentButtonShadow: "shadow-amber-500/25",
    accentLogoGlow: "from-amber-500/5 to-red-500/5",
    gradientText: "from-gray-900 via-amber-800 to-red-900",
    gradientBg: "from-amber-100/40",
    borderHighlight: "border-amber-400",
    icon: Globe,
  },
};

export const meta = ({ data }: { data?: SocietyPageData }) => {
  const name = data?.society.name || "Society";
  const description = blogHtmlToPlainText(data?.society.bio || "").slice(0, 160) || `Learn about ${name} at IEEE Sahrdaya Student Branch.`;
  const url = data?.society.slug ? `${APP_URL}/societies/${data.society.slug}` : `${APP_URL}/societies`;
  return [
    { title: `${name} | IEEE Sahrdaya` },
    { name: "description", content: description },
    { property: "og:title", content: `${name} | IEEE Sahrdaya` },
    { property: "og:description", content: description },
    { property: "og:url", content: url },
    { property: "og:image", content: data?.society.bannerUrl || data?.society.logoUrl || `${APP_URL}/web.png` },
    { name: "twitter:card", content: "summary_large_image" },
  ];
};

export async function loader({ params }: LoaderFunctionArgs): Promise<SocietyPageData> {
  if (!params.slug) throw new Response("Society not found", { status: 404 });
  try { return await fetchSocietyData(params.slug); }
  catch { throw new Response("Society not found", { status: 404 }); }
}

export default function SocietyPage() {
  // See the route-union note in head() above.
  const data = useLoaderData<typeof loader>();
  const params = useParams();
  const { user } = useAuth();

  const workspace = useQuery({
    queryKey: ["workspace-me", user?.id],
    queryFn: getWorkspaceMe,
    enabled: Boolean(user?.id),
    staleTime: 30_000,
    retry: 1,
  });
  const canEdit = hasScopedWorkspaceCapability(
    workspace.data,
    "events.edit",
    { societyId: data.society.id },
  );

  const visibleEvents = useMemo(() => {
    if (canEdit) return data.events;
    return data.events.filter((e) => e.status === "published" || e.status === "completed");
  }, [canEdit, data.events]);

  const theme: ThemeConfig = useMemo(() => {
    const slugKey = (params.slug ?? data.society.slug).toLowerCase();
    const config = SOCIETY_THEMES[slugKey] || {};
    return {
      ...DEFAULT_THEME,
      ...config,
    } as ThemeConfig;
  }, [params.slug, data.society.slug]);

  const IconComponent = theme.icon;

  // Find Faculty Advisor from members list
  const advisor = useMemo(() => {
    return data.members.find(
      (m) =>
        m.position.toLowerCase().includes("advisor") ||
        m.position.toLowerCase().includes("incharge") ||
        m.position.toLowerCase().includes("in-charge")
    );
  }, [data.members]);

  // Remove Advisor from main Execom list
  const execomMembers = useMemo(() => {
    return data.members.filter(
      (m) => m.id !== advisor?.id
    );
  }, [data.members, advisor]);

  const organizationSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: data.society.name,
    url: `${APP_URL}/societies/${data.society.slug}`,
    parentOrganization: { "@type": "Organization", name: "IEEE Sahrdaya Student Branch", url: APP_URL },
    ...(data.society.logoUrl ? { logo: data.society.logoUrl } : {}),
  };

  return (
    <>
      <CanonicalLink path={`/societies/${data.society.slug}`} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema).replace(/</g, "\u003c") }} />
    <div className="min-h-screen bg-[#F8F9FA] text-slate-800 font-sans selection:bg-blue-500/20 selection:text-blue-900">
      <Navbar />

      {/* Cover Banner */}
      {data.society.bannerUrl && (
        <div className="relative h-64 sm:h-80 md:h-[350px] w-full overflow-hidden mt-20">
          <img
            src={data.society.bannerUrl}
            alt={`${data.society.name} Banner`}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#F8F9FA] via-transparent to-transparent" />
        </div>
      )}

      {/* Hero Section */}
      <section className={`relative flex items-center justify-center overflow-hidden ${data.society.bannerUrl ? "min-h-[40vh] py-12" : "min-h-[70vh] pt-24 pb-12"}`}>
        {/* Background glow effects */}
        <div className={`absolute inset-0 bg-radial-gradient ${theme.gradientBg} via-transparent to-transparent opacity-80 pointer-events-none`} />

        <div className="max-w-7xl mx-auto px-6 py-12 relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          {/* Left copy */}
          <div className="lg:col-span-7 space-y-6 text-center lg:text-left">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full ${theme.accentBg} border ${theme.accentBorder} ${theme.accentText} text-xs font-semibold uppercase tracking-wider`}
            >
              <IconComponent className={`w-3.5 h-3.5 ${theme.accentText}`} />
              {data.society.name}
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className={`text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight bg-gradient-to-r ${theme.gradientText} bg-clip-text text-transparent leading-tight`}
            >
              {data.society.name}
            </motion.h1>

            {data.society.defaultWhatsappLink && (
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.3 }}
                className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start pt-4"
              >
                <a
                  href={data.society.defaultWhatsappLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`inline-flex items-center justify-center gap-2 h-12 px-6 rounded-lg bg-gradient-to-r ${theme.accentButtonBg} font-semibold text-white shadow-lg ${theme.accentButtonShadow} transition-all duration-300 group`}
                >
                  Join WhatsApp Group
                </a>
              </motion.div>
            )}
          </div>

          {/* Right Logo Card */}
          <div className="lg:col-span-5 flex justify-center">
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: "spring", stiffness: 100, delay: 0.2 }}
              className={`relative group w-72 sm:w-80 aspect-square rounded-2xl bg-white p-8 border ${theme.accentBorder} shadow-xl`}
            >
              <div className={`absolute inset-0 bg-gradient-to-br ${theme.accentLogoGlow} rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none`} />
              <div className="w-full h-full flex items-center justify-center">
                {data.society.logoUrl ? (
                  <img
                    src={data.society.logoUrl}
                    alt={`${data.society.name} Logo`}
                    className="w-full h-full object-contain filter drop-shadow-[0_4px_12px_rgba(37,99,235,0.12)]"
                  />
                ) : (
                  <IconComponent className={`w-32 h-32 ${theme.accentText}/80 stroke-1 fill-current/10`} />
                )}
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* About Section */}
      <section className="py-20 relative border-t border-gray-100 bg-white">
        <div className="max-w-4xl mx-auto px-6 space-y-6">
          <h2 className={`text-3xl font-bold bg-gradient-to-r ${theme.gradientText} bg-clip-text text-transparent text-center`}>
            About {data.society.name}
          </h2>
          {data.society.bio ? (
            <p className="text-slate-650 leading-relaxed text-lg text-center max-w-3xl mx-auto whitespace-pre-wrap">
              {data.society.bio}
            </p>
          ) : (
            <p className="text-slate-450 leading-relaxed text-lg text-center max-w-3xl mx-auto italic">
              No description available.
            </p>
          )}
        </div>
      </section>

      {/* Faculty Advisor Section */}
      {advisor && (
        <section className="py-20 relative border-t border-gray-100 bg-gray-50/50">
          <div className="max-w-7xl mx-auto px-6">
            <div className={`relative rounded-2xl bg-white border ${theme.accentBorder} p-8 sm:p-12 overflow-hidden max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-12 gap-8 items-center shadow-md`}>
              {/* Profile pic */}
              <div className="md:col-span-4 flex justify-center">
                <div className={`relative w-44 h-44 rounded-full p-1.5 bg-gradient-to-r ${theme.accentButtonBg} shadow-xl overflow-hidden aspect-square`}>
                  {advisor.photoUrl ? (
                    <img
                      src={advisor.photoUrl}
                      alt={advisor.name}
                      className="w-full h-full object-cover rounded-full"
                    />
                  ) : (
                    <div className={`w-full h-full ${theme.accentBg} rounded-full flex items-center justify-center text-4xl font-bold ${theme.accentText}`}>
                      {advisor.name[0]}
                    </div>
                  )}
                </div>
              </div>

              {/* Message */}
              <div className="md:col-span-8 space-y-4 text-center md:text-left">
                <span className={`text-xs font-mono uppercase tracking-[0.2em] ${theme.accentText} font-bold`}>
                  Faculty Advisor Message
                </span>
                <h3 className="text-2xl font-bold text-gray-900">{advisor.name}</h3>
                <p className="text-sm font-semibold text-slate-500">
                  {advisor.position}
                </p>
                <blockquote className={`text-slate-650 italic text-sm leading-relaxed border-l-2 ${theme.borderHighlight} pl-4 py-1 text-left`}>
                  "Our goal is to provide a nurturing environment where young minds can develop their technical skills, express leadership qualities, and collaborate on real-world engineering solutions."
                </blockquote>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Execom (Office Bearers) Section */}
      <section className="py-20 relative border-t border-gray-100 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-xl mx-auto mb-16 space-y-4">
            <h2 className={`text-3xl font-bold bg-gradient-to-r ${theme.gradientText} bg-clip-text text-transparent`}>
              Office Bearers
            </h2>
            <p className="text-slate-550 text-sm leading-relaxed">
              Meet the dynamic leadership steering the {data.society.name} activities this year.
            </p>
          </div>

          {execomMembers.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-6xl mx-auto">
              {execomMembers.map((member, idx) => (
                <motion.div
                  key={member.id}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-50px" }}
                  transition={{ delay: idx * 0.05 }}
                  className={`group bg-white border border-gray-100 shadow-sm rounded-xl overflow-hidden hover:${theme.accentBorder} transition-all duration-300 flex flex-col hover:shadow-md`}
                >
                  <div className="relative aspect-[4/5] bg-gray-50 overflow-hidden">
                    {member.photoUrl ? (
                      <img
                        src={member.photoUrl}
                        alt={member.name}
                        className="absolute inset-0 w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
                        <span className="text-3xl font-bold text-gray-400">
                          {member.name
                            .split(" ")
                            .map((n) => n[0])
                            .join("")}
                        </span>
                      </div>
                    )}
                    <div className="absolute top-2 left-2">
                      <span className={`text-[10px] font-bold ${theme.accentText} ${theme.accentBg} backdrop-blur-xs px-2 py-0.5 rounded-full border ${theme.accentBorder}`}>
                        {member.position}
                      </span>
                    </div>
                  </div>
                  <div className="p-4 flex-1 flex flex-col justify-between">
                    <div>
                      <h4 className={`font-bold text-gray-900 text-sm line-clamp-1 mb-1 group-hover:${theme.accentText} transition-colors`}>
                        {member.name}
                      </h4>
                      <div className="flex gap-2 text-xs text-slate-500">
                        <span>{member.department}</span>
                        <span>&bull;</span>
                        <span>{member.batch}</span>
                      </div>
                    </div>
                    {/* Socials */}
                    <div className="flex gap-3 pt-3 border-t border-gray-100 mt-3">
                      {member.linkedin && (
                        <a
                          href={member.linkedin}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-slate-400 hover:text-blue-650 transition-colors"
                        >
                          <Linkedin className="w-4 h-4" />
                        </a>
                      )}
                      {member.instagram && (
                        <a
                          href={member.instagram}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-slate-400 hover:text-blue-650 transition-colors"
                        >
                          <Instagram className="w-4 h-4" />
                        </a>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 bg-white rounded-xl border border-gray-100 shadow-sm max-w-md mx-auto">
              <Users className="w-12 h-12 text-slate-400 mx-auto mb-3" />
              <p className="text-slate-550 text-sm">No office bearers found for {data.society.name}</p>
            </div>
          )}
        </div>
      </section>

      {/* Events Section */}
      <section id="events" className="py-20 relative border-t border-gray-100 bg-gray-50/50">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-xl mx-auto mb-16 space-y-4">
            <div className="flex flex-col items-center justify-center gap-4">
              <h2 className={`text-3xl font-bold bg-gradient-to-r ${theme.gradientText} bg-clip-text text-transparent`}>
                Activities &amp; Campaigns
              </h2>
              {canEdit && (
                <a
                  href={`/admin/events/new?society=${data.society.id}`}
                  className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-gradient-to-r ${theme.accentButtonBg} shadow-md hover:shadow-lg transition-all duration-300`}
                >
                  <Plus className="w-4 h-4" />
                  Add Event
                </a>
              )}
            </div>
            <p className="text-slate-550 text-sm leading-relaxed">
              Explore dynamic conferences, tech bootcamps, and workshops hosted by {data.society.name} Sahrdaya SB.
            </p>
          </div>

          {visibleEvents.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {visibleEvents.map((event) => (
                <div
                  key={event.id}
                  className={`group bg-white border border-gray-100 shadow-sm rounded-xl hover:rounded-b-none hover:${theme.accentBorder} hover:shadow-md transition-all duration-300 flex flex-col relative z-10 hover:z-30`}
                >
                  {/* Event banner */}
                  <div className="relative aspect-video bg-gray-50 overflow-hidden rounded-t-xl">
                    {event.bannerUrl ? (
                      <EventArtworkPreview
                        src={event.bannerUrl}
                        alt={`${event.title} event artwork`}
                        className="transition-transform duration-500 group-hover:scale-[1.02]"
                      />
                    ) : (
                      <div className="w-full h-full bg-gray-100 flex items-center justify-center">
                        <Calendar className="w-12 h-12 text-slate-400" />
                      </div>
                    )}
                  </div>
                  {/* Info */}
                  <div className="p-5 flex-1 flex flex-col justify-between space-y-4 relative">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-mono uppercase tracking-wider ${theme.accentText} font-semibold`}>
                          {formatDate(event.date)}
                        </span>
                        {event.status === "draft" && (
                          <span className="text-[9px] font-mono uppercase tracking-wider bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded border border-amber-200 font-semibold">
                            Draft
                          </span>
                        )}
                      </div>
                      <h4 className={`text-lg font-bold text-gray-900 line-clamp-1 group-hover:${theme.accentText} transition-colors`}>
                        {event.title}
                      </h4>
                      <p className="text-slate-600 text-sm leading-relaxed line-clamp-2">
                        {event.description}
                      </p>
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                      <span className={`text-xs font-semibold ${theme.accentText}`}>
                        {event.price > 0 ? `\u20B9${event.price}` : "Free Event"}
                      </span>
                      <div className="flex items-center gap-3">
                        {canEdit && (
                          <a
                            href={`/admin/events/${event.id}/edit`}
                            className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-slate-900 transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            Edit
                          </a>
                        )}
                        {event.externalFormUrl && canRegisterForEvent({ ...event, registrationOpen: true }) && (
                          <a
                            href={event.externalFormUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`inline-flex items-center gap-1.5 text-xs font-bold ${theme.accentText} hover:opacity-80 transition-colors`}
                          >
                            Register
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>
                    </div>

                    {/* Hover Popup Overlay */}
                    <div className={`absolute left-[-1px] right-[-1px] top-full bg-white border border-t-0 border-gray-100 group-hover:${theme.accentBorder} shadow-xl rounded-b-xl p-5 pt-0 z-30 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-all duration-300`}>
                      <div className="border-t border-gray-100/50 pt-3">
                        <p className="text-slate-650 text-sm leading-relaxed whitespace-pre-wrap">
                          {event.description}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 bg-white rounded-xl border border-gray-100 shadow-sm max-w-md mx-auto">
              <Calendar className="w-12 h-12 text-slate-400 mx-auto mb-3" />
              <p className="text-slate-550 text-sm">No recent activities published yet.</p>
            </div>
          )}
        </div>
      </section>

      {/* Join Society CTA Banner */}
      {data.society.defaultWhatsappLink && (
        <section className={`py-24 relative border-t ${theme.accentBorder} overflow-hidden bg-gradient-to-br ${theme.accentBg}/50 to-indigo-50/50`}>
          <div className={`absolute inset-0 bg-radial-gradient ${theme.gradientBg} via-transparent to-transparent opacity-80 pointer-events-none`} />
          <div className="max-w-4xl mx-auto px-6 text-center space-y-6 relative z-10">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900">
              Empower Your Engineering Journey
            </h2>
            <p className="text-slate-600 text-base max-w-xl mx-auto leading-relaxed font-medium">
              Be part of a global network of innovators, leaders, and mentors. Build your tech stack and lead community initiatives with {data.society.name}.
            </p>
            <div className="pt-4">
              <a
                href={data.society.defaultWhatsappLink}
                target="_blank"
                rel="noopener noreferrer"
                className={`inline-flex items-center justify-center gap-2 h-12 px-8 rounded-lg bg-gradient-to-r ${theme.accentButtonBg} font-semibold text-white shadow-lg ${theme.accentButtonShadow} transition-all duration-300 group`}
              >
                Join {data.society.name} WhatsApp Community
              </a>
            </div>
          </div>
        </section>
      )}

      <ContextualBlogLinks />
      <Footer />
    </div>
    </>
  );
}
