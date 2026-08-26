import { ArrowLeft } from "lucide-react";
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
  return (
    <>
      <CanonicalLink path={path} />
      <div className="min-h-screen bg-white text-gray-900">
        <Navbar />
        <main className="mx-auto w-full max-w-4xl px-4 pb-20 pt-32 sm:px-6 lg:px-8">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 transition-colors hover:text-ieee-blue"
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

          <article className="mt-10 space-y-10 text-[15px] leading-7 text-gray-700 sm:text-base sm:leading-8">
            {intro?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            {sections.map((section, index) => (
              <section key={`${section.heading ?? "section"}-${index}`} className="space-y-4">
                {section.heading && (
                  <h2 className="text-xl font-semibold tracking-tight text-gray-950 sm:text-2xl">
                    {section.heading}
                  </h2>
                )}
                {section.paragraphs?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                {section.items && (
                  <ol className="space-y-4 pl-6 marker:font-semibold marker:text-gray-900">
                    {section.items.map((item) => <li key={item} className="pl-2">{item}</li>)}
                  </ol>
                )}
              </section>
            ))}
          </article>
        </main>
        <Footer />
      </div>
    </>
  );
}
