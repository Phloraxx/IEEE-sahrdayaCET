import { ArrowDown, ArrowUpRight } from "lucide-react";
import { Link } from "react-router";
import { APP_URL } from "@/lib/constants";
import { FLAGSHIPS, FLAGSHIP_TIMELINE } from "@/lib/flagships";
import { FlagshipLayout, flagshipLabelClass, flagshipLinkClass } from "@/components/flagships/FlagshipLayout";

const description = "Explore the IEEE Sahrdaya flagship timeline: Altair, Altair 2.0, TechX Infinia and Infinia 2.0. Each edition has its own story.";
export const meta = () => [
  { title: "Flagship Events | IEEE Sahrdaya" },
  { name: "description", content: description },
  { property: "og:title", content: "Flagship Events | IEEE Sahrdaya" },
  { property: "og:description", content: description },
  { property: "og:url", content: `${APP_URL}/flagships` },
  { property: "og:image", content: `${APP_URL}${FLAGSHIPS[0]?.cover.src || "/web.png"}` },
  { name: "twitter:card", content: "summary_large_image" },
];

export default function FlagshipsPage() {
  return (
    <FlagshipLayout path="/flagships">
      <header className="border-b border-slate-300 pb-7 sm:pb-10">
        <div className="flex flex-wrap justify-between gap-3">
          <p className="font-pixel text-[9px] leading-loose text-ieee-blue">IEEE SAHRDAYA / FLAGSHIP EVENTS</p>
          <p className={flagshipLabelClass}>Latest to earliest / 2025—2022</p>
        </div>
        <h1 className="mt-7 text-[clamp(2.7rem,7.8vw,6.8rem)] font-black leading-[0.98] tracking-[-0.065em]">
          Big ideas.<br /><span className="text-ieee-blue">Shared stories.</span>
        </h1>
        <div className="mt-7 grid gap-6 md:grid-cols-2 md:items-end lg:gap-16">
          <p className="max-w-lg text-base leading-relaxed text-slate-600">Two flagship programmes. Every edition, its own chapter. Start with the latest, then step back through the people, experiments and conversations that shaped Infinia and Altair.</p>
          <nav aria-label="Timeline years" className="grid grid-cols-4 items-center gap-x-4 gap-y-1 md:flex md:flex-wrap md:justify-end md:gap-x-5">
            <span className={`col-span-4 ${flagshipLabelClass}`}>Jump to</span>
            {FLAGSHIP_TIMELINE.map(({ edition }) => <a key={edition.year} href={`#year-${edition.year}`} className={flagshipLinkClass}>{edition.year}<ArrowDown className="h-3 w-3" aria-hidden="true" /></a>)}
          </nav>
        </div>
      </header>
      <section aria-label="Flagship edition timeline">
        <ol>
          {FLAGSHIP_TIMELINE.map(({ flagship, edition, href }, index) => (
            <li key={href} className="border-b border-slate-300">
              <article id={`year-${edition.year}`} aria-labelledby={`title-${edition.year}`} className="scroll-mt-28 grid gap-5 py-8 sm:py-12 md:grid-cols-[140px_1fr] md:gap-10 lg:grid-cols-[180px_1fr]">
                <div className="flex items-center justify-between gap-4 md:block">
                  <p className="text-5xl font-light leading-none tracking-[-0.06em] text-ieee-blue sm:text-6xl">{edition.year}</p>
                  <p className={`md:mt-4 ${flagshipLabelClass}`}>{index === 0 ? "Latest edition" : "From the archive"}</p>
                </div>
                <div className="relative min-w-0 border-l border-slate-300 pl-5 sm:pl-8">
                  <span aria-hidden="true" className="absolute -left-[5px] top-2 h-[9px] w-[9px] rounded-full bg-ieee-blue" />
                  <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr] lg:gap-10">
                    <div className="min-w-0">
                      <p className={flagshipLabelClass}>{flagship.name} / {edition.recordType === "programme" ? "Programme archive" : "Event story"}</p>
                      <h2 id={`title-${edition.year}`} className="mt-3 text-3xl font-black leading-[1.05] tracking-[-0.05em] sm:text-5xl">
                        <Link to={href} className="inline-flex min-h-11 items-center gap-3 hover:text-ieee-blue">{edition.title}<ArrowUpRight className="h-5 w-5 shrink-0 sm:h-7 sm:w-7" aria-hidden="true" /></Link>
                      </h2>
                      <p className="mt-3 text-sm font-medium text-slate-600">{edition.date}</p>
                      <p className="mt-5 max-w-xl text-sm leading-7 text-slate-600 sm:text-base">{edition.summary}</p>
                      <Link to={href} className={`mt-5 ${flagshipLinkClass}`}>Explore {edition.title}<ArrowUpRight className="h-4 w-4" aria-hidden="true" /></Link>
                    </div>
                    {edition.image ? (
                      <figure className="self-start">
                        <Link to={href} aria-label={`View ${edition.title}’s story`} className="group block overflow-hidden">
                          <img src={edition.image.src} alt={edition.image.alt} width={edition.image.width} height={edition.image.height} loading={index === 0 ? "eager" : "lazy"} fetchPriority={index === 0 ? "high" : undefined} className="h-auto w-full transition-transform duration-500 group-hover:scale-[1.025] motion-reduce:transition-none motion-reduce:transform-none" />
                        </Link>
                        <figcaption className="mt-3 text-xs leading-relaxed text-slate-500">{edition.image.caption}</figcaption>
                      </figure>
                    ) : (
                      <div className="self-start border-y border-slate-300 py-5">
                        <p className={flagshipLabelClass}>Inside this edition</p>
                        <ul className="mt-3 divide-y divide-slate-200">
                          {edition.tracks.slice(0, 4).map(track => <li key={track} className="py-2 text-sm text-slate-700">{track}</li>)}
                        </ul>
                        <p className="mt-4 text-xs leading-relaxed text-slate-500">{edition.recordType === "programme" ? "From the published Altair 2.0 brochure." : "Workshops, a hackathon, expos and outreach."}</p>
                      </div>
                    )}
                  </div>
                </div>
              </article>
            </li>
          ))}
        </ol>
      </section>
      <section aria-labelledby="programmes-heading" className="mt-12 sm:mt-16">
        <p className={flagshipLabelClass}>Behind the editions</p>
        <h2 id="programmes-heading" className="mt-3 text-3xl font-bold tracking-tight">Two identities. A shared spirit.</h2>
        <div className="mt-7 grid gap-7 sm:grid-cols-2 sm:gap-12">
          {FLAGSHIPS.map(flagship => (
            <article key={flagship.slug} className="border-t border-slate-300 pt-5">
              <h3 className="text-2xl font-bold tracking-tight">{flagship.name}</h3>
              <p className="mt-2 text-ieee-blue">{flagship.tagline}</p>
              <p className="mt-3 max-w-lg text-sm leading-7 text-slate-600">{flagship.introduction}</p>
              <Link to={`/flagships/${flagship.slug}`} className={`mt-3 ${flagshipLinkClass}`}>Discover {flagship.name}<ArrowUpRight className="h-4 w-4" aria-hidden="true" /></Link>
            </article>
          ))}
        </div>
      </section>
    </FlagshipLayout>
  );
}
