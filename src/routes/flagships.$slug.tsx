import { ArrowLeft, ArrowRight } from "lucide-react";
import { Link, redirect, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { EditionContent } from "@/components/flagships/EditionContent";
import { APP_URL } from "@/lib/constants";
import { FLAGSHIPS, getFlagship, type Flagship } from "@/lib/flagships";
import { FlagshipLayout, FlagshipPhoto, flagshipLabelClass, flagshipLinkClass } from "@/components/flagships/FlagshipLayout";

export function loader({ params }: LoaderFunctionArgs): { flagship: Flagship } {
  if (params.slug === "infinia") throw redirect("/infinia", 301);
  const flagship = getFlagship(params.slug);
  if (!flagship) throw new Response("Flagship not found", { status: 404 });
  return { flagship };
}
export const meta = ({ data }: { data?: ReturnType<typeof loader> }) => {
  const flagship = data?.flagship;
  if (!flagship) return [{ title: "Flagship not found | IEEE Sahrdaya" }, { name: "robots", content: "noindex" }];
  return [
    { title: `${flagship.name} | Flagship Events | IEEE Sahrdaya` },
    { name: "description", content: flagship.introduction },
    { property: "og:title", content: `${flagship.name} — ${flagship.tagline}` },
    { property: "og:description", content: flagship.introduction },
    { property: "og:url", content: `${APP_URL}/flagships/${flagship.slug}` },
    { property: "og:image", content: `${APP_URL}${flagship.cover.src}` },
    { name: "twitter:card", content: "summary_large_image" },
  ];
};

export default function FlagshipStoryPage() {
  const { flagship } = useLoaderData<typeof loader>();
  const other = FLAGSHIPS.find(item => item.slug !== flagship.slug)!;
  return (
    <FlagshipLayout path={`/flagships/${flagship.slug}`}>
      <nav aria-label="Breadcrumb" className="text-xs text-slate-500">
        <Link to="/flagships" className="inline-flex min-h-11 items-center gap-2 hover:text-ieee-blue"><ArrowLeft className="h-3 w-3" aria-hidden="true" />Flagship Events</Link>
        <span aria-hidden="true" className="mx-3">/</span><span aria-current="page">{flagship.name}</span>
      </nav>
      <header className="mb-8 mt-5 grid gap-6 lg:grid-cols-[1.15fr_1fr] lg:items-end lg:gap-16">
        <div>
          <p className="font-pixel text-[9px] leading-loose text-ieee-blue">IEEE SAHRDAYA / {flagship.name.toUpperCase()}</p>
          <h1 className="mt-4 text-6xl font-black leading-none tracking-[-0.065em] sm:text-8xl lg:text-9xl">{flagship.name}</h1>
          <p className="mt-4 text-2xl font-semibold tracking-tight text-ieee-blue sm:text-3xl">{flagship.tagline}</p>
        </div>
        <p className="max-w-lg text-base leading-relaxed text-slate-600 sm:text-lg">{flagship.introduction}</p>
      </header>
      <FlagshipPhoto photo={flagship.cover} priority />
      <section aria-labelledby="story-heading" className="grid gap-5 border-b border-slate-200 py-10 sm:py-14 lg:grid-cols-[1fr_2fr] lg:gap-16">
        <h2 id="story-heading" className="text-2xl font-bold tracking-tight">The {flagship.name} story</h2>
        <p className="max-w-3xl text-lg leading-relaxed text-slate-600">{flagship.overview}</p>
      </section>
      <nav aria-label="Edition navigation" className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-slate-200 py-4">
        <span className={flagshipLabelClass}>Explore the editions</span>
        {flagship.editions.map(edition => <a key={edition.year} href={`#edition-${edition.year}`} className={flagshipLinkClass}>{edition.title} · {edition.year}<ArrowRight className="h-3 w-3" aria-hidden="true" /></a>)}
      </nav>
      {flagship.editions.map(edition => (
        <section key={edition.year} id={`edition-${edition.year}`} aria-labelledby={`heading-${edition.year}`} className="scroll-mt-28 border-b border-slate-200 py-10 sm:py-16">
          <div className="grid gap-6 lg:grid-cols-[1fr_2fr] lg:gap-16">
            <div>
              <p className="font-mono text-sm font-semibold text-ieee-blue">{edition.year}</p>
              <h2 id={`heading-${edition.year}`} className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl"><Link to={`/flagships/${flagship.slug}/${edition.year}`} className="inline-flex min-h-11 items-center gap-3 hover:text-ieee-blue">{edition.title}<ArrowRight className="h-5 w-5" aria-hidden="true" /></Link></h2>
              <p className="mt-3 text-sm text-slate-500">{edition.date}</p>
            </div>
            <EditionContent edition={edition} />
          </div>
        </section>
      ))}
      <section aria-labelledby="archive-heading" className="mt-10 sm:mt-16">
        <p className={flagshipLabelClass}>From the archive</p>
        <h2 id="archive-heading" className="mt-3 text-3xl font-bold tracking-tight">Moments across the editions.</h2>
        <div className={`mt-7 grid items-start gap-7 ${flagship.gallery.length > 1 ? "sm:grid-cols-2" : "max-w-3xl"}`}>
          {flagship.gallery.map(photo => <FlagshipPhoto key={photo.src} photo={photo} />)}
        </div>
      </section>
      <aside className="mt-12 border-t border-slate-200 pt-8 sm:mt-16">
        <p className={flagshipLabelClass}>Another flagship story</p>
        <Link to={`/flagships/${other.slug}`} className="mt-3 inline-flex min-h-11 items-center gap-4 text-3xl font-bold tracking-tight hover:text-ieee-blue">{other.name}<ArrowRight className="h-6 w-6" aria-hidden="true" /></Link>
        <p className="mt-2 text-sm text-slate-500">{other.tagline}</p>
      </aside>
    </FlagshipLayout>
  );
}
