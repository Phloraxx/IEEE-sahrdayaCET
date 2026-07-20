"use client";

import { ArrowUpRight, Mail, MapPin, Phone } from "lucide-react";
import { ContextualBlogLinks } from "@/components/blog/ContextualBlogLinks";

const Footer: React.FC = () => {
  const currentYear = new Date().getFullYear();

  return (
    <>
      <ContextualBlogLinks />
      <footer className="relative z-20 bg-gray-950 text-white overflow-hidden">
        <div className="h-px bg-linear-to-r from-transparent via-ieee-blue to-transparent" />
        <div className="container mx-auto px-4">
          <div className="py-16 md:py-20 border-b border-white/10">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-12 md:gap-8">
              <div className="md:col-span-5">
                <h2 className="font-pixel text-3xl md:text-5xl text-white leading-tight tracking-tight">
                  IEEE
                </h2>
                <h3 className="font-pixel text-xl md:text-3xl text-ieee-blue leading-tight tracking-tight mt-1">
                  SAHRDAYA
                </h3>
                <div className="flex gap-3 mt-6 font-mono text-[9px] tracking-[0.3em] text-white/40 uppercase">
                  <span>Innovate</span>
                  <span className="text-ieee-blue">~</span>
                  <span>Connect</span>
                  <span className="text-ieee-blue">~</span>
                  <span>Inspire</span>
                </div>
                <p className="text-sm text-white/50 mt-6 max-w-sm leading-relaxed font-sans">
                  The world&apos;s largest technical professional organization
                  dedicated to advancing technology for the benefit of humanity.
                </p>
              </div>

              <div className="md:col-span-3 md:col-start-7">
                <div className="font-mono text-[10px] tracking-[0.3em] text-white/30 uppercase mb-6">
                  Quick Links
                </div>
                <nav className="flex flex-col space-y-4">
                  {[
                    { label: "IEEE Kerala Section", href: "https://ieeekerala.org/" },
                    { label: "IEEE LINK", href: "https://ieee-link.org/" },
                    {
                      label:
                        "Sahrdaya College of Engineering and Technology (Autonomous)",
                      href: "https://www.sahrdaya.ac.in",
                    },
                    { label: "IEEE Xplore", href: "https://ieeexplore.ieee.org/Xplore/home.jsp" },
                    { label: "IEEE Students", href: "https://students.ieee.org/" },
                    { label: "IEEE Region R10", href: "https://www.ieeer10.org/" },
                  ].map((link) => (
                    <a
                      key={link.label}
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group flex items-center justify-between text-sm text-white/60 hover:text-white transition-colors duration-300"
                    >
                      <span className="font-sans">{link.label}</span>
                      <ArrowUpRight className="w-3 h-3 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300" />
                    </a>
                  ))}
                </nav>
              </div>

              <div className="md:col-span-4 md:col-start-10">
                <div className="font-mono text-[10px] tracking-[0.3em] text-white/30 uppercase mb-6">
                  Contact
                </div>
                <div className="space-y-4">
                  <a
                    href="mailto:ieee@sahrdaya.ac.in"
                    className="flex items-start gap-3 text-sm text-white/60 hover:text-white transition-colors duration-300 group"
                  >
                    <Mail className="w-4 h-4 mt-0.5 text-ieee-blue shrink-0" />
                    <span className="font-sans">ieee@sahrdaya.ac.in</span>
                  </a>
                  <a
                    href="tel:+919746222670"
                    className="flex items-start gap-3 text-sm text-white/60 hover:text-white transition-colors duration-300 group"
                  >
                    <Phone className="w-4 h-4 mt-0.5 text-ieee-blue shrink-0" />
                    <span className="font-sans">+91 97462 22670 - Anil Antony</span>
                  </a>
                  <a
                    href="https://maps.app.goo.gl/zeFMTMfB3fPeBNHq9"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start gap-3 text-sm text-white/60 hover:text-white transition-colors duration-300 group"
                  >
                    <MapPin className="w-4 h-4 mt-0.5 text-ieee-blue shrink-0" />
                    <span className="font-sans leading-relaxed">
                      Sahrdaya College of
                      <br />
                      Engineering &amp; Technology,
                      <br />
                      Kodakara, Thrissur, Kerala
                    </span>
                  </a>
                </div>
              </div>
            </div>
          </div>

          <div className="py-10 border-b border-white/10">
            <div className="flex items-center justify-center gap-8 md:gap-16">
              {[
                {
                  href: "https://ieee-link.org/",
                  src: "/IEEELink_footer.png",
                  alt: "IEEE LINK",
                  width: 314,
                  height: 76,
                  className: "h-14 md:h-16 w-auto object-contain brightness-0 invert",
                },
                {
                  href: "https://www.sahrdaya.ac.in",
                  src: "/sahrdaya_footer.png",
                  alt: "Sahrdaya",
                  width: 1623,
                  height: 531,
                  className: "h-14 md:h-16 w-auto object-contain brightness-0 invert",
                },
                {
                  href: "https://ieeekerala.org",
                  src: "/keralaSection_footer.png",
                  alt: "IEEE Kerala Section",
                  width: 557,
                  height: 135,
                  className: "h-14 md:h-16 w-auto object-contain brightness-100",
                },
              ].map((logo, index) => (
                <div key={logo.href} className="contents">
                  {index > 0 && <div className="w-px h-14 bg-white/50" />}
                  <a
                    href={logo.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="opacity-70 hover:opacity-100 transition-opacity duration-300 inline-flex items-center"
                  >
                    <img
                      loading="lazy"
                      src={logo.src}
                      alt={logo.alt}
                      width={logo.width}
                      height={logo.height}
                      className={logo.className}
                      onError={(e) => {
                        const image = e.target as HTMLImageElement;
                        image.style.display = "none";
                        if (image.parentElement) image.parentElement.textContent = logo.alt;
                      }}
                    />
                  </a>
                </div>
              ))}
            </div>
          </div>

          <div className="py-8 border-b border-white/10">
            <div className="grid grid-cols-3 gap-4">
              {[
                ["1000", "+", "Members"],
                ["22", "+", "Professionals"],
                ["14", "", "Years"],
              ].map(([value, suffix, label], index) => (
                <div
                  key={label}
                  className={`text-center ${index === 1 ? "border-x border-white/10" : ""}`}
                >
                  <div className="font-pixel text-2xl md:text-4xl text-white leading-none">
                    {value}
                    {suffix && <span className="text-ieee-blue">{suffix}</span>}
                  </div>
                  <div className="font-mono text-[9px] tracking-[0.3em] text-white/30 uppercase mt-2">
                    {label}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="py-6 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="font-mono text-[10px] tracking-wider text-white/25">
              &copy; {currentYear} IEEE SAHRDAYA SB &mdash; ALL RIGHTS RESERVED
            </div>
            <div className="flex items-center gap-6">
              {[
                { label: "Instagram", href: "https://instagram.com/ieeesahrdaya" },
                { label: "LinkedIn", href: "https://linkedin.com/company/ieeesahrdaya" },
                { label: "GitHub", href: "https://github.com/IEEE-Sahrdaya" },
              ].map((social) => (
                <a
                  key={social.label}
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-[10px] tracking-[0.2em] text-white/30 uppercase hover:text-ieee-blue transition-colors duration-300"
                >
                  {social.label}
                </a>
              ))}
            </div>
          </div>
        </div>

        <div
          className="absolute bottom-0 left-0 right-0 overflow-hidden pointer-events-none select-none"
          aria-hidden="true"
        >
          <div className="font-pixel text-[8vw] md:text-[6vw] text-white/5 whitespace-nowrap tracking-tighter leading-none translate-y-[30%]">
            IEEE SAHRDAYA &mdash; ADVANCING TECHNOLOGY FOR HUMANITY
          </div>
        </div>
      </footer>
    </>
  );
};

export default Footer;
