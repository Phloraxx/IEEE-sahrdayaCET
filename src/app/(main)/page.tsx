import type { Metadata } from 'next';
import React from 'react';
import Navbar from '@/components/Navbar';
import { Hero } from '@/components/Hero';
import { GridBackground } from '@/components/GridBackground';
import { TechnicalDetails } from '@/components/TechnicalDetails';
import { FloatingIcons } from '@/components/FloatingIcons';
import { FloatingAction } from '@/components/FloatingAction';
import { WhatsHappening } from '@/components/WhatsHappening';
import { Execom } from '@/components/Execom';
import { EventsShowcase } from '@/components/EventsShowcase';
import Footer from '@/components/Footer';

export const metadata: Metadata = {
  description:
    'Official home of IEEE Sahrdaya Student Branch. Explore technical events, workshops, hackathons and IEEE societies at Sahrdaya College of Engineering, Kerala.',
  openGraph: {
    title: 'IEEE Sahrdaya Student Branch',
    description:
      'Explore technical events, workshops, hackathons and IEEE societies at Sahrdaya College of Engineering, Kerala. Official IEEE Sahrdaya Student Branch.',
    url: 'https://ieeesahrdaya.com',
    images: [
      {
        url: '/web.png',
        width: 1200,
        height: 630,
        alt: 'IEEE Sahrdaya Student Branch',
      },
    ],
  },
  alternates: {
    canonical: 'https://ieeesahrdaya.com',
  },
};

export default function Home() {
  return (
    <div className="relative w-full bg-white text-gray-900 font-sans selection:bg-ieee-blue/20">
      
      {/* Anchor for Home Section at the absolute top of the document flow */}
      <div id="home" className="absolute top-0 left-0 w-full h-1" />

      {/* Fixed "Cover" Layer (Hero + Background) */}
      <div className="fixed inset-0 z-0 h-[100dvh] overflow-hidden">
        {/* Background Elements */}
        <GridBackground />
        <FloatingIcons />
        <TechnicalDetails />

        {/* Hero - Fixed full screen */}
        <Hero />
      </div>
      
      {/* Navbar - Fixed at top */}
      <Navbar />

      {/* Scrolling Content Layer */}
      <div className="relative z-10 mt-[100dvh]">
        <WhatsHappening />
        
        <Execom />
        <EventsShowcase />
        <Footer />
      </div>

      <FloatingAction />
    </div>
  );
}
