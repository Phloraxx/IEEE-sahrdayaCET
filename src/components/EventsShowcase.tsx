import React from "react";
import { Link } from "@tanstack/react-router";

const eventImages = [
  '/Events/503658167_18144990655399954_4943514208253057479_n.webp',
  '/Events/504467036_18054402566594069_4106059723662040073_n.jpg',
  '/Events/506004997_18132492568425776_600388619468309088_n.webp',
  '/Events/522111348_18147650755399954_534418411965373382_n.webp',
  '/Events/525582074_18148493980399954_1932903707501849959_n.webp',
  '/Events/525622064_18148959217399954_6494357511617440071_n.webp',
  '/Events/542326117_17847004371557574_12824648908429865_n.jpg',
];

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

const IMG_W = 260;
const IMG_GAP = 16;

const ImageStrip = () => {
  const tripled = [...eventImages, ...eventImages, ...eventImages];

  return (
    <div className="overflow-hidden w-full">
      <div
        className="flex gap-4 will-change-transform"
        style={{
          width: `${tripled.length * (IMG_W + IMG_GAP)}px`,
          animation: 'scroll-images 40s linear infinite',
        }}
      >
        {tripled.map((src, i) => (
          <div
            key={`${i}`}
            className="relative shrink-0 w-[260px] h-[360px] rounded-2xl overflow-hidden shadow-lg"
          >
            <img
              src={src}
              alt={`IEEE Event ${(i % eventImages.length) + 1}`}
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
              className="absolute inset-0 w-full h-full object-cover hover:scale-105 transition-transform duration-700"
            />
          </div>
        ))}
      </div>
    </div>
  );
};

const TEXT_W = 350;

const TextMarquee = () => {
  const tripled = [...scrollingText, ...scrollingText, ...scrollingText];

  return (
    <div className="overflow-hidden w-full">
      <div
        className="flex items-center will-change-transform whitespace-nowrap"
        style={{
          width: `${tripled.length * TEXT_W}px`,
          animation: 'scroll-text 40s linear infinite',
        }}
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

const EventsShowcase: React.FC = () => {
  return (
    <section className="relative py-16 md:py-24 overflow-hidden">
      <div className="absolute inset-0 bg-linear-to-b from-transparent via-transparent to-white/90 z-10 pointer-events-none" />
      <div className="relative z-0 -rotate-3 scale-110 mb-12 md:mb-16">
        <ImageStrip />
      </div>
      <div className="relative z-20 flex justify-center mb-12 md:mb-16">
        <Link
          to="/events"
          className="bg-ieee-blue hover:bg-ieee-light-blue text-white text-sm md:text-base font-bold py-3 px-10 rounded-lg shadow-lg hover:shadow-xl transition-all duration-300 uppercase tracking-wider"
        >
          Explore Events
        </Link>
      </div>
      <div className="relative z-20">
        <TextMarquee />
      </div>
    </section>
  );
};

export { EventsShowcase };
