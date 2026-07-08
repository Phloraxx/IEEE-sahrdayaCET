import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import React, { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users,
  Calendar,
  Heart,
  ExternalLink,
  X,
  Plus,
  Pencil,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { Instagram, Linkedin } from "@/components/icons";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { buildFileUrl } from "@/lib/pb";
import { createPB } from "@/lib/pb.server";
import { APP_URL } from "@/lib/constants";
import { formatDate } from "@/lib/dates";

// Fetch WIE data
const fetchWieData = createServerFn().handler(async () => {
  const pb = createPB();
  const society = await pb
    .collection("societies")
    .getFirstListItem("slug = 'wie'")
    .catch(() => null);

  if (!society) {
    throw new Error("WIE society not found");
  }

  const [events, members] = await Promise.all([
    pb
      .collection("events")
      .getList(1, 100, {
        filter: `society = '${society.id}'`,
        sort: "-date",
      })
      .then((res) => res.items)
      .catch(() => []),
    pb
      .collection("execom")
      .getList(1, 100, {
        filter: `sectionId = 'wie'`,
        sort: "order",
      })
      .then((res) => res.items)
      .catch(() => []),
  ]);

  return {
    society: {
      id: society.id,
      name: society.name,
      slug: society.slug,
      bio: (society.bio as string) || "",
      chairs: Array.isArray(society.chairs) ? society.chairs : [],
      defaultWhatsappLink: (society.defaultWhatsappLink as string) || "",
      logoUrl: society.logo
        ? buildFileUrl("societies", society.id, society.logo as string)
        : "",
      bannerUrl: society.banner
        ? buildFileUrl("societies", society.id, society.banner as string)
        : "",
    },
    events: events.map((e) => ({
      id: e.id,
      title: (e.title as string) || "",
      description: (e.description as string) || "",
      date: (e.date as string) || "",
      venue: (e.venue as string) || "",
      price: (e.price as number) || 0,
      status: (e.status as string) || "published",
      bannerUrl: e.banner
        ? buildFileUrl("events", e.id, e.banner as string)
        : "",
      externalFormUrl: (e.externalFormUrl as string) || "",
    })),
    members: members.map((m) => ({
      id: m.id,
      name: (m.name as string) || "",
      position: (m.position as string) || "",
      department: (m.department as string) || "",
      batch: (m.batch as string) || "",
      photoUrl: m.photo
        ? buildFileUrl("execom", m.id, m.photo as string)
        : "",
      linkedin: (m.linkedin as string) || "",
      instagram: (m.instagram as string) || "",
    })),
  };
});

export const Route = createFileRoute("/societies_/wie")({
  head: () => ({
    meta: [
      { title: "IEEE Women in Engineering (WIE) | IEEE Sahrdaya" },
      {
        name: "description",
        content:
          "IEEE Women in Engineering (WIE) Sahrdaya SB. Promoting women engineers and scientists, inspiring girls to follow their academic interests in engineering.",
      },
      { property: "og:title", content: "IEEE Women in Engineering (WIE) | IEEE Sahrdaya" },
      {
        property: "og:description",
        content:
          "IEEE Women in Engineering (WIE) Sahrdaya SB. Promoting women engineers and scientists, inspiring girls to follow their academic interests in engineering.",
      },
      { property: "og:url", content: `${APP_URL}/societies/wie` },
      { property: "og:image", content: `${APP_URL}/web.png` },
    ],
    links: [{ rel: "canonical", href: `${APP_URL}/societies/wie` }],
  }),
  loader: async () => {
    return fetchWieData();
  },
  component: WIESocietyPage,
});

function WIESocietyPage() {
  const data = Route.useLoaderData();
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const { user } = useAuth();

  const canEdit = useMemo(() => {
    if (!user) return false;
    if (user.role === "admin") return true;
    if (user.role === "chair") {
      const chairsList = (data.society as any).chairs || [];
      return chairsList.includes(user.id);
    }
    return false;
  }, [user, data.society]);

  const visibleEvents = useMemo(() => {
    if (canEdit) return data.events;
    return data.events.filter((e) => e.status === "published" || e.status === "completed");
  }, [canEdit, data.events]);

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

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-slate-800 font-sans selection:bg-purple-500/20 selection:text-purple-900">
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
        <div className="absolute inset-0 bg-radial-gradient from-purple-100/40 via-transparent to-transparent opacity-80 pointer-events-none" />
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-500/5 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-indigo-500/5 rounded-full blur-[120px] pointer-events-none" />

        {/* Diagonal stripes */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(0,0,0,0.01)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.01)_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] pointer-events-none" />

        <div className="max-w-7xl mx-auto px-6 py-12 relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          {/* Left copy */}
          <div className="lg:col-span-7 space-y-6 text-center lg:text-left">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-purple-50 border border-purple-100 text-purple-700 text-xs font-semibold uppercase tracking-wider"
            >
              <Heart className="w-3.5 h-3.5 fill-purple-500 text-purple-500 animate-pulse" />
              {data.society.name}
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight bg-gradient-to-r from-gray-900 via-purple-800 to-indigo-900 bg-clip-text text-transparent leading-tight"
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
                  className="inline-flex items-center justify-center gap-2 h-12 px-6 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 font-semibold text-white shadow-lg shadow-purple-500/25 hover:from-purple-500 hover:to-indigo-500 transition-all duration-300 group"
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
              className="relative group w-72 sm:w-80 aspect-square rounded-2xl bg-white p-8 border border-purple-100 shadow-xl"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-indigo-500/5 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
              <div className="w-full h-full flex items-center justify-center">
                {data.society.logoUrl ? (
                  <img
                    src={data.society.logoUrl}
                    alt={`${data.society.name} Logo`}
                    className="w-full h-full object-contain filter drop-shadow-[0_4px_12px_rgba(168,85,247,0.12)]"
                  />
                ) : (
                  <Heart className="w-32 h-32 text-purple-500/80 stroke-1 fill-purple-500/10 filter drop-shadow-[0_4px_12px_rgba(168,85,247,0.08)]" />
                )}
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* About Section */}
      <section className="py-20 relative border-t border-gray-100 bg-white">
        <div className="max-w-4xl mx-auto px-6 space-y-6">
          <h2 className="text-3xl font-bold bg-gradient-to-r from-gray-900 to-purple-800 bg-clip-text text-transparent text-center">
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
            <div className="relative rounded-2xl bg-white border border-purple-100/75 p-8 sm:p-12 overflow-hidden max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-12 gap-8 items-center shadow-md">
              {/* Profile pic */}
              <div className="md:col-span-4 flex justify-center">
                <div className="relative w-44 h-44 rounded-full p-1.5 bg-gradient-to-r from-purple-500 to-indigo-500 shadow-xl overflow-hidden aspect-square">
                  {advisor.photoUrl ? (
                    <img
                      src={advisor.photoUrl}
                      alt={advisor.name}
                      className="w-full h-full object-cover rounded-full"
                    />
                  ) : (
                    <div className="w-full h-full bg-purple-50 rounded-full flex items-center justify-center text-4xl font-bold text-purple-400">
                      {advisor.name[0]}
                    </div>
                  )}
                </div>
              </div>

              {/* Message */}
              <div className="md:col-span-8 space-y-4 text-center md:text-left">
                <span className="text-xs font-mono uppercase tracking-[0.2em] text-purple-600 font-bold">
                  Faculty Advisor Message
                </span>
                <h3 className="text-2xl font-bold text-gray-900">{advisor.name}</h3>
                <p className="text-sm font-semibold text-slate-500">
                  {advisor.position}
                </p>
                <blockquote className="text-slate-650 italic text-sm leading-relaxed border-l-2 border-purple-400 pl-4 py-1 text-left">
                  "Our goal is to provide a nurturing environment where young women can develop their technical skills, express leadership qualities, and collaborate on real-world engineering solutions."
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
            <h2 className="text-3xl font-bold bg-gradient-to-r from-gray-900 to-purple-800 bg-clip-text text-transparent">
              Office Bearers
            </h2>
            <p className="text-slate-500 text-sm leading-relaxed">
              Meet the dynamic leadership steering the {data.society.name} affinity group activities this year.
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
                  className="group bg-white border border-gray-100 shadow-sm rounded-xl overflow-hidden hover:border-purple-300 transition-all duration-300 flex flex-col hover:shadow-md"
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
                      <span className="text-[10px] font-bold text-purple-700 bg-purple-50 backdrop-blur-xs px-2 py-0.5 rounded-full border border-purple-100">
                        {member.position}
                      </span>
                    </div>
                  </div>
                  <div className="p-4 flex-1 flex flex-col justify-between">
                    <div>
                      <h4 className="font-bold text-gray-900 text-sm line-clamp-1 mb-1 group-hover:text-purple-700 transition-colors">
                        {member.name}
                      </h4>
                      <div className="flex gap-2 text-xs text-slate-550">
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
                          className="text-slate-400 hover:text-purple-650 transition-colors"
                        >
                          <Linkedin className="w-4 h-4" />
                        </a>
                      )}
                      {member.instagram && (
                        <a
                          href={member.instagram}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-slate-400 hover:text-purple-650 transition-colors"
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
              <p className="text-slate-550 text-sm">No office bearers found for WIE</p>
            </div>
          )}
        </div>
      </section>

      {/* Events Section */}
      <section id="events" className="py-20 relative border-t border-gray-100 bg-gray-50/50">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-xl mx-auto mb-16 space-y-4">
            <div className="flex flex-col items-center justify-center gap-4">
              <h2 className="text-3xl font-bold bg-gradient-to-r from-gray-900 to-purple-800 bg-clip-text text-transparent">
                Activities &amp; Campaigns
              </h2>
              {canEdit && (
                <a
                  href={`/admin/events/new?society=${data.society.id}`}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-purple-600 to-indigo-600 shadow-md hover:shadow-lg transition-all duration-300"
                >
                  <Plus className="w-4 h-4" />
                  Add Event
                </a>
              )}
            </div>
            <p className="text-slate-550 text-sm leading-relaxed">
              Explore dynamic conferences, tech bootcamps, and STEM activities hosted by {data.society.name} Sahrdaya SB.
            </p>
          </div>

          {visibleEvents.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {visibleEvents.map((event) => (
                <div
                  key={event.id}
                  className="group bg-white border border-gray-100 shadow-sm rounded-xl hover:rounded-b-none hover:border-purple-300 hover:shadow-md transition-all duration-300 flex flex-col relative z-10 hover:z-30"
                >
                  {/* Event banner */}
                  <div className="relative aspect-video bg-gray-50 overflow-hidden rounded-t-xl">
                    {event.bannerUrl ? (
                      <img
                        src={event.bannerUrl}
                        alt={event.title}
                        className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
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
                        <span className="text-[10px] font-mono uppercase tracking-wider text-purple-600 font-semibold">
                          {formatDate(event.date)}
                        </span>
                        {event.status === "draft" && (
                          <span className="text-[9px] font-mono uppercase tracking-wider bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded border border-amber-200 font-semibold">
                            Draft
                          </span>
                        )}
                      </div>
                      <h4 className="text-lg font-bold text-gray-900 line-clamp-1 group-hover:text-purple-700 transition-colors">
                        {event.title}
                      </h4>
                      <p className="text-slate-600 text-sm leading-relaxed line-clamp-2">
                        {event.description}
                      </p>
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                      <span className="text-xs font-semibold text-purple-700">
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
                        {event.externalFormUrl && (
                          <a
                            href={event.externalFormUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-xs font-bold text-purple-600 hover:text-purple-800 transition-colors"
                          >
                            Register
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>
                    </div>

                    {/* Hover Popup Overlay */}
                    <div className="absolute left-[-1px] right-[-1px] top-full bg-white border border-t-0 border-gray-100 group-hover:border-purple-300 shadow-xl rounded-b-xl p-5 pt-0 z-30 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-all duration-300">
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

      {/* Join WIE CTA Banner */}
      {data.society.defaultWhatsappLink && (
        <section className="py-24 relative border-t border-purple-100 overflow-hidden bg-gradient-to-br from-purple-50/50 to-indigo-50/50">
          <div className="absolute inset-0 bg-radial-gradient from-purple-100/50 via-transparent to-transparent opacity-80 pointer-events-none" />
          <div className="max-w-4xl mx-auto px-6 text-center space-y-6 relative z-10">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900">
              Empower Your Engineering Journey
            </h2>
            <p className="text-slate-600 text-base max-w-xl mx-auto leading-relaxed font-medium">
              Be part of a global network of innovators, leaders, and mentors. Build your tech stack and lead community initiatives with WIE Sahrdaya.
            </p>
            <div className="pt-4">
              <a
                href={data.society.defaultWhatsappLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 h-12 px-8 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 font-semibold text-white shadow-lg shadow-purple-500/25 hover:from-purple-500 hover:to-indigo-500 transition-all duration-300 group"
              >
                Join WIE WhatsApp Community
              </a>
            </div>
          </div>
        </section>
      )}

      <Footer />
    </div>
  );
}
