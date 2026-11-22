import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { CanonicalLink } from "@/components/CanonicalLink";
import type { FlagshipImage } from "@/lib/flagships";

export const flagshipLinkClass = "inline-flex min-h-11 items-center gap-3 text-sm font-semibold text-ieee-blue hover:underline underline-offset-4";
export const flagshipLabelClass = "font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500";

export function FlagshipPhoto({ photo, priority = false }: { photo: FlagshipImage; priority?: boolean }) {
  return (
    <figure>
      <div className="overflow-hidden bg-slate-100">
        <img src={photo.src} alt={photo.alt} width={photo.width} height={photo.height}
          loading={priority ? "eager" : "lazy"} fetchPriority={priority ? "high" : undefined}
          className={`block h-auto w-full ${photo.height > photo.width ? "max-h-[640px] object-contain" : ""}`} />
      </div>
      <figcaption className="mt-3 text-xs leading-relaxed text-slate-500">{photo.caption}</figcaption>
    </figure>
  );
}

export function FlagshipLayout({ path, children }: { path: string; children: ReactNode }) {
  return (
    <div className="bg-[#F8F9FA] font-sans text-slate-900 selection:bg-ieee-blue/20">
      <CanonicalLink path={path} />
      <Navbar />
      <main data-page-content tabIndex={-1} className="mx-auto max-w-[1320px] px-5 pb-16 pt-10 sm:px-8 md:pt-32 lg:px-12">
        {children}
        <section aria-label="Explore the branch programme" className="mt-16 flex flex-wrap items-center justify-between gap-5 border-t border-slate-200 pt-8 sm:mt-24">
          <div>
            <p className={flagshipLabelClass}>The story continues</p>
            <p className="mt-2 text-lg font-semibold">Find your next campus experience.</p>
          </div>
          <Link to="/events" className={flagshipLinkClass}>Explore all events <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
        </section>
      </main>
      <Footer />
    </div>
  );
}
