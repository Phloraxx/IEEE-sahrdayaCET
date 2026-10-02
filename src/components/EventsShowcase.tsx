import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { ArrowRight, Pause, Play, Image as ImageIcon } from 'lucide-react';
import { Link } from 'react-router';
import { HomeSectionHeading } from '@/components/home/HomeSectionHeading';
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
function useMarquee(paused: boolean, speed: number) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (paused) { element.style.transform = ''; return; }
    let frame = 0, last = 0, offset = 0, visible = false;
    const tick = (time: number) => {
      const width = (element.scrollWidth + (Number.parseFloat(getComputedStyle(element).columnGap) || 0)) / 3;
      if (width) { offset = (offset + Math.min(time - last, 50) * speed / 1000) % width; element.style.transform = `translate3d(${-offset}px,0,0)`; }
      last = time; frame = requestAnimationFrame(tick);
    };
    const sync = () => {
      cancelAnimationFrame(frame);
      if (visible && !document.hidden) { last = performance.now(); frame = requestAnimationFrame(tick); }
    };
    const observer = new IntersectionObserver(([entry]) => { visible = Boolean(entry?.isIntersecting); sync(); });
    observer.observe(element);
    document.addEventListener('visibilitychange', sync);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); document.removeEventListener('visibilitychange', sync); element.style.transform = ''; };
  }, [paused, speed]);
  return ref;
}
function ArchiveImage({ src, index, duplicate }: { src: string; index: number; duplicate: boolean }) {
  const [failed, setFailed] = useState(false);
  return (
    <div aria-hidden={duplicate || undefined} className="relative h-[340px] w-[260px] shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-white/5 sm:h-[370px]">
      {failed ? <div className="grid h-full place-content-center gap-3 text-center text-sm text-white/65"><ImageIcon className="mx-auto h-6 w-6" aria-hidden="true" /><span>Archive photo unavailable</span></div> : <img src={src} alt={duplicate ? '' : `Selected IEEE Sahrdaya event moment ${index + 1}`} loading="lazy" onError={() => setFailed(true)} className="h-full w-full object-cover" />}
      <span aria-hidden="true" className="absolute bottom-3 right-3 rounded-sm bg-black/65 px-2 py-1 font-pixel text-[7px] text-white/80">{String(index + 1).padStart(2, '0')}</span>
    </div>
  );
}
export function EventsShowcase() {
  const reduceMotion = Boolean(useReducedMotion());
  const [paused, setPaused] = useState(false);
  const stopped = reduceMotion || paused;
  const imagesRef = useMarquee(stopped, 33);
  const textRef = useMarquee(stopped, 54);
  const copies = stopped ? [0] : [0, 1, 2];
  return (
    <section className="relative overflow-hidden bg-[#07121f] py-20 text-white sm:py-24 lg:py-28">
      <div className="mx-auto max-w-[1320px] px-5 sm:px-6 lg:px-10">
        <HomeSectionHeading index="03" label="From the branch" inverse title={<>Selected moments,<br /><span className="text-[#58c6ff]">kept in motion.</span></>} description="A handpicked visual archive from workshops, competitions and sessions across IEEE Sahrdaya." action={<Link to="/events" className="inline-flex min-h-11 items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-white/75 hover:text-white">Open programme <ArrowRight className="h-4 w-4" /></Link>} />
        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-y border-white/10 py-3">
          <span className="text-xs text-white/65">07 handpicked moments</span>
          {!reduceMotion && <button type="button" aria-pressed={paused} onClick={() => setPaused(value => !value)} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/25 px-4 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-white">{paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}{paused ? 'Resume archive motion' : 'Pause archive motion'}</button>}
          {reduceMotion && <span className="text-xs text-white/65">Scroll to explore</span>}
        </div>
      </div>
      <div tabIndex={0} aria-label="Selected event photographs" onFocus={() => setPaused(true)} className={`mt-10 ${stopped ? 'overflow-x-auto pb-3' : 'overflow-hidden'} focus-visible:outline-2 focus-visible:outline-white`}>
        <div ref={imagesRef} data-testid="curated-event-strip" className="flex w-max gap-4">
          {copies.flatMap(copy => eventImages.map((src, index) => <ArchiveImage key={`${copy}-${src}`} src={src} index={index} duplicate={copy > 0} />))}
        </div>
      </div>
      <div className={`mt-12 border-y border-white/10 py-5 ${stopped ? 'overflow-x-auto' : 'overflow-hidden'}`}>
        <div ref={textRef} data-testid="curated-format-marquee" className="flex w-max items-center whitespace-nowrap">
          {copies.flatMap(copy => formats.map(text => <span key={`${copy}-${text}`} aria-hidden={copy > 0 || undefined} className="flex shrink-0 items-center"><span className="text-4xl font-black uppercase italic tracking-[-0.045em] text-white sm:text-5xl lg:text-6xl">{text}</span><span aria-hidden="true" className="mx-5 text-3xl text-[#58c6ff]">•</span></span>))}
        </div>
      </div>
    </section>
  );
}
