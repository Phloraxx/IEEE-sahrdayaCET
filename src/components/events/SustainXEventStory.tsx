import { motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, ArrowUpRight, CalendarDays, Leaf, MapPin, Trophy, Users } from "lucide-react";
import { Link } from "react-router";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import { EventArtworkPreview } from "@/components/events/EventArtworkPreview";
import { EventBannerFallback } from "@/components/events/EventBannerFallback";
import { resolveEventArtwork } from "@/lib/event-artwork";
import type { SerializableEvent } from "@/server/public/events.server";

type Props = {
  event: SerializableEvent;
  canonicalUrl: string;
  schemaJson: string;
};

const phases = [
  {
    number: "01",
    verb: "Identify",
    title: "Start with the street, not the solution.",
    body: "Students identified a real sustainability problem in their locality and documented it with photographic evidence.",
  },
  {
    number: "02",
    verb: "Innovate",
    title: "Turn observations into something buildable.",
    body: "Shortlisted teams moved through a campus bootcamp, technical mentorship and structured solution development.",
  },  {
    number: "03",
    verb: "Present",
    title: "Put the idea in front of people who can challenge it.",
    body: "Teams pitched their proposed solutions to an IEEE and faculty panel, where the ideas were formally evaluated.",
  },
] as const;

const challengeThemes = [
  "Urban water & pollution",
  "Accessible menstrual care",
  "Climate-resilient housing",
  "Food waste",
  "Urban heat",
  "Roadside waste",
  "Safer mobility",
  "Air quality",
  "Energy visibility",
  "Flooding & drainage",
  "Smart waste systems",
  "Human-wildlife conflict",
] as const;

const winners = [
  {
    place: "01",
    team: "HYDRO",
    title: "Integrated oil–solid waste management",
    body: "A low-cost canal and coastal-water treatment concept combining floating-debris segregation with reusable hair-based oil sorption.",
  },  {
    place: "02",
    team: "ZERO POINT2",
    title: "Accessible sustainable menstrual care",
    body: "A practical campus-focused response to affordability and access barriers around sustainable menstrual products.",
  },
  {
    place: "03",
    team: "UNEMPLOYED",
    title: "Vernacular intelligence for resilient communities",
    body: "A climate-resilience platform translating Kerala’s traditional architectural knowledge and local hazard data into practical housing recommendations.",
  },
] as const;

const teams = [
  "HYDRO",
  "ZERO POINT2",
  "UNEMPLOYED",
  "URBANOVA",
  "WATTWISE",
  "COMMUTEMATE",
  "BEYOND THE BIN",
  "TEAM FOSS",
  "TITAN",
  "VOIE SÛRE",
  "X-FACTOR",
  "TEAM WASTED",
  "TEAM Z",
  "NIK",
] as const;
const criteria = [
  ["Sustainability & community impact", "30"],
  ["Innovation", "20"],
  ["Technical feasibility", "20"],
  ["Cost effectiveness", "15"],
  ["Presentation clarity", "15"],
] as const;

