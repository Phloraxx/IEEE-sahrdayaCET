import { useMemo, useRef, useState } from "react";
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
  CalendarDays,
  Cpu,
  ExternalLink,
  HeartHandshake,
  Lightbulb,
  Mail,
  MapPin,
  Network,
  Pencil,
  Phone,
  Plus,
  Sparkles,
  Users,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { ContextualBlogLinks } from "@/components/blog/ContextualBlogLinks";
import { Instagram, Linkedin } from "@/components/icons";
import { useAuth } from "@/lib/auth-context";
import { APP_URL } from "@/lib/constants";
import { blogHtmlToPlainText } from "@/lib/blog-content";
import { formatDate, formatDateShort } from "@/lib/dates";
import {
  getWieEventArtwork,
  WIE_HERO_IMAGE_PATH,
  WIE_OFFICIAL_BANNER_PATH,
} from "@/lib/wie-media";
import type { SocietyPageData } from "@/server/public/society-detail.server";

type WIEEvent = SocietyPageData["events"][number];
type WIEMember = SocietyPageData["members"][number];

const WIE_PUBLIC_EMAIL = "ieee@sahrdaya.ac.in";
const WIE_INSTAGRAM = "https://www.instagram.com/ieeewie_scet/";

const revealTransition = {
  duration: 0.68,
  ease: [0.22, 1, 0.36, 1],
} as const;

const heroContainerVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.085, delayChildren: 0.04 },
  },
};

const heroItemVariants = {
  hidden: { opacity: 0, y: 22 },
  visible: { opacity: 1, y: 0, transition: revealTransition },
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

function eventYear(date: string): string {
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? "" : String(parsed.getUTCFullYear());
}

function eventCategory(event: WIEEvent): string {
  const value = `${event.title} ${event.tags}`.toLowerCase();
  if (
    value.includes("hack") ||
    value.includes("workshop") ||
    value.includes("ai") ||
    value.includes("cyber")
  ) {
    return "Technical learning";
  }
  if (
    value.includes("business") ||
    value.includes("brand") ||
    value.includes("resume") ||
    value.includes("lead")
  ) {
    return "Leadership and careers";
  }
  return "WIE activity";
}

function eventTags(event: WIEEvent): string[] {
  const explicit = event.tags
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
  return explicit.length > 0 ? explicit.slice(0, 3) : [eventCategory(event)];
}

function eventDescription(event: WIEEvent, limit = 320): string {
  const text = blogHtmlToPlainText(event.description)
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= limit) return text;
  return `${text
    .slice(0, limit)
    .trimEnd()
    .replace(/[.,;:]?$/, "")}…`;
}

