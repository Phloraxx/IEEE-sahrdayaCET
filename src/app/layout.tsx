import type { Metadata, Viewport } from "next";
import { Press_Start_2P, Inter } from "next/font/google";
import "./globals.css";

const pressStart2P = Press_Start_2P({ 
  weight: "400",
  subsets: ["latin"],
  variable: "--font-pixel",
  display: "swap",
});

const inter = Inter({ 
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const BASE_URL = "https://ieeesahrdaya.com";

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: {
    default: "IEEE Sahrdaya Student Branch",
    template: "%s | IEEE Sahrdaya",
  },
  description:
    "Official IEEE Sahrdaya Student Branch — technical events, workshops, societies & execom directory. Sahrdaya College of Engineering, Thrissur, Kerala.",
  keywords: [
    "IEEE Sahrdaya",
    "IEEE student branch Kerala",
    "Sahrdaya College IEEE",
    "IEEE Kerala Section",
    "technical events Thrissur",
    "engineering workshops Kerala",
    "IEEE student events",
    "Sahrdaya College of Engineering",
  ],
  authors: [{ name: "IEEE Sahrdaya Student Branch", url: BASE_URL }],
  creator: "IEEE Sahrdaya Student Branch",
  publisher: "IEEE Sahrdaya Student Branch",
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
  openGraph: {
    type: "website",
    siteName: "IEEE Sahrdaya Student Branch",
    title: "IEEE Sahrdaya Student Branch",
    description:
      "Official website of IEEE Sahrdaya Student Branch — technical events, workshops, societies and execom directory.",
    url: BASE_URL,
    images: [
      {
        url: "/web.png",
        width: 1200,
        height: 630,
        alt: "IEEE Sahrdaya Student Branch",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "IEEE Sahrdaya Student Branch",
    description:
      "Official website of IEEE Sahrdaya Student Branch — technical events, workshops, societies and execom directory.",
    images: ["/web.png"],
  },
  alternates: {
    canonical: BASE_URL,
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48" },
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
    other: [{ rel: "manifest", url: "/site.webmanifest" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#00629B",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
