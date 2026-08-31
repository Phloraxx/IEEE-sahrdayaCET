import type { ReactNode } from "react";
import { Link } from "react-router";
import { ArrowUpRight } from "lucide-react";

import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

interface PublicCertificateShellProps {
  section: string;
  title: ReactNode;
  description: string;
  children: ReactNode;
}

export function PublicCertificateShell({ section, title, description, children }: PublicCertificateShellProps) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-white font-sans text-gray-950 selection:bg-ieee-blue/20">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[560px] bg-[radial-gradient(circle_at_1px_1px,rgba(15,23,42,0.12)_1px,transparent_0)] [background-size:28px_28px] [mask-image:linear-gradient(to_bottom,black,transparent)]" />
      <Navbar mobileAlign="right" />

      <main className="relative z-10 pt-24 md:pt-32">
        <section className="border-b border-black/10">
          <div className="container mx-auto px-4 pb-10 pt-8 md:pb-14 md:pt-12">
            <div className="flex items-center justify-between gap-4 border-b border-black/10 pb-4">
              <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.28em] text-black/45">
                <span className="mr-3 text-ieee-blue">01</span><span>{section}</span>
              </p>
              <Link to="/" className="group hidden items-center gap-2 font-mono text-[9px] font-semibold uppercase tracking-[0.24em] text-black/45 transition hover:text-black sm:inline-flex">
                IEEE Sahrdaya <ArrowUpRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </Link>
            </div>
            <div className="grid gap-6 pt-8 md:grid-cols-12 md:items-end md:gap-8 md:pt-10">
              <div className="md:col-span-8">
                <h1 className="max-w-4xl text-[clamp(2.8rem,7vw,6.5rem)] font-semibold leading-[0.88] tracking-[-0.065em] text-black">
                  {title}
                </h1>
              </div>
              <div className="md:col-span-4 md:pb-1">
                <p className="max-w-md text-sm leading-6 text-black/55 md:ml-auto">{description}</p>
                <div className="mt-5 flex items-center gap-3 font-mono text-[9px] font-semibold uppercase tracking-[0.22em] text-black/35">
                  <span>Live registry</span><span className="h-px w-7 bg-ieee-blue" /><span>Public record</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {children}
      </main>

      <Footer />
    </div>
  );
}
