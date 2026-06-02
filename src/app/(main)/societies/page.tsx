import type { Metadata } from 'next';
import SocietiesClient from './SocietiesClient';

export const metadata: Metadata = {
  title: 'Societies',
  description:
    "Explore IEEE Sahrdaya's technical societies — CS, RAS, PELS, PES, WIE, IAS, SIGHT and more. Each society runs workshops, projects and competitions for engineering students at Sahrdaya College, Kerala.",
  openGraph: {
    title: 'Societies | IEEE Sahrdaya',
    description:
      "Explore IEEE Sahrdaya's technical societies — CS, RAS, PELS, PES, WIE, IAS, SIGHT and more at Sahrdaya College of Engineering & Technology, Kerala.",
    url: 'https://ieeesahrdaya.com/societies',
    images: [
      {
        url: '/web.png',
        width: 1200,
        height: 630,
        alt: 'IEEE Sahrdaya Societies',
      },
    ],
  },
  alternates: {
    canonical: 'https://ieeesahrdaya.com/societies',
  },
};

export default function SocietiesPage() {
  return <SocietiesClient />;
}
