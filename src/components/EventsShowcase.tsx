import { useEffect, useRef } from "react";
import { useReducedMotion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router";
import { HomeSectionHeading } from "@/components/home/HomeSectionHeading";

// Deliberately curated visual archive. Keep this handpicked rather than replacing it with the live event feed.
const eventImages = [
  '/Events/503658167_18144990655399954_4943514208253057479_n.webp?v=1',
  '/Events/504467036_18054402566594069_4106059723662040073_n.jpg?v=1',
  '/Events/506004997_18132492568425776_600388619468309088_n.webp?v=1',
  '/Events/522111348_18147650755399954_534418411965373382_n.webp?v=1',
  '/Events/525582074_18148493980399954_1932903707501849959_n.webp?v=1',
  '/Events/525622064_18148959217399954_6494357511617440071_n.webp?v=1',
  '/Events/542326117_17847004371557574_12824648908429865_n.jpg?v=1',
];

const scrollingText = ["CONFERENCES", "LECTURES", "WORKSHOPS", "HACKATHONS", "SEMINARS", "WEBINARS", "TECH TALKS", "BOOTCAMPS"];
const IMG_W = 260;
const IMG_GAP = 16;

function ImageStrip() {
  const reduceMotion = useReducedMotion();
  const stripRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef(0);
  const setWidth = eventImages.length * (IMG_W + IMG_GAP);

  useEffect(() => {
    if (reduceMotion) return;
    let animId = 0;
    const scroll = () => {
      offsetRef.current -= 0.55;
      if (offsetRef.current <= -setWidth) offsetRef.current = 0;
      if (stripRef.current) stripRef.current.style.transform = `translate3d(${offsetRef.current}px, 0, 0)`;
      animId = requestAnimationFrame(scroll);
    };
    animId = requestAnimationFrame(scroll);
    return () => cancelAnimationFrame(animId);
  }, [reduceMotion, setWidth]);

  const items = reduceMotion ? eventImages : [...eventImages, ...eventImages, ...eventImages];
  return (
    <div className={reduceMotion ? "overflow-x-auto pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" : "overflow-hidden"}>
      <div data-testid="curated-event-strip" ref={stripRef} className="flex gap-4 will-change-transform" style={{ width: `${items.length * (IMG_W + IMG_GAP)}px` }}>
        {items.map((src, index) => (
          <div key={`${src}-${index}`} className="group relative h-[340px] w-[260px] shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-white/5 shadow-2xl sm:h-[370px]">
            <img src={src} alt={`Selected IEEE Sahrdaya event moment ${(index % eventImages.length) + 1}`} loading="lazy" onError={(event) => { (event.currentTarget as HTMLImageElement).style.display = 'none'; }} className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-[1.035]" />
            <span className="absolute bottom-3 right-3 rounded-sm bg-black/65 px-2 py-1 font-pixel text-[7px] text-white/80 backdrop-blur-sm">{String((index % eventImages.length) + 1).padStart(2, '0')}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TextMarquee() {
  const reduceMotion = useReducedMotion();
  const stripRef = useRef<HTMLDivElement>(null);
  const setWidth = scrollingText.length * 310;
  const offsetRef = useRef(0);

  useEffect(() => {
    if (reduceMotion) return;
    let animId = 0;
    const scroll = () => {
      offsetRef.current -= 0.9;
      if (offsetRef.current <= -setWidth) offsetRef.current = 0;
      if (stripRef.current) stripRef.current.style.transform = `translate3d(${offsetRef.current}px, 0, 0)`;
      animId = requestAnimationFrame(scroll);
    };
    animId = requestAnimationFrame(scroll);
    return () => cancelAnimationFrame(animId);
  }, [reduceMotion, setWidth]);

  const items = reduceMotion ? scrollingText : [...scrollingText, ...scrollingText, ...scrollingText];
  return (
    <div className={reduceMotion ? "overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" : "overflow-hidden"}>
      <div data-testid="curated-format-marquee" ref={stripRef} className="flex w-max items-center whitespace-nowrap will-change-transform">
        {items.map((text, index) => (
          <span key={`${text}-${index}`} className="flex shrink-0 items-center">
            <span className="text-4xl font-black uppercase italic tracking-[-0.045em] text-white sm:text-5xl lg:text-6xl">{text}</span>
            <span className="mx-5 text-3xl font-bold text-[#58c6ff] sm:mx-7 sm:text-4xl">•</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export const EventsShowcase: React.FC = () => (
  <section className="relative overflow-hidden bg-[#07121f] py-20 text-white sm:py-24 lg:py-28">
    <div className="mx-auto max-w-[1320px] px-5 sm:px-6 lg:px-10">
      <HomeSectionHeading
        index="03"
        label="From the branch"
        inverse
        title={<>Selected moments,<br /><span className="text-[#58c6ff]">kept in motion.</span></>}
        description="A handpicked visual archive from workshops, competitions and sessions across IEEE Sahrdaya. The live programme stays separate."
        action={<Link to="/events" className="group inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-white/75 transition hover:text-white">Open live programme <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" /></Link>}
      />
      <div className="mt-10 flex items-center justify-between border-y border-white/10 py-3 font-mono text-[8px] font-semibold uppercase tracking-[0.17em] text-white/40"><span>Curated selection</span><span>{String(eventImages.length).padStart(2, '0')} frames / handpicked</span></div>
    </div>

    <div className="relative mt-10 -rotate-2 scale-[1.04] sm:mt-12"><ImageStrip /></div>
    <div className="relative mt-14 border-y border-white/10 py-5 sm:mt-16"><TextMarquee /></div>
  </section>
);
