import type { Metadata } from 'next';
import ExecomClient from './ExecomClient';

export const metadata: Metadata = {
  title: 'Execom Directory',
  description:
    'Meet the IEEE Sahrdaya Student Branch executive committee — browse all 60+ members across CS, RAS, WIE, PES, IAS and other societies. EXECOM 2026-2027.',
  openGraph: {
    title: 'Execom Directory | IEEE Sahrdaya',
    description:
      'Browse the full IEEE Sahrdaya EXECOM 2026-2027 directory — 60+ student leaders across all technical societies.',
    url: 'https://ieeesahrdaya.com/full-execom',
    images: [
      {
        url: '/web.png',
        width: 1200,
        height: 630,
        alt: 'IEEE Sahrdaya Execom',
      },
    ],
  },
  alternates: {
    canonical: 'https://ieeesahrdaya.com/full-execom',
  },
};

export default function FullExecomPage() {
  return <ExecomClient />;
}
