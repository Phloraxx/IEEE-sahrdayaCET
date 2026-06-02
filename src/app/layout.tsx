import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "IEEE Sahrdaya SB",
  description: "IEEE Sahrdaya Student Branch",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
