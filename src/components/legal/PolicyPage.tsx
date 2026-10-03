import { ArrowLeft, ChevronDown } from "lucide-react";
import { Link } from "react-router";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { CanonicalLink } from "@/components/CanonicalLink";

export type PolicySection = {
  heading?: string;
  paragraphs?: string[];
  items?: string[];
};

export function PolicyPage({
  title,
  path,
  intro,
  sections,
}: {
  title: string;
  path: string;
  intro?: string[];
  sections: PolicySection[];
}) {
  const contents = sections.flatMap((section, index) => section.heading
    ? [{ heading: section.heading, id: `policy-section-${index + 1}` }]
    : []);
  const contentsLinks = contents.map(({ heading, id }) => (
    <li key={id}>
      <a href={`#${id}`} className="flex min-h-11 items-center rounded-lg px-3 py-2 text-sm leading-5 text-gray-700 transition-colors hover:bg-gray-100 hover:text-ieee-blue">
        {heading}
      </a>
    </li>
  ));
  return (
    <>
      <CanonicalLink path={path} />
      <div className="min-h-screen bg-white text-gray-900">
        <Navbar />
        <main className="mx-auto w-full max-w-6xl px-4 pb-20 pt-14 sm:px-6 sm:pt-20 md:pt-32 lg:px-8">
          <Link
            to="/"
            className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-gray-500 transition-colors hover:text-ieee-blue"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to IEEE Sahrdaya
          </Link>

          <header className="mt-8 border-b border-gray-200 pb-8">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.24em] text-ieee-blue">
              IEEE Sahrdaya Student Branch
            </p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-gray-950 sm:text-5xl">
              {title}
            </h1>
          </header>

          <div className={`mt-8 grid items-start gap-8 ${contents.length > 1 ? "lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-12" : ""}`}>
            {contents.length > 1 && (
              <aside className="lg:sticky lg:top-28">
                <details className="group rounded-xl border border-gray-200 bg-gray-50 lg:hidden">
                  <summary className="flex min-h-12 cursor-pointer items-center justify-between gap-4 px-4 text-sm font-semibold text-gray-950">
                    On this page <span className="flex items-center gap-2 text-xs font-normal text-gray-600">{contents.length} sections<ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden="true" /></span>
                  </summary>
                  <nav aria-label="Policy contents" className="border-t border-gray-200 p-2"><ul>{contentsLinks}</ul></nav>
                </details>
                <nav aria-label="Policy contents" className="hidden lg:block">
                  <h2 className="mb-3 px-3 text-sm font-semibold text-gray-950">On this page</h2>
                  <ul className="border-l border-gray-200 pl-2">{contentsLinks}</ul>
                </nav>
              </aside>
            )}
            <article className="min-w-0 max-w-[70ch] space-y-10 text-[15px] leading-7 text-gray-700 sm:text-base sm:leading-8">
              {intro?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
              {sections.map((section, index) => (
                <section id={`policy-section-${index + 1}`} tabIndex={-1} key={`${section.heading ?? "section"}-${index}`} className="scroll-mt-28 space-y-4 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-8 focus-visible:outline-ieee-blue">
                  {section.heading && (
                    <h2 className="text-xl font-semibold tracking-tight text-gray-950 sm:text-2xl">
                      {section.heading}
                    </h2>
                  )}
                  {section.paragraphs?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                  {section.items && (
                    <ol className="list-decimal space-y-4 pl-6 marker:font-semibold marker:text-gray-900">
                      {section.items.map((item) => <li key={item} className="pl-2">{item}</li>)}
                    </ol>
                  )}
                </section>
              ))}
            </article>
          </div>
        </main>
        <Footer />
      </div>
    </>
  );
}
