import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
} from "framer-motion";
import {
  ArrowDown,
  ArrowUpRight,
  Cpu,
  HeartHandshake,
  Lightbulb,
  Network,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { ContextualBlogLinks } from "@/components/blog/ContextualBlogLinks";
import { useAuth } from "@/lib/auth-context";
import { getWorkspaceMe } from "@/lib/data/workspace.client";
import { hasScopedWorkspaceCapability } from "@/lib/workspace-permissions";
import { APP_URL } from "@/lib/constants";
import {
  WIE_HERO_IMAGE_PATH,
  WIE_OFFICIAL_BANNER_PATH,
} from "@/lib/wie-media";
import type { SocietyPageData } from "@/server/public/society-detail.server";
import { WIEActivitySection, eventHref, eventYear } from "./WIEActivitySection";
import { WIETeamContactSections } from "./WIETeamContactSections";
import { WIE_REVEAL_TRANSITION } from "./wie-page-motion";

const WIE_PUBLIC_EMAIL = "ieee@sahrdaya.ac.in";
const WIE_INSTAGRAM = "https://www.instagram.com/ieeewie_scet/";

const heroContainerVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.085, delayChildren: 0.04 },
  },
};

const heroItemVariants = {
  hidden: { opacity: 0, y: 22 },
  visible: { opacity: 1, y: 0, transition: WIE_REVEAL_TRANSITION },
};

const focusAreas = [
  {
    number: "01",
    title: "Technical confidence",
    description:
      "Hands-on workshops, hackathons and practical exposure that help students explore emerging technologies by building with them.",
    icon: Cpu,
  },
  {
    number: "02",
    title: "Leadership with purpose",
    description:
      "Talks and programmes that strengthen communication, professional identity, entrepreneurship and volunteer leadership.",
    icon: Lightbulb,
  },
  {
    number: "03",
    title: "Community and collaboration",
    description:
      "A supportive network for peer learning, mentorship, teamwork and collaboration across institutions and disciplines.",
    icon: Network,
  },
] as const;

function safeJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

