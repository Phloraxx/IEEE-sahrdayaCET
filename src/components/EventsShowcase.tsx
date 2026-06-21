import React from "react";
import { Link } from "@tanstack/react-router";

interface EventsShowcaseProps {
  eventItems: Array<{ id: string; bannerUrl: string; title: string }>;
}

const scrollingText = [
  "CONFERENCES",
  "LECTURES",
  "WORKSHOPS",
  "HACKATHONS",
  "SEMINARS",
  "WEBINARS",
  "TECH TALKS",
  "BOOTCAMPS",
];
const ImageStrip = ({ eventItems }: EventsShowcaseProps) => {
  const images = eventItems.length > 0 ? eventItems : [{ id: 'placeholder', bannerUrl: '/emblem.png', title: 'IEEE Event' }];
  const tripled = [...images, ...images, ...images];
  return (
    <div className="overflow-hidden w-full">
      <div
        className="flex gap-4 will-change-transform animate-marquee-images"
        style={{ width: `${tripled.length * 280}px` }}
      >
        {tripled.map((item, i) => (
          <div
            key={`${item.id}-${i}`}
            className="relative shrink-0 w-[260px] h-[360px] rounded-2xl overflow-hidden shadow-lg"
          >
            <img
              loading="lazy"
              src={item.bannerUrl}
              alt={item.title || `IEEE Event ${(i % images.length) + 1}`}
              className="absolute inset-0 w-full h-full object-cover hover:scale-105 transition-transform duration-700"
            />
          </div>
        ))}
      </div>
    </div>
  );
};

const TextMarquee = () => {
  const tripled = [...scrollingText, ...scrollingText, ...scrollingText];
  return (
    <div className="overflow-hidden w-full">
      <div
        className="flex items-center will-change-transform whitespace-nowrap animate-marquee-text"
        style={{ width: `${tripled.length * 350}px` }}
      >
        {tripled.map((text, i) => (
          <span key={i} className="flex items-center shrink-0">
            <span className="text-5xl md:text-7xl lg:text-8xl font-black text-black tracking-tight italic uppercase">
              {text}
            </span>
            <span className="text-ieee-light-blue text-4xl md:text-6xl lg:text-7xl mx-6 md:mx-8 font-bold">
              •
            </span>
          </span>
        ))}
      </div>
    </div>
  );
};
export const EventsShowcase: React.FC<EventsShowcaseProps> = ({ eventItems }) => {
  return (
    <section className="relative py-16 md:py-24 overflow-hidden">
      <div className="absolute inset-0 bg-linear-to-b from-transparent via-transparent to-white/90 z-10 pointer-events-none" />
      <div className="relative z-0 -rotate-3 scale-110 mb-12 md:mb-16">
        <ImageStrip eventItems={eventItems} />
      </div>
      <div className="relative z-20 flex justify-center mb-12 md:mb-16">
        <Link
          to="/events"
          className="bg-ieee-blue hover:bg-ieee-light-blue text-white text-sm md:text-base font-bold py-3 px-10 rounded-lg shadow-lg hover:shadow-xl transition-all duration-300 uppercase tracking-wider"
        >
          Explore Events
        </Link>
        <TextMarquee />
      </div>
    </section>
  );
};