function Reveal({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const reduceMotion = Boolean(useReducedMotion());
  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.18 }}
      transition={{ duration: reduceMotion ? 0 : 0.5, ease: [0.16, 1, 0.3, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export default function SustainXEventStory({ event, canonicalUrl, schemaJson }: Props) {
  const artwork = resolveEventArtwork(event);
  const reduceMotion = Boolean(useReducedMotion());

  return (
    <main className="min-h-screen overflow-hidden bg-[#f3f2f8] text-[#101114] selection:bg-[#6558c9] selection:text-white">
      <link rel="canonical" href={canonicalUrl} />      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: schemaJson }} />
      <Navbar mobileAlign="right" />

      <section className="relative isolate min-h-[94svh] overflow-hidden border-b border-black/10 pt-24 sm:pt-28">
        <div aria-hidden="true" className="absolute -left-28 -top-28 h-72 w-72 rounded-full bg-[#c9c1f2] sm:h-96 sm:w-96" />
        <div aria-hidden="true" className="absolute right-[-18rem] top-[-7rem] h-[42rem] w-[42rem] rounded-full border-2 border-[#6558c9]/65 sm:right-[-13rem]" />
        <div aria-hidden="true" className="absolute right-[-15rem] top-[-4rem] h-[36rem] w-[36rem] rounded-full border-2 border-[#319b9a]/65 sm:right-[-10rem]" />
        <div aria-hidden="true" className="absolute bottom-12 right-12 hidden h-28 w-28 bg-[radial-gradient(circle,#9f8cea_1.5px,transparent_1.5px)] [background-size:14px_14px] opacity-55 lg:block" />

        <div className="relative mx-auto flex min-h-[calc(94svh-6rem)] max-w-[1440px] flex-col px-5 pb-10 sm:px-8 lg:px-12">
          <div className="flex items-center justify-between border-b border-black/12 py-5">
            <Link to="/events" className="group inline-flex min-h-11 items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-black/55 transition hover:text-[#6558c9]">
              <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" /> All events
            </Link>
            <span className="hidden text-[9px] font-bold uppercase tracking-[0.22em] text-black/40 sm:block">Event dossier · 20.08.2026</span>
          </div>

          <div className="grid flex-1 gap-10 py-10 lg:grid-cols-12 lg:items-end lg:gap-12 lg:py-14">
            <div className="relative z-10 lg:col-span-8">
              <motion.p
                initial={reduceMotion ? false : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: reduceMotion ? 0 : 0.45 }}
                className="text-[10px] font-bold uppercase tracking-[0.34em] text-[#319b9a]"
              >
                See the challenge. Shape the change.
              </motion.p>              <div className="mt-7 overflow-hidden">
                <motion.h1
                  initial={reduceMotion ? false : { y: "105%" }}
                  animate={{ y: 0 }}
                  transition={{ duration: reduceMotion ? 0 : 0.72, ease: [0.16, 1, 0.3, 1], delay: reduceMotion ? 0 : 0.08 }}
                  className="text-[clamp(4.6rem,11vw,10.5rem)] font-black leading-[0.72] tracking-[-0.085em]"
                >
                  SUSTAIN<span className="bg-[linear-gradient(135deg,#319b9a_0_48%,#6558c9_50%_100%)] bg-clip-text text-transparent">X</span>
                </motion.h1>
              </div>
              <motion.p
                initial={reduceMotion ? false : { opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: reduceMotion ? 0 : 0.52, delay: reduceMotion ? 0 : 0.18 }}
                className="mt-6 max-w-3xl text-[clamp(1.5rem,3.2vw,3.15rem)] font-semibold leading-[0.96] tracking-[-0.055em]"
              >
                From Street to Smart City
              </motion.p>
              <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-[10px] font-bold uppercase tracking-[0.16em] text-black/52">
                <span className="inline-flex items-center gap-2"><CalendarDays className="h-4 w-4 text-[#6558c9]" />20 August 2026</span>
                <span className="inline-flex items-center gap-2"><MapPin className="h-4 w-4 text-[#319b9a]" />{event.venue || "Sahrdaya College"}</span>
                <span className="inline-flex items-center gap-2"><Leaf className="h-4 w-4 text-[#6558c9]" />UN SDG 11</span>
              </div>
            </div>

            <motion.div              initial={reduceMotion ? false : { opacity: 0, y: 26, rotate: 1.5 }}
              animate={{ opacity: 1, y: 0, rotate: -1.3 }}
              transition={{ duration: reduceMotion ? 0 : 0.58, delay: reduceMotion ? 0 : 0.26, ease: [0.16, 1, 0.3, 1] }}
              className="relative mx-auto w-full max-w-[340px] self-end border border-black/15 bg-white p-2 shadow-[0_24px_80px_rgba(55,42,113,.18)] lg:col-span-4 lg:mx-0 lg:ml-auto"
            >
              <div className="aspect-[4/5] overflow-hidden bg-[#171820]">
                {artwork ? (
                  <EventArtworkPreview src={artwork.src} alt="SustainX event artwork" />
                ) : (
                  <EventBannerFallback title={event.title} societyName={event.society?.name} societySlug={event.society?.slug} />
                )}
              </div>
              <div className="flex items-center justify-between px-2 pb-2 pt-3 text-[9px] font-bold uppercase tracking-[0.18em] text-black/42">
                <span>IEEE Sahrdaya</span><span>Archive / 2026</span>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      <section className="border-b border-black/10 bg-[#101114] text-white">
        <div className="mx-auto grid max-w-[1440px] grid-cols-2 md:grid-cols-4">
          {[["14", "teams"], ["03", "phases"], ["11", "UN SDG"], ["03", "winners"]].map(([value, label]) => (
            <div key={label} className="border-white/12 px-5 py-8 even:border-l md:border-l md:first:border-l-0 sm:px-8 lg:px-12 lg:py-10">
              <p className="text-4xl font-black tracking-[-0.06em] sm:text-5xl">{value}</p>
              <p className="mt-2 text-[9px] font-bold uppercase tracking-[0.2em] text-white/46">{label}</p>
            </div>
          ))}
        </div>
      </section>
      <section className="relative border-b border-black/10 py-20 sm:py-28 lg:py-36">
        <div className="mx-auto grid max-w-[1440px] gap-12 px-5 sm:px-8 lg:grid-cols-12 lg:px-12">
          <Reveal className="lg:col-span-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-[#6558c9]">What SustainX became</p>
            <p className="mt-5 text-xs font-bold uppercase tracking-[0.14em] text-black/35">One campus. Fourteen teams. Local problems first.</p>
          </Reveal>
          <Reveal className="lg:col-span-8">
            <h2 className="max-w-5xl text-[clamp(2.7rem,6.8vw,6.8rem)] font-semibold leading-[0.9] tracking-[-0.068em]">
              Small local changes can redraw the way a city works.
            </h2>
            <p className="mt-8 max-w-3xl text-base leading-7 text-black/62 sm:text-lg sm:leading-8">
              SustainX brought students together to identify real sustainability challenges, explore practical ideas and reimagine how everyday interventions can contribute to safer, more inclusive, resilient and sustainable communities.
            </p>
          </Reveal>
        </div>
        <div aria-hidden="true" className="mx-auto mt-16 max-w-[1440px] overflow-hidden px-5 sm:px-8 lg:px-12">
          <p className="whitespace-nowrap text-[clamp(4rem,11vw,10rem)] font-black leading-none tracking-[-0.075em] text-black/[0.045]">
            STREET → SYSTEM → COMMUNITY
          </p>
        </div>
      </section>

      <section className="border-b border-black/10 bg-[#eeecf7] py-20 sm:py-28">
        <div className="mx-auto max-w-[1440px] px-5 sm:px-8 lg:px-12">
          <Reveal className="flex items-end justify-between gap-6 border-b border-black/14 pb-6">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-[#319b9a]">The journey</p>
              <h2 className="mt-3 text-4xl font-semibold tracking-[-0.055em] sm:text-6xl">Identify. Innovate. Present.</h2>
            </div>
            <span className="hidden text-[9px] font-bold uppercase tracking-[0.2em] text-black/35 md:block">3 phases / 1 challenge</span>
          </Reveal>
          <div className="relative mt-4">
            <div aria-hidden="true" className="absolute bottom-0 left-[27px] top-0 w-px bg-[#6558c9]/35 sm:left-[43px]" />
            {phases.map((phase, index) => (
              <Reveal key={phase.number} className="relative grid gap-5 border-b border-black/10 py-10 last:border-b-0 sm:grid-cols-[88px_1fr] sm:gap-8 sm:py-14">
                <div className="relative z-10 flex h-14 w-14 items-center justify-center rounded-full border-2 border-[#6558c9] bg-[#eeecf7] text-sm font-black text-[#6558c9] sm:h-[88px] sm:w-[88px] sm:text-xl">
                  {phase.number}
                </div>
                <div className={`max-w-4xl ${index % 2 === 1 ? "sm:ml-[8%]" : ""}`}>
                  <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#319b9a]">{phase.verb}</p>
                  <h3 className="mt-3 text-2xl font-semibold leading-[1.02] tracking-[-0.045em] sm:text-4xl">{phase.title}</h3>
                  <p className="mt-4 max-w-2xl text-sm leading-6 text-black/58 sm:text-base sm:leading-7">{phase.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden border-b border-black/10 bg-[#101114] py-20 text-white sm:py-28 lg:py-32">
        <div aria-hidden="true" className="absolute -right-32 top-[-12rem] h-[38rem] w-[38rem] rounded-full border border-[#319b9a]/40" />
        <div aria-hidden="true" className="absolute -right-24 top-[-8rem] h-[31rem] w-[31rem] rounded-full border border-[#6558c9]/55" />
        <div className="relative mx-auto max-w-[1440px] px-5 sm:px-8 lg:px-12">
          <Reveal>
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-[#8ce0d8]">Challenge area / SDG 11</p>
            <h2 className="mt-4 max-w-5xl text-[clamp(2.8rem,6.5vw,6.4rem)] font-semibold leading-[0.9] tracking-[-0.065em]">
              The city was the brief.
            </h2>
          </Reveal>          <Reveal className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {challengeThemes.map((theme, index) => (
              <div key={theme} className="group flex min-h-24 items-end justify-between border border-white/14 bg-white/[0.025] p-5 transition hover:border-[#8ce0d8]/55 hover:bg-white/[0.05]">
                <span className="max-w-[14rem] text-base font-semibold leading-tight tracking-[-0.025em]">{theme}</span>
                <span className="text-[9px] font-bold tabular-nums text-white/28">{String(index + 1).padStart(2, "0")}</span>
              </div>
            ))}
          </Reveal>
          <Reveal className="mt-12 grid gap-6 border-t border-white/15 pt-8 lg:grid-cols-12">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40 lg:col-span-3">The question</p>
            <blockquote className="text-2xl font-medium leading-[1.08] tracking-[-0.04em] text-white/88 sm:text-4xl lg:col-span-8">
              “What can we change here, with what we already know, have and can realistically build?”
            </blockquote>
          </Reveal>
        </div>
      </section>

      <section className="border-b border-black/10 py-20 sm:py-28 lg:py-36">
        <div className="mx-auto max-w-[1440px] px-5 sm:px-8 lg:px-12">
          <Reveal className="grid gap-8 border-b border-black/14 pb-8 lg:grid-cols-12 lg:items-end">
            <div className="lg:col-span-8">
              <p className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.25em] text-[#6558c9]"><Trophy className="h-4 w-4" />The podium</p>
              <h2 className="mt-4 text-[clamp(3rem,7vw,7rem)] font-semibold leading-[0.88] tracking-[-0.07em]">Three ideas rose to the top.</h2>
            </div>
            <p className="max-w-sm text-sm leading-6 text-black/52 lg:col-span-4 lg:ml-auto">Selected for the strength of the idea and the way it was developed and presented through SustainX.</p>
          </Reveal>

          <div className="mt-4">
            {winners.map((winner) => (
              <Reveal key={winner.place} className="grid gap-5 border-b border-black/12 py-9 sm:grid-cols-[90px_1fr] sm:gap-8 sm:py-12 lg:grid-cols-[130px_1fr_1fr] lg:items-start">
                <p className="text-5xl font-black tracking-[-0.07em] text-[#6558c9] sm:text-6xl">{winner.place}</p>                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#319b9a]">Team</p>
                  <h3 className="mt-2 text-3xl font-black tracking-[-0.055em] sm:text-5xl">{winner.team}</h3>
                  <p className="mt-3 text-lg font-semibold tracking-[-0.025em] text-black/66">{winner.title}</p>
                </div>
                <p className="max-w-xl text-sm leading-6 text-black/58 sm:col-start-2 lg:col-start-auto lg:text-base lg:leading-7">{winner.body}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-black/10 bg-[#dcd6f4] py-20 sm:py-28">
        <div className="mx-auto max-w-[1440px] px-5 sm:px-8 lg:px-12">
          <Reveal className="grid gap-8 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <p className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.25em] text-[#5649b7]"><Users className="h-4 w-4" />14 teams</p>
              <h2 className="mt-4 text-4xl font-semibold leading-[0.95] tracking-[-0.055em] sm:text-6xl">Fourteen ways of seeing the city differently.</h2>
            </div>
            <p className="max-w-xl text-sm leading-6 text-black/58 lg:col-span-5 lg:col-start-8 lg:pt-8 sm:text-base sm:leading-7">Every team entered the same SDG 11 challenge from a different lived problem. The archive below records the participating team names without publishing private participant information.</p>
          </Reveal>
          <div className="mt-12 grid border-l border-t border-black/16 sm:grid-cols-2 lg:grid-cols-4">
            {teams.map((team, index) => (
              <Reveal key={team} className="flex min-h-28 flex-col justify-between border-b border-r border-black/16 p-5 sm:min-h-32">
                <span className="text-[9px] font-bold tabular-nums tracking-[0.18em] text-black/34">{String(index + 1).padStart(2, "0")}</span>
                <span className="text-lg font-black tracking-[-0.035em]">{team}</span>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
      <section className="border-b border-black/10 py-20 sm:py-28">
        <div className="mx-auto grid max-w-[1440px] gap-12 px-5 sm:px-8 lg:grid-cols-12 lg:px-12">
          <Reveal className="lg:col-span-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-[#319b9a]">How ideas were evaluated</p>
            <h2 className="mt-4 text-4xl font-semibold leading-[0.96] tracking-[-0.055em] sm:text-6xl">The pitch was only part of the score.</h2>
            <p className="mt-6 max-w-md text-sm leading-6 text-black/56">The documented judging framework put the largest share of the score on sustainability and community impact.</p>
          </Reveal>
          <Reveal className="lg:col-span-6 lg:col-start-7">
            <div className="border-t border-black/18">
              {criteria.map(([label, score]) => (
                <div key={label} className="grid grid-cols-[1fr_auto] items-end gap-5 border-b border-black/14 py-5">
                  <p className="text-sm font-semibold tracking-[-0.02em] sm:text-base">{label}</p>
                  <p className="text-4xl font-black tabular-nums tracking-[-0.06em] text-[#6558c9] sm:text-5xl">{score}</p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-right text-[9px] font-bold uppercase tracking-[0.2em] text-black/34">100 points total</p>
          </Reveal>
        </div>
      </section>

      <section className="relative isolate overflow-hidden bg-[#101114] px-5 py-24 text-white sm:px-8 sm:py-32 lg:px-12 lg:py-40">
        <div aria-hidden="true" className="absolute -bottom-64 -left-40 h-[34rem] w-[34rem] rounded-full bg-[#6558c9]/55" />
        <div aria-hidden="true" className="absolute -bottom-56 -left-24 h-[28rem] w-[28rem] rounded-full border-2 border-[#c9c1f2]/45" />
        <div className="relative mx-auto max-w-[1440px]">
          <Reveal>
            <p className="text-[10px] font-bold uppercase tracking-[0.32em] text-[#8ce0d8]">Spot it. Solve it. Sustain it.</p>
            <h2 className="mt-7 max-w-6xl text-[clamp(3.6rem,10vw,10rem)] font-black leading-[0.78] tracking-[-0.08em]">
              SEE THE<br />CHALLENGE.<br /><span className="text-[#8ce0d8]">SHAPE THE</span><br /><span className="text-[#9a86ed]">CHANGE.</span>
            </h2>
          </Reveal>          <Reveal className="mt-12 flex flex-wrap items-center gap-4 border-t border-white/16 pt-7">
            <Link to="/events" className="inline-flex min-h-11 items-center gap-2 border border-white/30 px-5 py-3 text-[10px] font-bold uppercase tracking-[0.18em] transition hover:border-[#8ce0d8] hover:text-[#8ce0d8]">
              Explore more events <ArrowUpRight className="h-4 w-4" />
            </Link>
            <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/38">IEEE Sahrdaya · 20 August 2026</span>
          </Reveal>
        </div>
      </section>

      <Footer />
    </main>
  );
}
