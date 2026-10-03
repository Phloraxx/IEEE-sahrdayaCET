import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router";
import { APP_URL } from "@/lib/constants";
import { FLAGSHIPS } from "@/lib/flagships";
import { FlagshipLayout, flagshipLabelClass } from "@/components/flagships/FlagshipLayout";

const description = "Explore Infinia and Altair, IEEE Sahrdaya’s flagship events: their stories, editions, workshops and campus experiences.";
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
      <header className="border-b border-slate-200 pb-8 sm:pb-12">
        <p className="font-pixel text-[9px] leading-loose text-ieee-blue">IEEE SAHRDAYA / FLAGSHIP EVENTS</p>
        <div className="mt-5 grid gap-6 lg:grid-cols-[1.2fr_1fr] lg:items-end lg:gap-16">
          <h1 className="text-4xl font-black leading-[1.05] tracking-[-0.055em] sm:text-6xl lg:text-7xl">Big ideas.<br /><span className="text-ieee-blue">Shared stories.</span></h1>
          <p className="max-w-lg text-base leading-relaxed text-slate-600 sm:text-lg">Infinia and Altair bring our branch together around technology, possibility and people. Explore the programmes, the editions and the moments that give each its identity.</p>
        </div>
      </header>
      <div className="mt-8 divide-y divide-slate-200">
        {FLAGSHIPS.map((flagship, index) => (
          <article key={flagship.slug} className="grid gap-6 py-8 first:pt-0 sm:gap-8 lg:grid-cols-2 lg:gap-14 lg:py-12">
            <Link to={`/flagships/${flagship.slug}`} aria-label={`Explore ${flagship.name}’s story`} className="group block self-start overflow-hidden bg-slate-100">
              <img src={flagship.cover.src} alt={flagship.cover.alt} width={flagship.cover.width} height={flagship.cover.height} loading={index === 0 ? "eager" : "lazy"} fetchPriority={index === 0 ? "high" : undefined} className="aspect-[3/2] w-full object-cover transition-transform duration-500 group-hover:scale-[1.025] motion-reduce:transition-none motion-reduce:transform-none" />
            </Link>
            <div className="flex flex-col justify-center">
              <p className={flagshipLabelClass}>{String(index + 1).padStart(2, "0")} / {flagship.theme}</p>
              <h2 className="mt-4 text-4xl font-black tracking-[-0.05em] sm:text-5xl">{flagship.name}</h2>
              <p className="mt-3 text-xl font-semibold text-ieee-blue">{flagship.tagline}</p>
              <p className="mt-4 max-w-lg leading-relaxed text-slate-600">{flagship.introduction}</p>
              <p className="mt-5 text-xs text-slate-500">Edition archive · {flagship.editions.map(edition => edition.year).reverse().join(" / ")}</p>
              <Link to={`/flagships/${flagship.slug}`} className="mt-5 inline-flex min-h-11 items-center gap-3 self-start border-b border-ieee-blue text-sm font-bold text-ieee-blue hover:text-slate-900">
                Discover {flagship.name} <ArrowUpRight className="h-5 w-5" aria-hidden="true" />
              </Link>
            </div>
          </article>
        ))}
      </div>
    </FlagshipLayout>
  );
}
