import { ArrowLeft, Mail, MapPin, Phone } from "lucide-react";
import { Link } from "react-router";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { CanonicalLink } from "@/components/CanonicalLink";
import { APP_URL } from "@/lib/constants";
import { BUSINESS_INFO } from "@/lib/business-info";

const title = "Contact Us";
const path = "/contact";
const description = "Contact IEEE Sahrdaya Student Branch for event registration, payment and website support.";

export const meta = () => [
  { title: `${title} | IEEE Sahrdaya Student Branch` },
  { name: "description", content: description },
  { property: "og:title", content: `${title} | IEEE Sahrdaya Student Branch` },
  { property: "og:description", content: description },
  { property: "og:url", content: `${APP_URL}${path}` },
];

const cards = [
  { label: "Email", value: BUSINESS_INFO.email, href: `mailto:${BUSINESS_INFO.email}`, icon: Mail },
  { label: "Phone", value: `${BUSINESS_INFO.phoneDisplay} · ${BUSINESS_INFO.contactPerson}, ${BUSINESS_INFO.contactRole}`, href: BUSINESS_INFO.phoneHref, icon: Phone },
  { label: "Visit", value: BUSINESS_INFO.address, href: BUSINESS_INFO.mapUrl, icon: MapPin },
];
export default function ContactPage() {
  return (
    <>
      <CanonicalLink path={path} />
      <div className="min-h-screen bg-white text-gray-900">
        <Navbar />
        <main className="mx-auto w-full max-w-5xl px-4 pb-20 pt-32 sm:px-6 lg:px-8">
          <Link to="/" className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-ieee-blue">
            <ArrowLeft className="h-4 w-4" /> Back to IEEE Sahrdaya
          </Link>
          <header className="mt-8 max-w-3xl border-b border-gray-200 pb-8">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.24em] text-ieee-blue">IEEE Sahrdaya Student Branch</p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-gray-950 sm:text-5xl">Contact Us</h1>
            <p className="mt-4 text-base leading-7 text-gray-600">
              For event registration, payment status, refunds, ticket access, certificates or website support, use the official branch contact details below.
            </p>
          </header>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {cards.map(({ label, value, href, icon: Icon }) => (
              <a key={label} href={href} target={label === "Visit" ? "_blank" : undefined} rel={label === "Visit" ? "noopener noreferrer" : undefined} className="group rounded-2xl border border-gray-200 p-5 transition hover:border-ieee-blue/40 hover:shadow-sm">
                <Icon className="h-5 w-5 text-ieee-blue" />
                <p className="mt-5 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500">{label}</p>
                <p className="mt-2 text-sm font-medium leading-6 text-gray-900 group-hover:text-ieee-blue">{value}</p>
              </a>
            ))}
          </div>
          <section className="mt-8 rounded-2xl bg-gray-50 p-6 text-sm leading-7 text-gray-600">
            <h2 className="text-lg font-semibold text-gray-950">When contacting us</h2>
            <p className="mt-2">
              Include the event name and the email or ticket ID used for registration. For payment queries, you may also include the payment reference shown by your bank or payment provider. Never send card PINs, UPI PINs, OTPs or banking passwords.
            </p>
          </section>
        </main>
        <Footer />
      </div>
    </>
  );
}
