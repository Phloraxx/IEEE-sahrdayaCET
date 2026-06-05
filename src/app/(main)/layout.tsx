import type { Metadata, Viewport } from "next";
import { Press_Start_2P, Inter, Caveat } from "next/font/google";
import "../globals.css";
import { SessionProvider } from "next-auth/react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import JsonLd from "@/components/JsonLd";
import PageTransitionOverlay from "@/components/PageTransition";
import { auth } from "@/auth";

const pressStart2P = Press_Start_2P({ 
  weight: "400",
  subsets: ["latin"],
  variable: "--font-pixel-loaded",
  display: "swap",
});

const inter = Inter({ 
  subsets: ["latin"],
  variable: "--font-inter-loaded",
  display: "swap",
});

const caveat = Caveat({ 
  subsets: ["latin"],
  variable: "--font-caveat-loaded",
  display: "swap",
});

const BASE_URL = "https://ieeesahrdaya.com";

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

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://res.cloudinary.com" />
        <link rel="preconnect" href="https://lh3.googleusercontent.com" />
      </head>
      <body className={`${pressStart2P.variable} ${inter.variable} ${caveat.variable} font-sans antialiased`}>
        <SessionProvider session={session}>
          <PageTransitionOverlay />
          <JsonLd schema={organizationSchema} />
          <JsonLd schema={websiteSchema} />
          {children}
        </SessionProvider>
      </body>
    </html>
  );
}
