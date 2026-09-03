import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ExternalLink, HeartHandshake, Mail, Phone, Users } from "lucide-react";
import { Instagram, Linkedin } from "@/components/icons";
import type { SocietyPageData } from "@/server/public/society-detail.server";
import { WIE_REVEAL_TRANSITION } from "./wie-page-motion";

type WIEMember = SocietyPageData["members"][number];

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function SocialLink({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: ReactNode;
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
        visible: { y: 0, transition: WIE_REVEAL_TRANSITION },
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


export interface WIETeamContactSectionsProps {
  studentLeaders: WIEMember[];
  advisor?: WIEMember;
  reduceMotion: boolean;
  publicEmail: string;
  instagramUrl: string;
  whatsappLink: string;
}

export function WIETeamContactSections({
  studentLeaders,
  advisor,
  reduceMotion,
  publicEmail,
  instagramUrl,
  whatsappLink,
}: WIETeamContactSectionsProps) {
  return (
    <>
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
                href={`mailto:${publicEmail}?subject=${encodeURIComponent("WIE Sahrdaya collaboration")}`}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-black text-[#5f216d] transition duration-300 hover:-translate-y-0.5 hover:bg-[#f3e6f5] hover:shadow-[0_16px_38px_rgba(45,15,55,.22)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white motion-reduce:transform-none"
              >
                <Mail className="h-4 w-4" /> Email WIE Sahrdaya
              </a>
              <a
                href={instagramUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-white/35 px-6 py-3 text-sm font-black text-white transition duration-300 hover:-translate-y-0.5 hover:bg-white/10 hover:shadow-[0_16px_38px_rgba(45,15,55,.18)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white motion-reduce:transform-none"
              >
                <Instagram className="h-4 w-4" /> Instagram{" "}
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
              {whatsappLink && (
                <a
                  href={whatsappLink}
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
              {publicEmail}
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