function eventHref(event: WIEEvent): string {
  return event.slug ? `/events/${event.slug}` : "/events";
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function WIEEventArtwork({
  event,
  contain = false,
  className = "",
}: {
  event: WIEEvent;
  contain?: boolean;
  className?: string;
}) {
  const artwork = getWieEventArtwork(event.slug, event.bannerUrl);
  const fit = artwork?.fit || (contain ? "contain" : "cover");

  if (artwork) {
    return (
      <img
        src={artwork.src}
        alt={`${event.title} event artwork`}
        loading={contain ? "eager" : "lazy"}
        decoding="async"
        className={`h-full w-full transition-transform duration-700 ease-out motion-reduce:transition-none ${
          fit === "contain"
            ? "object-contain p-4 sm:p-6"
            : "object-cover group-hover:scale-[1.025] motion-reduce:transform-none"
        } ${className}`}
      />
    );
  }

  return (
    <div
      role="img"
      aria-label={`${event.title} event artwork`}
      className={`relative isolate h-full w-full overflow-hidden bg-[#24152a] p-6 text-white ${className}`}
    >
      <div
        className="absolute inset-0 opacity-[0.16]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,.24) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.24) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
      />
      <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full border border-white/20" />
      <div className="absolute -bottom-24 -left-20 h-56 w-56 rounded-full border border-[#d4a8df]/30 bg-[#8b3ba0]/10" />
      <div className="relative z-10 flex h-full flex-col justify-between">
        <div className="flex items-start justify-between gap-4">
          <span className="font-pixel text-[8px] leading-relaxed tracking-[0.16em] text-[#e9c8ef]">
            WIE / ACTIVITY
          </span>
          <span className="font-display text-5xl leading-none text-white/15 sm:text-6xl">
            {eventYear(event.date)}
          </span>
        </div>
        <div>
          <p className="mb-3 text-[10px] font-black uppercase tracking-[0.2em] text-[#d7a5e2]">
            {eventCategory(event)}
          </p>
          <p className="max-w-[18ch] text-2xl font-black leading-[1.05] tracking-tight sm:text-3xl">
            {event.title}
          </p>
        </div>
      </div>
    </div>
  );
}

function SocialLink({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#2c1a31]/15 bg-white text-[#2c1a31] transition hover:-translate-y-0.5 hover:border-[#7a2d8d]/40 hover:text-[#7a2d8d] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7a2d8d]"
    >
      {children}
    </a>
  );
}

function TeamCard({ member, index }: { member: WIEMember; index: number }) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.article
      variants={{
        hidden: { y: reduceMotion ? 0 : 20 },
        visible: { y: 0, transition: revealTransition },
      }}
      whileHover={reduceMotion ? undefined : { y: -5 }}
      transition={{ duration: 0.22 }}
      className="group overflow-hidden rounded-[1.75rem] border border-[#2c1a31]/10 bg-[#fbf8fc] shadow-[0_24px_70px_rgba(50,25,58,0.08)]"
    >
      <div className="relative aspect-[4/5] overflow-hidden bg-[#ded3e1]">
        {member.photoUrl ? (
          <img
            src={member.photoUrl}
            alt={member.name}
            className="h-full w-full object-cover object-top transition duration-500 group-hover:scale-[1.025]"
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-[#24152a] font-display text-7xl text-white/70">
            {initials(member.name)}
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 h-1/3 bg-linear-to-t from-[#1a101e]/75 to-transparent" />
        <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full border border-white/30 bg-white/80 px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.16em] text-[#51205e] backdrop-blur-md">
          <span>{String(index + 1).padStart(2, "0")}</span>
          <span className="h-1 w-1 rounded-full bg-[#7a2d8d]" />
          <span>{member.position}</span>
        </div>
      </div>
      <div className="p-5 sm:p-6">
        <h3 className="text-2xl font-black tracking-tight text-[#211326]">
          {member.name}
        </h3>
        <p className="mt-2 text-sm font-semibold text-[#6f6373]">
          {[member.department, member.batch].filter(Boolean).join(" · ")}
        </p>
        {(member.linkedin ||
          member.instagram ||
          member.email ||
          member.phone) && (
          <div className="mt-5 flex flex-wrap gap-2 border-t border-[#2c1a31]/10 pt-5">
            {member.linkedin && (
              <SocialLink
                href={member.linkedin}
                label={`${member.name} on LinkedIn`}
              >
                <Linkedin className="h-4 w-4" />
              </SocialLink>
            )}
            {member.instagram && (
              <SocialLink
                href={member.instagram}
                label={`${member.name} on Instagram`}
              >
                <Instagram className="h-4 w-4" />
              </SocialLink>
            )}
            {member.email && (
              <a
                href={`mailto:${member.email}`}
                aria-label={`Email ${member.name}`}
                className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#2c1a31]/15 bg-white text-[#2c1a31] transition hover:-translate-y-0.5 hover:border-[#7a2d8d]/40 hover:text-[#7a2d8d] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7a2d8d]"
              >
                <Mail className="h-4 w-4" />
              </a>
            )}
            {member.phone && (
              <a
                href={`tel:${member.phone.replace(/\s+/g, "")}`}
                aria-label={`Call ${member.name}`}
                className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#2c1a31]/15 bg-white text-[#2c1a31] transition hover:-translate-y-0.5 hover:border-[#7a2d8d]/40 hover:text-[#7a2d8d] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7a2d8d]"
              >
                <Phone className="h-4 w-4" />
              </a>
            )}
          </div>
        )}
      </div>
    </motion.article>
  );
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

  const canEdit = useMemo(() => {
    if (!user) return false;
    if (user.role === "admin") return true;
    return user.role === "chair" && data.society.chairs.includes(user.id);
  }, [data.society.chairs, user]);

  const visibleEvents = useMemo(() => {
    if (canEdit) return data.events;
    return data.events.filter(
      (event) => event.status === "published" || event.status === "completed",
    );
  }, [canEdit, data.events]);

  const featuredEvent = useMemo(
    () => visibleEvents.find((event) => event.bannerUrl) || visibleEvents[0],
    [visibleEvents],
  );
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
                  SBA65601 · {archiveYears}
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
                ...revealTransition,
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
                      ...revealTransition,
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

        <section id="activities" className="bg-[#fbf8fc] py-20 sm:py-28">
          <div className="mx-auto max-w-7xl px-5 sm:px-8">
            <div className="mb-12 flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
              <div>
                <p className="font-pixel text-[8px] leading-relaxed tracking-[0.18em] text-[#7a2d8d]">
                  03 / THE WORK
                </p>
                <h2 className="mt-5 font-display text-6xl uppercase leading-none tracking-tight text-[#211326] sm:text-8xl">
                  Featured activity
                </h2>
              </div>
              <div className="flex flex-wrap gap-3">
                {canEdit && (
                  <Link
                    to={`/admin/events/new?society=${data.society.id}`}
                    className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#2c1a31]/15 bg-white px-5 py-2.5 text-sm font-black text-[#24152a] hover:border-[#7a2d8d]/40 hover:text-[#7a2d8d]"
                  >
                    <Plus className="h-4 w-4" /> Add event
                  </Link>
                )}
                <Link
                  to="/events"
                  className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#2c1a31]/15 bg-white px-5 py-2.5 text-sm font-black text-[#24152a] hover:border-[#7a2d8d]/40 hover:text-[#7a2d8d]"
                >
                  All IEEE events <ArrowUpRight className="h-4 w-4" />
                </Link>
              </div>
            </div>

            {featuredEvent ? (
              <motion.article
                initial={
                  reduceMotion ? false : { opacity: 0, y: 30, scale: 0.99 }
                }
                whileInView={{ opacity: 1, y: 0, scale: 1 }}
                viewport={{ once: true, amount: 0.15 }}
                transition={revealTransition}
                className="group overflow-hidden rounded-[2.25rem] border border-[#2c1a31]/12 bg-white shadow-[0_30px_90px_rgba(50,25,58,0.1)] transition-shadow duration-500 hover:shadow-[0_38px_110px_rgba(50,25,58,0.15)] motion-reduce:transition-none"
              >
                <div className="grid lg:grid-cols-[1.02fr_.98fr]">
                  <div className="relative aspect-[4/3] min-h-[360px] overflow-hidden bg-[#211326] sm:min-h-[480px] lg:aspect-auto lg:min-h-full">
                    <WIEEventArtwork event={featuredEvent} />
                    <div className="pointer-events-none absolute inset-0 bg-linear-to-t from-[#1b101e]/30 via-transparent to-transparent" />
                  </div>
                  <div className="flex flex-col justify-between p-7 sm:p-10 lg:p-14">
                    <div>
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="rounded-full bg-[#eee2f0] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-[#672677]">
                          {eventCategory(featuredEvent)}
                        </span>
                        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-[#807184]">
                          {featuredEvent.status}
                        </span>
                      </div>
                      <h3 className="mt-7 max-w-[16ch] font-display text-5xl uppercase leading-[0.94] tracking-tight text-[#211326] sm:text-7xl">
                        {featuredEvent.title}
                      </h3>
                      <div className="mt-8 grid gap-5 border-y border-[#2c1a31]/12 py-6 sm:grid-cols-2">
                        <div className="flex gap-3">
                          <CalendarDays className="mt-0.5 h-5 w-5 shrink-0 text-[#7a2d8d]" />
                          <div>
                            <p className="text-xs font-black uppercase tracking-[0.14em] text-[#655a69]">
                              Date
                            </p>
                            <p className="mt-1 font-bold text-[#2b1b30]">
                              {formatDate(featuredEvent.date)}
                            </p>
                          </div>
                        </div>
                        {featuredEvent.venue && (
                          <div className="flex gap-3">
                            <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-[#7a2d8d]" />
                            <div>
                              <p className="text-xs font-black uppercase tracking-[0.14em] text-[#655a69]">
                                Venue
                              </p>
                              <p className="mt-1 font-bold leading-relaxed text-[#2b1b30]">
                                {featuredEvent.venue}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                      <p className="mt-8 max-w-2xl text-lg leading-relaxed text-[#655a69]">
                        {eventDescription(featuredEvent)}
                      </p>
                      <div className="mt-7 flex flex-wrap gap-2">
                        {eventTags(featuredEvent).map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full border border-[#2c1a31]/12 px-3 py-1.5 text-xs font-bold text-[#655a69]"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="mt-12 flex flex-wrap items-center gap-3">
                      <Link
                        to={eventHref(featuredEvent)}
                        className="inline-flex min-h-12 items-center gap-2 rounded-full bg-[#24152a] px-6 py-3 text-sm font-black text-white transition hover:-translate-y-0.5 hover:bg-[#7a2d8d] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7a2d8d]"
                      >
                        View full activity <ArrowUpRight className="h-4 w-4" />
                      </Link>
                      {canEdit && (
                        <Link
                          to={`/admin/events/${featuredEvent.id}/edit`}
                          className="inline-flex min-h-12 items-center gap-2 rounded-full border border-[#2c1a31]/15 px-5 py-3 text-sm font-black text-[#4e4152] hover:border-[#7a2d8d]/40 hover:text-[#7a2d8d]"
                        >
                          <Pencil className="h-4 w-4" /> Edit
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              </motion.article>
            ) : (
              <div className="rounded-[2rem] border border-dashed border-[#7a2d8d]/30 bg-white px-6 py-20 text-center">
                <Sparkles className="mx-auto h-9 w-9 text-[#7a2d8d]" />
                <h3 className="mt-5 text-2xl font-black text-[#24152a]">
                  No public activity has been published yet.
                </h3>
                <p className="mx-auto mt-3 max-w-lg text-[#6e6172]">
                  Published and completed WIE events will appear here
                  automatically from PocketBase.
                </p>
              </div>
            )}

            {archiveEvents.length > 0 && (
              <div className="mt-20">
                <div className="mb-9 flex flex-col gap-6 border-b border-[#2c1a31]/15 pb-5 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="font-pixel text-[8px] leading-relaxed tracking-[0.18em] text-[#7a2d8d]">
                      ACTIVITY LOG
                    </p>
                    <h3 className="mt-3 text-3xl font-black tracking-tight text-[#24152a] sm:text-4xl">
                      More verified WIE records
                    </h3>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {["all", ...archiveYearOptions].map((year) => (
                      <button
                        key={year}
                        type="button"
                        onClick={() => setSelectedYear(year)}
                        aria-pressed={selectedYear === year}
                        className={`min-h-10 rounded-full border px-4 py-2 text-xs font-black uppercase tracking-[0.12em] transition ${
                          selectedYear === year
                            ? "border-[#24152a] bg-[#24152a] text-white"
                            : "border-[#2c1a31]/15 bg-white text-[#655a69] hover:border-[#7a2d8d]/45 hover:text-[#7a2d8d]"
                        }`}
                      >
                        {year === "all" ? "All years" : year}
                      </button>
                    ))}
                    <span
                      aria-hidden="true"
                      className="ml-2 font-display text-4xl text-[#7a2d8d]"
                    >
                      {String(filteredArchiveEvents.length).padStart(2, "0")}
                    </span>
                  </div>
                </div>

                <div className="grid gap-7 md:grid-cols-2">
                  {filteredArchiveEvents.map((event, index) => (
                    <motion.article
                      key={event.id}
                      initial={false}
                      whileHover={reduceMotion ? undefined : { y: -5 }}
                      transition={{ duration: 0.22 }}
                      className="group overflow-hidden rounded-[1.75rem] border border-[#2c1a31]/10 bg-white shadow-[0_22px_70px_rgba(50,25,58,0.07)] transition-shadow duration-300 hover:shadow-[0_30px_85px_rgba(50,25,58,0.13)] motion-reduce:transition-none"
                    >
                      <Link
                        to={eventHref(event)}
                        className="block focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#7a2d8d]"
                      >
                        <div className="relative aspect-[16/10] overflow-hidden bg-[#211326]">
                          <WIEEventArtwork event={event} />
                          <span className="absolute right-4 top-4 rounded-full border border-white/30 bg-[#1b101e]/70 px-3 py-1.5 font-mono text-[9px] font-bold tracking-[0.14em] text-white backdrop-blur-md">
                            {String(index + 1).padStart(2, "0")}
                          </span>
                        </div>
                        <div className="p-6 sm:p-7">
                          <div className="flex flex-wrap items-center gap-3 text-[10px] font-black uppercase tracking-[0.15em] text-[#7a2d8d]">
                            <span>{formatDateShort(event.date)}</span>
                            <span className="h-1 w-1 rounded-full bg-[#7a2d8d]/40" />
                            <span>{eventCategory(event)}</span>
                          </div>
                          <h4 className="mt-4 text-2xl font-black leading-tight tracking-tight text-[#211326] transition group-hover:text-[#7a2d8d] sm:text-3xl">
                            {event.title}
                          </h4>
                          <p className="mt-4 line-clamp-3 leading-relaxed text-[#6c6070]">
                            {eventDescription(event, 220)}
                          </p>
                          <span className="mt-6 inline-flex items-center gap-2 text-sm font-black text-[#24152a]">
                            Open activity{" "}
                            <ArrowUpRight className="h-4 w-4 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                          </span>
                        </div>
                      </Link>
                      {canEdit && (
                        <div className="border-t border-[#2c1a31]/10 px-6 py-3 sm:px-7">
                          <Link
                            to={`/admin/events/${event.id}/edit`}
                            className="inline-flex items-center gap-2 text-xs font-black text-[#6d6071] hover:text-[#7a2d8d]"
                          >
                            <Pencil className="h-3.5 w-3.5" /> Edit this event
                          </Link>
                        </div>
                      )}
                    </motion.article>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        <section
          id="team"
          className="border-t border-[#2c1a31]/10 bg-[#eee6f0] py-20 sm:py-28"
        >
          <div className="mx-auto max-w-7xl px-5 sm:px-8">
            <div className="grid gap-8 lg:grid-cols-[.65fr_1.35fr] lg:items-end">
              <div>
                <p className="font-pixel text-[8px] leading-relaxed tracking-[0.18em] text-[#7a2d8d]">
                  04 / PEOPLE
                </p>
                <h2 className="mt-5 font-display text-6xl uppercase leading-[0.9] tracking-tight text-[#211326] sm:text-8xl">
                  The team behind the work
                </h2>
              </div>
              <p className="max-w-2xl text-lg leading-relaxed text-[#66596a] lg:justify-self-end">
                Student office bearers coordinate WIE programmes with support
                from the Faculty Incharge and the wider IEEE Sahrdaya Student
                Branch.
              </p>
            </div>

            {studentLeaders.length > 0 ? (
              <motion.div
                className="mt-12 grid gap-7 md:grid-cols-3"
                initial={reduceMotion ? false : "hidden"}
                whileInView="visible"
                viewport={{ once: true, amount: 0.12 }}
                variants={{
                  hidden: {},
                  visible: {
                    transition: { staggerChildren: reduceMotion ? 0 : 0.09 },
                  },
                }}
              >
                {studentLeaders.map((member, index) => (
                  <TeamCard key={member.id} member={member} index={index} />
                ))}
              </motion.div>
            ) : (
              <div className="mt-12 rounded-[2rem] border border-dashed border-[#7a2d8d]/30 bg-white/60 px-6 py-16 text-center">
                <Users className="mx-auto h-9 w-9 text-[#7a2d8d]" />
                <p className="mt-4 font-bold text-[#504255]">
                  Current office-bearer profiles will appear here.
                </p>
              </div>
            )}

            {advisor && (
              <article className="mt-10 overflow-hidden rounded-[2rem] border border-[#2c1a31]/10 bg-[#24152a] text-white shadow-[0_28px_80px_rgba(50,25,58,0.17)]">
                <div className="grid md:grid-cols-[260px_1fr_auto] md:items-center">
                  <div className="aspect-square overflow-hidden bg-[#3b2542] md:aspect-[5/4]">
                    {advisor.photoUrl ? (
                      <img
                        src={advisor.photoUrl}
                        alt={advisor.name}
                        className="h-full w-full object-cover object-top"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center font-display text-6xl text-white/70">
                        {initials(advisor.name)}
                      </div>
                    )}
                  </div>
                  <div className="p-7 sm:p-9">
                    <p className="font-pixel text-[7px] leading-relaxed tracking-[0.18em] text-[#d7a9df]">
                      FACULTY INCHARGE
                    </p>
                    <h3 className="mt-4 text-3xl font-black tracking-tight">
                      {advisor.name}
                    </h3>
                    <p className="mt-2 text-sm font-semibold text-white/60">
                      {[advisor.department, advisor.batch]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    <p className="mt-5 max-w-2xl leading-relaxed text-white/65">
                      Supporting the Affinity Group’s technical, leadership and
                      community initiatives across the academic year.
                    </p>
                  </div>
                  <div className="flex gap-2 border-t border-white/10 p-7 md:border-l md:border-t-0 md:p-8">
                    {advisor.linkedin && (
                      <a
                        href={advisor.linkedin}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`${advisor.name} on LinkedIn`}
                        className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/20 text-white/70 hover:border-[#d7a9df] hover:text-[#d7a9df]"
                      >
                        <Linkedin className="h-4 w-4" />
                      </a>
                    )}
                    {advisor.instagram && (
                      <a
                        href={advisor.instagram}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`${advisor.name} on Instagram`}
                        className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/20 text-white/70 hover:border-[#d7a9df] hover:text-[#d7a9df]"
                      >
                        <Instagram className="h-4 w-4" />
                      </a>
                    )}
                    {advisor.email && (
                      <a
                        href={`mailto:${advisor.email}`}
                        aria-label={`Email ${advisor.name}`}
                        className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/20 text-white/70 hover:border-[#d7a9df] hover:text-[#d7a9df]"
                      >
                        <Mail className="h-4 w-4" />
                      </a>
                    )}
                  </div>
                </div>
              </article>
            )}
          </div>
        </section>

        <section
          id="contact"
          className="relative isolate overflow-hidden bg-[#7a2d8d] py-20 text-white sm:py-28"
        >
          <div
            className="absolute inset-0 -z-20 opacity-[0.16]"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,.25) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.25) 1px, transparent 1px)",
              backgroundSize: "40px 40px",
            }}
          />
          <motion.div
            aria-hidden="true"
            className="absolute -left-24 top-1/2 -z-10 h-72 w-72 -translate-y-1/2 rounded-full bg-white/15 blur-[100px]"
            animate={
              reduceMotion
                ? undefined
                : {
                    x: [0, 90, 20, 0],
                    y: [0, -28, 24, 0],
                    scale: [1, 1.1, 0.96, 1],
                  }
            }
            transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
          />
          <div
            className="absolute -bottom-20 right-0 -z-10 font-display text-[28vw] leading-none text-white/[0.055]"
            aria-hidden="true"
          >
            WIE
          </div>
          <div className="mx-auto grid max-w-7xl min-w-0 gap-12 px-5 sm:px-8 lg:grid-cols-[1fr_.8fr] lg:items-end">
            <div className="min-w-0">
              <p className="max-w-full break-words font-pixel text-[7px] leading-relaxed tracking-[0.14em] text-white/80 sm:text-[8px] sm:tracking-[0.18em]">
                05 / CONTACT AND COLLABORATION
              </p>
              <h2 className="mt-6 max-w-[12ch] font-display text-[clamp(3rem,6vw,6.5rem)] uppercase leading-[0.86] tracking-[-0.025em]">
                Let’s build something meaningful.
              </h2>
            </div>
            <div className="min-w-0">
              <p className="max-w-xl text-lg font-semibold leading-relaxed text-white/90">
                Connect with WIE Sahrdaya for technical sessions, mentoring,
                student programmes, partnerships and inter-institution
                collaboration.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <a
                  href={`mailto:${WIE_PUBLIC_EMAIL}?subject=${encodeURIComponent("WIE Sahrdaya collaboration")}`}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-black text-[#5f216d] transition duration-300 hover:-translate-y-0.5 hover:bg-[#f3e6f5] hover:shadow-[0_16px_38px_rgba(45,15,55,.22)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white motion-reduce:transform-none"
                >
                  <Mail className="h-4 w-4" /> Email WIE Sahrdaya
                </a>
                <a
                  href={WIE_INSTAGRAM}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-white/35 px-6 py-3 text-sm font-black text-white transition duration-300 hover:-translate-y-0.5 hover:bg-white/10 hover:shadow-[0_16px_38px_rgba(45,15,55,.18)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white motion-reduce:transform-none"
                >
                  <Instagram className="h-4 w-4" /> Instagram{" "}
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
                {data.society.defaultWhatsappLink && (
                  <a
                    href={data.society.defaultWhatsappLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-white/35 px-6 py-3 text-sm font-black text-white transition duration-300 hover:-translate-y-0.5 hover:bg-white/10 hover:shadow-[0_16px_38px_rgba(45,15,55,.18)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white motion-reduce:transform-none"
                  >
                    <HeartHandshake className="h-4 w-4" /> Join the community{" "}
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>
              <p className="mt-6 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-white/80">
                {WIE_PUBLIC_EMAIL}
              </p>
            </div>
          </div>
        </section>

        <ContextualBlogLinks />
      </main>

      <Footer />
    </div>
  );
}
