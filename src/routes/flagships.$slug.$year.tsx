import { ArrowLeft, ArrowRight } from "lucide-react";
import { Link, redirect, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { APP_URL } from "@/lib/constants";
import { FLAGSHIP_TIMELINE } from "@/lib/flagships";
import { EditionContent } from "@/components/flagships/EditionContent";
import { FlagshipLayout, FlagshipPhoto, flagshipLabelClass, flagshipLinkClass } from "@/components/flagships/FlagshipLayout";

export function loader({ params }: LoaderFunctionArgs) {
  const item = FLAGSHIP_TIMELINE.find(item => item.flagship.slug === params.slug && item.edition.year === params.year);
  if (!item) throw new Response("Edition not found", { status: 404 });
  if (params.slug === "infinia") throw redirect(`/infinia/${item.edition.year}`, 301);
  const siblings = FLAGSHIP_TIMELINE.filter(entry => entry.flagship.slug === params.slug);
  return { ...item, siblings };
}
export const meta = ({ data }: { data?: ReturnType<typeof loader> }) => {
  if (!data) return [{ title: "Edition not found | IEEE Sahrdaya" }, { name: "robots", content: "noindex" }];
  const { edition, href } = data;
  return [
    { title: `${edition.title} (${edition.year}) | IEEE Sahrdaya` },
    { name: "description", content: edition.summary },
    { property: "og:title", content: `${edition.title} · ${edition.year}` },
    { property: "og:description", content: edition.summary },
    { property: "og:url", content: `${APP_URL}${href}` },
    { property: "og:image", content: `${APP_URL}${edition.image?.src || "/web.png"}` },
    { name: "twitter:card", content: "summary_large_image" },
  ];
};

export default function FlagshipEditionPage() {
  const { flagship, edition, href, siblings } = useLoaderData<typeof loader>();
  // Gallery media belongs to a specific edition; never imply that 2022/2025 media depicts another year.
  const gallery = edition.gallery;
  return (
    <FlagshipLayout path={href}>
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-x-3 text-xs text-slate-500">
        <Link to="/infinia" className={flagshipLinkClass}><ArrowLeft className="h-3 w-3" aria-hidden="true" />Infinia showcase</Link>
        <span aria-hidden="true">/</span><Link to={`/flagships/${flagship.slug}`} className={flagshipLinkClass}>{flagship.name}</Link>
        <span aria-hidden="true">/</span><span aria-current="page">{edition.year}</span>
      </nav>
      <header className="mb-8 mt-5 border-b border-slate-300 pb-8 sm:pb-12">
        <p className={flagshipLabelClass}>{edition.year} / {edition.recordType === "programme" ? "Programme archive" : "Event story"}</p>
        <h1 className="mt-5 max-w-5xl text-[clamp(2.7rem,7vw,6rem)] font-black leading-[1.02] tracking-[-0.06em]">{edition.title}</h1>
        <p className="mt-5 text-lg font-medium text-ieee-blue">{edition.date}</p>
        {edition.recordType === "programme" && <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-600">Explore the workshops and sessions announced in the Altair 2.0 brochure.</p>}
      </header>
      {edition.image && <FlagshipPhoto photo={edition.image} priority />}
      <section aria-label="Edition story" className="mt-10 grid gap-6 sm:mt-16 lg:grid-cols-[1fr_2fr] lg:gap-16">
        <div><p className={flagshipLabelClass}>Inside the edition</p><h2 className="mt-3 text-3xl font-bold tracking-tight">{edition.recordType === "programme" ? "Inside the programme." : "Ideas into experience."}</h2></div>
        <EditionContent edition={edition} />
      </section>
      {gallery.length > 0 && <section aria-labelledby="edition-archive-heading" className="mt-12 border-t border-slate-300 pt-8 sm:mt-16">
        <p className={flagshipLabelClass}>From this edition</p>
        <h2 id="edition-archive-heading" className="mt-3 text-3xl font-bold tracking-tight">From the edition archive.</h2>
        <div className={`mt-7 grid items-start gap-7 ${gallery.length > 1 ? "sm:grid-cols-2" : "max-w-3xl"}`}>
          {gallery.map(photo => <FlagshipPhoto key={photo.src} photo={photo} />)}
        </div>
      </section>}
      <nav aria-label="Other editions" className="mt-12 border-t border-slate-300 pt-8 sm:mt-16">
        <p className={flagshipLabelClass}>Continue the {flagship.name} story</p>
        {siblings.filter(item => item.href !== href).map(item => <Link key={item.href} to={item.href} className="mt-3 inline-flex min-h-11 items-center gap-4 text-2xl font-bold tracking-tight hover:text-ieee-blue sm:text-3xl">{item.edition.title} · {item.edition.year}<ArrowRight className="h-5 w-5" aria-hidden="true" /></Link>)}
      </nav>
    </FlagshipLayout>
  );
}
