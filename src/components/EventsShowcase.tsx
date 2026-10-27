import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { Image as ImageIcon } from 'lucide-react';
import { Link } from 'react-router';
// Deliberately curated archive; never replace with arbitrary event posters.
const eventImages = [
 '/Events/503658167_18144990655399954_4943514208253057479_n.webp?v=1',
 '/Events/504467036_18054402566594069_4106059723662040073_n.jpg?v=1',
 '/Events/506004997_18132492568425776_600388619468309088_n.webp?v=1',
 '/Events/522111348_18147650755399954_534418411965373382_n.webp?v=1',
 '/Events/525582074_18148493980399954_1932903707501849959_n.webp?v=1',
 '/Events/525622064_18148959217399954_6494357511617440071_n.webp?v=1',
 '/Events/542326117_17847004371557574_12824648908429865_n.jpg?v=1',
];
const formats = ['CONFERENCES', 'LECTURES', 'WORKSHOPS', 'HACKATHONS', 'SEMINARS', 'WEBINARS', 'TECH TALKS', 'BOOTCAMPS'];
function useMarquee(paused: boolean, speed: number, reduceMotion: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const offsetRef = useRef(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (paused) {
      if (reduceMotion) { offsetRef.current = 0; element.style.transform = ''; }
      return;
    }
    let frame = 0, last = 0, visible = false;
    const tick = (time: number) => {
      const width = (element.scrollWidth + (Number.parseFloat(getComputedStyle(element).columnGap) || 0)) / 3;
      if (width) { offsetRef.current = (offsetRef.current + Math.min(time - last, 50) * speed / 1000) % width; element.style.transform = `translate3d(${-offsetRef.current}px,0,0)`; }
      last = time; frame = requestAnimationFrame(tick);
    };
    const sync = () => {
      cancelAnimationFrame(frame);
      if (visible && !document.hidden) { last = performance.now(); frame = requestAnimationFrame(tick); }
    };
    const observer = new IntersectionObserver(([entry]) => { visible = Boolean(entry?.isIntersecting); sync(); });
    observer.observe(element);
    document.addEventListener('visibilitychange', sync);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); document.removeEventListener('visibilitychange', sync); };
  }, [paused, speed, reduceMotion]);
  return ref;
}
function ArchiveImage({ src, index, duplicate }: { src: string; index: number; duplicate: boolean }) {
  const [failed, setFailed] = useState(false);
  return (
    <div aria-hidden={duplicate || undefined} className="relative h-[360px] w-[260px] shrink-0 overflow-hidden rounded-2xl bg-gray-100 shadow-lg">
      {failed ? <div className="grid h-full place-content-center gap-3 text-center text-sm text-gray-500"><ImageIcon className="mx-auto h-6 w-6" aria-hidden="true" /><span>Archive photo unavailable</span></div> : <img src={src} alt={duplicate ? '' : `Selected IEEE Sahrdaya event moment ${index + 1}`} loading="lazy" onError={() => setFailed(true)} className="h-full w-full object-cover" />}
    </div>
  );
}
export function EventsShowcase() {
  const reduceMotion = Boolean(useReducedMotion());
  const [paused, setPaused] = useState(false);
  const stopped = reduceMotion || paused;
  const imagesRef = useMarquee(stopped, 33, reduceMotion);
  const textRef = useMarquee(stopped, 54, reduceMotion);
  const copies = stopped ? [0] : [0, 1, 2];
  return (
    <section
      aria-label="Past events gallery"
      className="relative overflow-hidden bg-white py-16 md:py-24"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPaused(false);
      }}
      onTouchStart={() => setPaused(true)}
    >
      {/* Restored June gallery: a bright canvas, tilted image rail and oversized type. */}
      <div className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-b from-transparent via-transparent to-white/90" />
      <div
        tabIndex={0}
        aria-label="Selected past event photographs"
        className={`relative z-0 -rotate-3 scale-110 mb-12 md:mb-16 focus-visible:outline-2 focus-visible:outline-ieee-blue ${stopped ? 'overflow-x-auto pb-3' : 'overflow-hidden'}`}
      >
        <div ref={imagesRef} data-testid="curated-event-strip" className="flex w-max gap-4">
          {copies.flatMap(copy => eventImages.map((src, index) => (
            <ArchiveImage key={`${copy}-${src}`} src={src} index={index} duplicate={copy > 0} />
          )))}
        </div>
      </div>
      <div className="relative z-20 mb-12 flex items-center justify-center md:mb-16">
        <Link
          to="/events"
          className="inline-flex min-h-11 items-center rounded-lg bg-ieee-blue px-10 py-3 text-sm font-bold uppercase tracking-wider text-white shadow-lg transition-colors hover:bg-ieee-light-blue"
        >
          Explore Events
        </Link>
      </div>
      <div className={`relative z-20 ${stopped ? 'overflow-x-auto' : 'overflow-hidden'}`}>
        <div ref={textRef} data-testid="curated-format-marquee" className="flex w-max items-center whitespace-nowrap">
          {copies.flatMap(copy => formats.map(text => (
            <span key={`${copy}-${text}`} aria-hidden={copy > 0 || undefined} className="flex shrink-0 items-center">
              <span className="text-5xl font-black uppercase italic tracking-tight text-black md:text-7xl lg:text-8xl">{text}</span>
              <span aria-hidden="true" className="mx-6 text-4xl font-bold text-ieee-light-blue md:mx-8 md:text-6xl lg:text-7xl">•</span>
            </span>
          )))}
        </div>
      </div>
    </section>
  );
}