export function WIEPage({ data }: { data: SocietyPageData }) {
  const { user } = useAuth();
  const reduceMotion = useReducedMotion();
  const heroRef = useRef<HTMLElement>(null);
  const [selectedYear, setSelectedYear] = useState("all");
  const { scrollYProgress: heroScrollProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  });
  const heroMediaY = useTransform(
    heroScrollProgress,
    [0, 1],
    [0, reduceMotion ? 0 : 48],
  );

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
    return data.events.filter(
      (event) => event.status === "published" || event.status === "completed",
    );
  }, [canEdit, data.events]);

  const featuredEvent = visibleEvents[0];
  const archiveEvents = useMemo(
    () => visibleEvents.filter((event) => event.id !== featuredEvent?.id),
    [featuredEvent?.id, visibleEvents],
  );
  const archiveYearOptions = useMemo(
    () =>
      [
        ...new Set(
          archiveEvents.map((event) => eventYear(event.date)).filter(Boolean),
        ),
      ].sort((a, b) => Number(b) - Number(a)),
    [archiveEvents],
  );
  const filteredArchiveEvents = useMemo(
    () =>
      selectedYear === "all"
        ? archiveEvents
        : archiveEvents.filter(
            (event) => eventYear(event.date) === selectedYear,
          ),
    [archiveEvents, selectedYear],
  );
  const advisor = useMemo(
    () =>
      data.members.find((member) => {
        const position = member.position.toLowerCase();
        return (
          position.includes("advisor") ||
          position.includes("incharge") ||
          position.includes("in-charge")
        );
      }),
    [data.members],
  );
  const studentLeaders = useMemo(
    () => data.members.filter((member) => member.id !== advisor?.id),
    [advisor?.id, data.members],
  );
  const archiveYears = useMemo(() => {
    const years = [
      ...new Set(
        visibleEvents.map((event) => eventYear(event.date)).filter(Boolean),
      ),
    ];
    return years.sort((a, b) => Number(b) - Number(a)).join(" / ") || "Current";
  }, [visibleEvents]);

  const organizationSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "IEEE Women in Engineering Sahrdaya",
    alternateName: "IEEE WIE Sahrdaya",
    url: `${APP_URL}/societies/wie`,
    parentOrganization: {
      "@type": "Organization",
      name: "IEEE Sahrdaya Student Branch",
      url: APP_URL,
    },
    ...(data.society.logoUrl ? { logo: data.society.logoUrl } : {}),
    email: WIE_PUBLIC_EMAIL,
  };

  return (
    <div className="min-h-screen overflow-x-clip bg-[#fbf8fc] text-[#211326] selection:bg-[#d8b3df] selection:text-[#24152a]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJson(organizationSchema) }}
      />
      <Navbar />

      <main>
        <section
          ref={heroRef}
          className="relative isolate overflow-hidden border-b border-[#2c1a31]/10 pb-16 pt-28 sm:pb-24 sm:pt-32 lg:min-h-[850px] lg:pb-28"
        >
          <div
            className="absolute inset-0 -z-20 opacity-[0.4]"
            style={{
              backgroundImage:
                "linear-gradient(rgba(76,42,84,.08) 1px, transparent 1px), linear-gradient(90deg, rgba(76,42,84,.08) 1px, transparent 1px)",
              backgroundSize: "44px 44px",
            }}
          />
          <div
            className="absolute -right-[7vw] top-16 -z-10 font-display text-[36vw] leading-none text-[#7a2d8d]/[0.035]"
            aria-hidden="true"
          >
            WIE
          </div>
          <motion.div
            aria-hidden="true"
            className="absolute left-0 top-0 -z-10 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#d9b8e1]/25 blur-[120px]"
            animate={
              reduceMotion
                ? undefined
                : { scale: [1, 1.08, 1], x: [0, 22, 0], y: [0, 14, 0] }
            }
            transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
          />

          <div className="mx-auto grid max-w-7xl min-w-0 items-center gap-12 px-5 sm:px-8 lg:grid-cols-[1.06fr_.94fr] lg:gap-16">
            <motion.div
              className="min-w-0"
              variants={heroContainerVariants}
              initial={reduceMotion ? false : "hidden"}
              animate="visible"
            >
              <motion.div
                variants={heroItemVariants}
                className="mb-8 flex min-w-0 flex-wrap items-center gap-3"
              >
                <span className="inline-flex items-center gap-2 rounded-full border border-[#7a2d8d]/20 bg-white/80 px-3 py-2 font-pixel text-[7px] leading-relaxed tracking-[0.14em] text-[#632572] shadow-sm backdrop-blur-sm">
                  {data.society.logoUrl && (
                    <img
                      src={data.society.logoUrl}
                      alt=""
                      className="h-5 w-7 object-contain"
                    />
                  )}
                  IEEE SAHRDAYA / WIE
                </span>
                <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[#625568]">
                  ACTIVITY ARCHIVE · {archiveYears}
                </span>
              </motion.div>

              <motion.h1
                variants={heroItemVariants}
                className="font-display text-[clamp(3.05rem,7vw,7.2rem)] uppercase leading-[0.82] tracking-[-0.035em] text-[#1c111f]"
              >
                Women in
                <span className="block text-[#7a2d8d]">Engineering</span>
                <span className="block text-[0.66em] tracking-[-0.02em]">
                  at Sahrdaya
                </span>
              </motion.h1>

              <motion.div
                variants={heroItemVariants}
                className="mt-8 max-w-2xl border-l-2 border-[#7a2d8d] pl-5 sm:mt-10 sm:pl-7"
              >
                <p className="text-lg font-semibold leading-relaxed text-[#413448] sm:text-xl">
                  A student community creating space to learn technologies,
                  build confidence, lead with purpose and collaborate across
                  engineering.
                </p>
              </motion.div>

              <motion.div
                variants={heroItemVariants}
                className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center"
              >
                <a
                  href="#activities"
                  className="group inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#24152a] px-6 py-3 text-sm font-black text-white transition duration-300 hover:-translate-y-0.5 hover:bg-[#7a2d8d] hover:shadow-[0_14px_34px_rgba(93,33,109,.22)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7a2d8d] motion-reduce:transform-none"
                >
                  Explore our work
                  <ArrowDown className="h-4 w-4 transition-transform duration-300 group-hover:translate-y-0.5 motion-reduce:transform-none" />
                </a>
                <a
                  href="#team"
                  className="group inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-[#2c1a31]/20 bg-white/80 px-6 py-3 text-sm font-black text-[#24152a] backdrop-blur-sm transition duration-300 hover:-translate-y-0.5 hover:border-[#7a2d8d]/50 hover:text-[#7a2d8d] hover:shadow-[0_14px_34px_rgba(50,25,58,.08)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7a2d8d] motion-reduce:transform-none"
                >
                  Meet the team
                  <ArrowUpRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 motion-reduce:transform-none" />
                </a>
              </motion.div>

              <motion.dl
                variants={heroItemVariants}
                className="mt-12 grid max-w-2xl grid-cols-3 border-y border-[#2c1a31]/15 py-5 sm:mt-14"
              >
                <div className="pr-3">
                  <dt className="font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-[#625568]">
                    Published activities
                  </dt>
                  <dd className="mt-2 font-display text-4xl text-[#24152a] sm:text-5xl">
                    {visibleEvents.length}
                  </dd>
                </div>
                <div className="border-x border-[#2c1a31]/15 px-4 sm:px-6">
                  <dt className="font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-[#625568]">
                    Student leaders
                  </dt>
                  <dd className="mt-2 font-display text-4xl text-[#24152a] sm:text-5xl">
                    {studentLeaders.length}
                  </dd>
                </div>
                <div className="pl-4 sm:pl-6">
                  <dt className="font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-[#625568]">
                    Current team
                  </dt>
                  <dd className="mt-2 font-display text-4xl text-[#24152a] sm:text-5xl">
                    {data.members.length}
                  </dd>
                </div>
              </motion.dl>
            </motion.div>

            <motion.div
              className="relative mx-auto min-w-0 w-full max-w-xl lg:mx-0"
              initial={
                reduceMotion ? false : { opacity: 0, scale: 0.965, x: 28 }
              }
              animate={{ opacity: 1, scale: 1, x: 0 }}
              transition={{
                ...WIE_REVEAL_TRANSITION,
                delay: reduceMotion ? 0 : 0.16,
              }}
              style={{ y: heroMediaY }}
            >
              <div className="absolute -left-3 top-16 hidden h-24 w-px bg-[#7a2d8d]/40 sm:block" />
              <div className="absolute -left-5 top-16 hidden h-px w-5 bg-[#7a2d8d]/40 sm:block" />
              <div className="min-w-0 overflow-hidden rounded-[2rem] border border-[#2c1a31]/15 bg-[#1b101e] shadow-[0_38px_90px_rgba(50,25,58,0.22)]">
                <div className="relative overflow-hidden border-b border-white/10 bg-[#6e287e]">
                  <img
                    src={WIE_OFFICIAL_BANNER_PATH}
                    alt="Official IEEE Women in Engineering visual identity"
                    loading="eager"
                    decoding="async"
                    className="aspect-[1920/430] w-full object-cover"
                  />
                  <motion.div
                    aria-hidden="true"
                    className="absolute inset-y-0 w-1/3 -skew-x-12 bg-linear-to-r from-transparent via-white/15 to-transparent"
                    initial={reduceMotion ? false : { x: "-160%" }}
                    animate={reduceMotion ? undefined : { x: "420%" }}
                    transition={{
                      duration: 1.45,
                      delay: 0.72,
                      ease: "easeOut",
                    }}
                  />
                </div>

                <div className="relative aspect-[5/4] min-h-[360px] overflow-hidden bg-[#120b14] sm:min-h-[500px]">
                  <motion.img
                    src={WIE_HERO_IMAGE_PATH}
                    alt="IEEE WIE Sahrdaya participants in a technical programme at the campus computer lab"
                    loading="eager"
                    fetchPriority="high"
                    decoding="async"
                    className="h-full w-full object-cover"
                    initial={reduceMotion ? false : { scale: 1.055 }}
                    animate={{ scale: 1 }}
                    transition={{ duration: 1.15, ease: [0.22, 1, 0.36, 1] }}
                  />
                  <div className="absolute inset-0 bg-linear-to-t from-[#160b19]/90 via-[#160b19]/10 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 p-6 text-white sm:p-8">
                    <p className="font-pixel text-[7px] leading-relaxed tracking-[0.16em] text-[#e4b9eb]">
                      COMMUNITY IN ACTION
                    </p>
                    <p className="mt-3 max-w-[22ch] text-2xl font-black leading-tight sm:text-3xl">
                      Learning, building and leading together at Sahrdaya.
                    </p>
                    {featuredEvent && (
                      <Link
                        to={eventHref(featuredEvent)}
                        className="group mt-5 inline-flex items-center gap-2 text-sm font-black text-white/85 transition hover:text-white"
                      >
                        Latest activity
                        <ArrowUpRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 motion-reduce:transform-none" />
                      </Link>
                    )}
                  </div>
                </div>
              </div>
              <div className="absolute -bottom-5 right-8 rounded-full border border-[#2c1a31]/15 bg-[#fbf8fc] px-4 py-2 font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-[#6b5b70] shadow-sm">
                Field notes / WIE
              </div>
            </motion.div>
          </div>
        </section>

        <section
          id="about"
          className="overflow-hidden bg-[#1b101e] py-20 text-white sm:py-28"
        >
          <div className="mx-auto grid max-w-7xl min-w-0 gap-12 px-5 sm:px-8 lg:grid-cols-[1.2fr_.8fr] lg:gap-20">
            <div className="min-w-0">
              <p className="font-pixel text-[8px] leading-relaxed tracking-[0.18em] text-[#d5a8de]">
                01 / WHY WIE AT SAHRDAYA
              </p>
              <h2 className="mt-8 max-w-[15ch] font-display text-[clamp(2.85rem,5vw,5.5rem)] uppercase leading-[0.9] tracking-[-0.025em]">
                We create room to{" "}
                <span className="text-[#d3a3dd]">build, speak, lead</span> and
                belong in engineering.
              </h2>
            </div>
            <div className="min-w-0 flex flex-col justify-end border-l border-white/15 pl-6 sm:pl-8">
              <HeartHandshake className="h-9 w-9 text-[#d5a8de]" />
              <p className="mt-7 text-lg font-semibold leading-relaxed text-white/85">
                {data.society.bio ||
                  "IEEE Women in Engineering supports women in engineering and technology through learning, leadership and professional growth."}
              </p>
              <p className="mt-5 leading-relaxed text-white/55">
                At Sahrdaya, that purpose becomes practical through workshops,
                hackathons, career conversations, leadership initiatives and
                collaborative programmes led by students and supported by
                faculty.
              </p>
            </div>
          </div>
        </section>

        <section className="border-b border-[#2c1a31]/10 bg-[#f5f0f6] py-20 sm:py-28">
          <div className="mx-auto max-w-7xl px-5 sm:px-8">
            <div className="mb-12 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
              <div>
                <p className="font-pixel text-[8px] leading-relaxed tracking-[0.18em] text-[#7a2d8d]">
                  02 / HOW WE WORK
                </p>
                <h2 className="mt-5 font-display text-5xl uppercase leading-none tracking-tight text-[#211326] sm:text-7xl">
                  What we focus on
                </h2>
              </div>
              <p className="max-w-md text-sm font-semibold leading-relaxed text-[#6d6071] sm:text-right">
                Our activities combine practical technical learning, leadership
                development and meaningful collaboration.
              </p>
            </div>

            <div className="border-t border-[#2c1a31]/15">
              {focusAreas.map((area) => {
                const Icon = area.icon;
                return (
                  <motion.article
                    key={area.number}
                    initial={
                      reduceMotion ? false : { opacity: 0, x: -12, y: 16 }
                    }
                    whileInView={{ opacity: 1, x: 0, y: 0 }}
                    viewport={{ once: true, amount: 0.35 }}
                    transition={{
                      ...WIE_REVEAL_TRANSITION,
                      delay: Number(area.number) * 0.04,
                    }}
                    className="group grid gap-5 border-b border-[#2c1a31]/15 py-8 transition-colors duration-300 hover:bg-white/45 sm:grid-cols-[80px_1fr_1fr_56px] sm:items-center sm:px-4 sm:py-10 sm:hover:px-5 motion-reduce:transition-none"
                  >
                    <span
                      aria-hidden="true"
                      className="font-display text-5xl text-[#7a2d8d] transition group-hover:text-[#5f216d]"
                    >
                      {area.number}
                    </span>
                    <h3 className="text-2xl font-black tracking-tight text-[#24152a] sm:text-3xl">
                      {area.title}
                    </h3>
                    <p className="max-w-xl leading-relaxed text-[#695d6d]">
                      {area.description}
                    </p>
                    <span
                      className="flex h-12 w-12 items-center justify-center rounded-full border border-[#7a2d8d]/20 bg-white text-[#7a2d8d] transition duration-300 group-hover:rotate-6 group-hover:bg-[#7a2d8d] group-hover:text-white motion-reduce:transform-none motion-reduce:transition-none"
                      aria-hidden="true"
                    >
                      <Icon className="h-5 w-5" />
                    </span>
                  </motion.article>
                );
              })}
            </div>
          </div>
        </section>

        <WIEActivitySection
          societyId={data.society.id}
          canEdit={canEdit}
          featuredEvent={featuredEvent}
          archiveEvents={archiveEvents}
          archiveYearOptions={archiveYearOptions}
          selectedYear={selectedYear}
          onSelectedYearChange={setSelectedYear}
          filteredArchiveEvents={filteredArchiveEvents}
          reduceMotion={Boolean(reduceMotion)}
        />

        <WIETeamContactSections
          studentLeaders={studentLeaders}
          advisor={advisor}
          reduceMotion={Boolean(reduceMotion)}
          publicEmail={WIE_PUBLIC_EMAIL}
          instagramUrl={WIE_INSTAGRAM}
          whatsappLink={data.society.defaultWhatsappLink}
        />

        <ContextualBlogLinks />
      </main>

      <Footer />
    </div>
  );
}
