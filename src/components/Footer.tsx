import { ArrowUpRight, Mail, MapPin, Phone } from "lucide-react";
import { Link } from "react-router";
import { BRANCH_SOCIAL_LINKS } from "@/lib/social-links";

const policyLinks = [
  { label: "About Us", href: "/about" },
  { label: "Contact Us", href: "/contact" },
  { label: "Event Pricing", href: "/pricing" },
  { label: "Shipping & Delivery", href: "/shipping-and-delivery-policy" },
  { label: "Terms & Conditions", href: "/terms-and-conditions" },
  { label: "Privacy Policy", href: "/privacy-policy" },
  { label: "Refund & Cancellation", href: "/refund-and-cancellation-policy" },
];

interface FooterProps {
  seamless?: boolean;
}

const Footer: React.FC<FooterProps> = ({ seamless = false }) => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="relative z-20 bg-gray-950 text-white overflow-hidden">
      {/* Top accent line */}
      {!seamless && <div className="h-px bg-linear-to-r from-transparent via-ieee-blue to-transparent" />}

      {/* Main Footer */}
      <div className="container mx-auto px-4">
        {/* Upper Section - Branding + Links + Contact */}
        <div className="py-12 md:py-20 border-b border-white/10">
          <div className="grid grid-cols-1 gap-10 md:grid-cols-12 md:gap-8">
            {/* Branding */}
            <div className="md:col-span-5">
              <h2 className="font-pixel text-3xl md:text-5xl text-white leading-tight tracking-tight">
                IEEE
              </h2>
              <h3 className="font-pixel text-xl md:text-3xl text-ieee-light-blue leading-tight tracking-tight mt-1">
                SAHRDAYA
              </h3>
              <div className="flex gap-3 mt-6 font-mono text-[9px] tracking-[0.3em] text-white/60 uppercase">
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

            {/* Quick Links */}
            <div className="md:col-span-3 md:col-start-7">
              <div className="font-mono text-[10px] tracking-[0.3em] text-white/60 uppercase mb-6">
                Quick Links
              </div>
              <nav className="grid grid-cols-2 gap-x-5 gap-y-1 md:flex md:flex-col md:space-y-4">
                {[
                  {
                    label: "IEEE Kerala Section",
                    href: "https://ieeekerala.org/",
                  },
                  { label: "IEEE LINK", href: "https://ieee-link.org/" },
                  {
                    label:
                      "Sahrdaya College of Engineering and Technology (Autonomous)",
                    href: "https://www.sahrdaya.ac.in",
                  },
                  {
                    label: "IEEE Xplore",
                    href: "https://ieeexplore.ieee.org/Xplore/home.jsp",
                  },
                  {
                    label: "IEEE Students",
                    href: "https://students.ieee.org/",
                  },
                  {
                    label: "IEEE Region R10",
                    href: "https://www.ieeer10.org/",
                  },
                ].map((link) => (
                  <a
                    key={link.label}
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`group flex min-h-8 items-center justify-between py-1 text-sm text-white/60 transition-colors duration-300 hover:text-white ${
                      link.label.startsWith("Sahrdaya") ? "col-span-2 md:col-span-1" : ""
                    }`}
                  >
                    <span className="font-sans">{link.label}</span>
                    <ArrowUpRight className="w-3 h-3 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300" />
                  </a>
                ))}
              </nav>
            </div>

            {/* Contact */}
            <div className="md:col-span-4 md:col-start-10">
              <div className="font-mono text-[10px] tracking-[0.3em] text-white/60 uppercase mb-6">
                Contact
              </div>
              <div className="space-y-2 md:space-y-4">
                <a
                  href="mailto:ieee@sahrdaya.ac.in"
                  className="group flex min-h-8 items-start gap-3 py-1 text-sm text-white/60 transition-colors duration-300 hover:text-white"
                >
                  <Mail className="w-4 h-4 mt-0.5 text-ieee-blue shrink-0" />
                  <span className="font-sans">ieee@sahrdaya.ac.in</span>
                </a>
                <a
                  href="tel:+919746222670"
                  className="group flex min-h-8 items-start gap-3 py-1 text-sm text-white/60 transition-colors duration-300 hover:text-white"
                >
                  <Phone className="w-4 h-4 mt-0.5 text-ieee-blue shrink-0" />
                  <span className="font-sans">
                    +91 97462 22670 - Anil Antony
                  </span>
                </a>
                <a
                  href="https://maps.app.goo.gl/zeFMTMfB3fPeBNHq9"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex min-h-8 items-start gap-3 py-1 text-sm text-white/60 transition-colors duration-300 hover:text-white"
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
        {/* Logos Row */}
        <div className="border-b border-white/10 py-7 md:py-10">
          <div className="flex items-center justify-center gap-4 sm:gap-8 md:gap-16">
            <a
              href="https://ieee-link.org/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center opacity-70 transition-opacity duration-300 hover:opacity-100"
            >
              <img
                loading="lazy"
                src="/IEEELink_footer.png"
                alt="IEEE"
                width={314}
                height={76}
                className="h-9 sm:h-11 md:h-16 w-auto object-contain brightness-0 invert"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).parentElement!.textContent = 'IEEE LINK'; }}
              />
            </a>
            <div className="h-10 w-px bg-white/40 sm:h-12 md:h-14 md:bg-white/50" />
            <a
              href="https://www.sahrdaya.ac.in"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center opacity-70 transition-opacity duration-300 hover:opacity-100"
            >
              <img
                loading="lazy"
                src="/sahrdaya_footer.png"
                alt="Sahrdaya"
                width={1623}
                height={531}
                className="h-9 sm:h-11 md:h-16 w-auto object-contain brightness-0 invert"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).parentElement!.textContent = 'Sahrdaya College'; }}
              />
            </a>
            <div className="h-10 w-px bg-white/40 sm:h-12 md:h-14 md:bg-white/50" />
            <a
              href="https://ieeekerala.org"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center opacity-80 transition-opacity duration-300 hover:opacity-100"
            >
              <img
                loading="lazy"
                src="/keralaSection_footer.png"
                alt="IEEE Kerala Section"
                width={557}
                height={135}
                className="h-9 sm:h-11 md:h-16 w-auto object-contain brightness-100"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).parentElement!.textContent = 'IEEE Kerala Section'; }}
              />
            </a>
          </div>
        </div>

        {/* Stats Strip */}
        <div className="border-b border-white/10 py-6 md:py-8">
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <div className="font-pixel text-2xl md:text-4xl text-white leading-none">
                1000<span className="text-ieee-blue">+</span>
              </div>
              <div className="font-mono text-[9px] tracking-[0.3em] text-white/60 uppercase mt-2">
                Members
              </div>
            </div>
            <div className="text-center border-x border-white/10">
              <div className="font-pixel text-2xl md:text-4xl text-white leading-none">
                22<span className="text-ieee-blue">+</span>
              </div>
              <div className="font-mono text-[9px] tracking-[0.3em] text-white/60 uppercase mt-2">
                Professionals
              </div>
            </div>
            <div className="text-center">
              <div className="font-pixel text-2xl md:text-4xl text-white leading-none">
                14
              </div>
              <div className="font-mono text-[9px] tracking-[0.3em] text-white/60 uppercase mt-2">
                Years
              </div>
            </div>
          </div>
        </div>

        {/* Policy Links */}
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 border-b border-white/10 py-4 md:gap-x-6 md:gap-y-3 md:py-5">
          {policyLinks.map((policy) => (
            <Link
              key={policy.href}
              to={policy.href}
              className="inline-flex min-h-8 items-center px-1 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-white/50 transition-colors hover:text-ieee-light-blue md:text-[9px] md:tracking-[0.16em]"
            >
              {policy.label}
            </Link>
          ))}
        </div>

        {/* Bottom Bar */}
        <div className="flex flex-col items-center justify-between gap-3 py-5 md:flex-row md:gap-4 md:py-6">
          <div className="text-center font-mono text-[10px] tracking-wider text-white/60 md:text-left">
            &copy; {currentYear} IEEE SAHRDAYA SB &mdash; ALL RIGHTS RESERVED
          </div>

          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 md:gap-6">
            {/* Social Links */}
            {[...BRANCH_SOCIAL_LINKS, { label: "GitHub", href: "https://github.com/IEEE-Sahrdaya" }].map((social) => (
              <a
                key={social.label}
                href={social.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-8 items-center px-2 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-white/60 transition-colors duration-300 hover:text-ieee-blue md:tracking-[0.2em]"
              >
                {social.label}
              </a>
            ))}
          </div>
        </div>
      </div>

      {/* Large watermark text */}
      <div
        className="pointer-events-none absolute bottom-0 left-0 right-0 hidden overflow-hidden select-none md:block"
        aria-hidden="true"
      >
        <div className="font-pixel text-[8vw] md:text-[6vw] text-white/35 whitespace-nowrap tracking-tighter leading-none translate-y-[30%]">
          IEEE SAHRDAYA &mdash; ADVANCING TECHNOLOGY FOR HUMANITY
        </div>
      </div>
    </footer>
  );
};

export default Footer;
