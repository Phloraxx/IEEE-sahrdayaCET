import type { Metadata } from "next";
import { APP_URL } from "@/lib/constants";

const BASE_URL = APP_URL;

const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "IEEE Sahrdaya Student Branch",
  url: BASE_URL,
  logo: `${BASE_URL}/emblem.png`,
  description:
    "Official IEEE Student Branch at Sahrdaya College of Engineering & Technology, Thrissur, Kerala, India.",
  sameAs: [
    "https://www.ieee.org",
    "https://ieeekerala.org",
    "https://www.instagram.com/ieee_sahrdaya_sb/",
    "https://www.linkedin.com/company/ieee-sahrdaya-sb/",
    "https://www.youtube.com/@ieeesahrdaya",
  ],
  parentOrganization: {
    "@type": "Organization",
    name: "IEEE Kerala Section",
    url: "https://ieeekerala.org",
  },
  address: {
    "@type": "PostalAddress",
    addressLocality: "Thrissur",
    addressRegion: "Kerala",
    addressCountry: "IN",
  },
};

const websiteSchema = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "IEEE Sahrdaya Student Branch",
  url: BASE_URL,
  potentialAction: {
    "@type": "SearchAction",
    target: {
      "@type": "EntryPoint",
      urlTemplate: `${BASE_URL}/events?search={search_term_string}`,
    },
    "query-input": "required name=search_term_string",
  },
};

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(organizationSchema)
            .replace(/</g, '\\u003c')
            .replace(/>/g, '\\u003e')
            .replace(/&/g, '\\u0026'),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(websiteSchema)
            .replace(/</g, '\\u003c')
            .replace(/>/g, '\\u003e')
            .replace(/&/g, '\\u0026'),
        }}
      />
      {children}
    </>
  );
}
