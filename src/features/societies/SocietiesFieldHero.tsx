import { useEffect, useRef, useState } from "react";
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "framer-motion";

interface SocietiesFieldHeroProps {
  communityCount: number;
}

const MARK_PATHS = {
  a: "M114.012 167.446L155.459 126L161.115 131.657L119.669 173.103L114.012 167.446Z",
  b: "M119.985 161.51L161.504 203.029L155.519 209.014L114 167.495L119.985 161.51Z",
  c: "M149.551 202.992L191 161.544L196.973 167.517L155.525 208.965L149.551 202.992Z",
  d: "M148.534 184.015L164.308 168.241L171.317 175.25L155.542 191.024L148.534 184.015Z",
  e: "M131.547 167.041L141.043 157.545L155.012 171.514L145.516 181.01L131.547 167.041Z",
  f: "M148.534 184.007L154.518 178.022L151.505 175.009L145.521 180.993L148.534 184.007Z",
  g: "M164.006 134.528L196.992 167.514L189.03 175.476L156.044 142.49L164.006 134.528Z",
  h: "M148.536 141.016L167.055 159.536L158.054 168.538L139.534 150.018L148.536 141.016Z",
  i: "M166.895 159.387L176.993 169.485L170.993 175.486L160.895 165.387L166.895 159.387Z",
};

function FullMark({ className = "" }: { className?: string }) {
  return (
    <g className={className}>
      {Object.values(MARK_PATHS).map((d, index) => <path key={index} d={d} />)}
    </g>
  );
}

export function SocietiesFieldHero({ communityCount }: SocietiesFieldHeroProps) {
  const reduceMotion = useReducedMotion();
  const fieldRef = useRef<HTMLDivElement>(null);
  const idleRef = useRef<number | null>(null);
  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  const springX = useSpring(pointerX, { stiffness: 115, damping: 22, mass: 0.55 });
  const springY = useSpring(pointerY, { stiffness: 115, damping: 22, mass: 0.55 });
  const [coords, setCoords] = useState({ x: 500, y: 500 });

  const outerX = useTransform(springX, [-1, 1], [-4.8, 4.8]);
  const outerY = useTransform(springY, [-1, 1], [-3.4, 3.4]);
  const counterX = useTransform(springX, [-1, 1], [3.4, -3.4]);
  const counterY = useTransform(springY, [-1, 1], [2.4, -2.4]);
  const innerX = useTransform(springX, [-1, 1], [-2.3, 2.3]);
  const innerY = useTransform(springY, [-1, 1], [2.1, -2.1]);
  const accentX = useTransform(springX, [-1, 1], [1.5, -1.5]);
  const accentY = useTransform(springY, [-1, 1], [-1.5, 1.5]);

  useEffect(() => () => {
    if (idleRef.current) window.clearTimeout(idleRef.current);
  }, []);

  const settle = () => {
    if (reduceMotion) return;
    pointerX.set(0);
    pointerY.set(0);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (reduceMotion || event.pointerType === "touch") return;
    const rect = fieldRef.current?.getBoundingClientRect();
    if (!rect) return;
    const nx = Math.max(-1, Math.min(1, ((event.clientX - rect.left) / rect.width) * 2 - 1));
    const ny = Math.max(-1, Math.min(1, ((event.clientY - rect.top) / rect.height) * 2 - 1));
    pointerX.set(nx);
    pointerY.set(ny);
    setCoords({ x: Math.round((nx + 1) * 500), y: Math.round((ny + 1) * 500) });
    if (idleRef.current) window.clearTimeout(idleRef.current);
    idleRef.current = window.setTimeout(settle, 900);
  };

  return (
    <section className="relative" aria-labelledby="societies-field-title">
      <h1 id="societies-field-title" className="sr-only">IEEE Sahrdaya Societies</h1>

      <div className="lg:hidden" data-testid="society-field-mobile">
        <div className="border-y border-slate-200 py-5 font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-400">
          <div className="flex items-center justify-between gap-4">
            <span>IEEE Sahrdaya / Societies</span>
            <span>Field / {String(communityCount).padStart(3, "0")}</span>
          </div>
        </div>
        <div className="relative mt-6 aspect-square overflow-hidden border border-slate-200 bg-[#fbfbf8]">
          <div aria-hidden="true" className="absolute inset-0 opacity-80" style={{ backgroundImage: "linear-gradient(rgba(15,23,42,.045) 1px, transparent 1px),linear-gradient(90deg,rgba(15,23,42,.045) 1px,transparent 1px)", backgroundSize: "34px 34px" }} />
          <svg viewBox="108 120 96 96" className="absolute left-1/2 top-1/2 h-[64%] w-[64%] -translate-x-1/2 -translate-y-1/2" aria-hidden="true">
            <g fill="#00629B" opacity="0.12"><FullMark /></g>
            <g fill="#020617"><FullMark /></g>
          </svg>
          <span className="absolute left-4 top-4 font-mono text-[8px] font-semibold uppercase tracking-[0.18em] text-ieee-blue">IEEE / SB</span>
          <span className="absolute bottom-4 right-4 font-mono text-[8px] font-semibold uppercase tracking-[0.18em] text-slate-400">Thrissur · KL</span>
        </div>
        <div className="flex items-end justify-between gap-6 border-b border-slate-200 py-5">
          <p className="font-mono text-[9px] font-semibold uppercase leading-5 tracking-[0.16em] text-slate-500">{communityCount} communities<br />One student branch</p>
          <a href="#society-directory" className="font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-950">Explore ↓</a>
        </div>
      </div>

      <div className="hidden lg:block">
        <div className="relative overflow-hidden bg-[#050914] px-6 py-7 xl:px-8 xl:py-8">
          <div aria-hidden="true" className="absolute inset-0 opacity-70" style={{ backgroundImage: "radial-gradient(circle at 50% 48%, rgba(0,98,155,.13), transparent 33%),linear-gradient(115deg,transparent 0 46%,rgba(255,255,255,.025) 46% 46.2%,transparent 46.2% 100%)" }} />

          <div
            ref={fieldRef}
            data-testid="society-field-hero"
            onPointerMove={handlePointerMove}
            onPointerLeave={() => { settle(); setCoords({ x: 500, y: 500 }); }}
            className="relative min-h-[650px] overflow-hidden rounded-[10px] bg-[#fbfbf8] shadow-[0_32px_90px_rgba(0,0,0,.32)] xl:min-h-[690px]"
          >
            <div aria-hidden="true" className="absolute inset-0" style={{ backgroundImage: "linear-gradient(rgba(15,23,42,.045) 1px, transparent 1px),linear-gradient(90deg,rgba(15,23,42,.045) 1px,transparent 1px)", backgroundSize: "58px 58px" }} />
            <div aria-hidden="true" className="absolute left-1/2 top-1/2 h-[86%] w-px -translate-x-1/2 -translate-y-1/2 bg-slate-200/65" />
            <div aria-hidden="true" className="absolute left-1/2 top-1/2 h-px w-[88%] -translate-x-1/2 -translate-y-1/2 bg-slate-200/65" />

            <header className="absolute inset-x-0 top-0 z-30 flex h-14 items-center justify-between border-b border-slate-200 px-6 font-mono text-[8px] font-semibold uppercase tracking-[0.19em] text-slate-400 xl:px-7">
              <span>IEEE Sahrdaya / Societies</span>
              <span>Interactive identity field</span>
            </header>

            <div className="pointer-events-none absolute inset-0 z-10">
              <span className="absolute left-[7%] top-[19%] font-mono text-[8px] font-semibold uppercase tracking-[0.22em] text-ieee-blue/70">Build</span>
              <span className="absolute right-[9%] top-[26%] font-mono text-[8px] font-semibold uppercase tracking-[0.22em] text-ieee-blue/65">Research</span>
              <span className="absolute left-[12%] bottom-[22%] font-mono text-[8px] font-semibold uppercase tracking-[0.22em] text-ieee-blue/55">Create</span>
              <span className="absolute right-[13%] bottom-[19%] font-mono text-[8px] font-semibold uppercase tracking-[0.22em] text-ieee-blue/55">Connect</span>
              <span className="absolute right-[28%] top-[17%] font-mono text-[8px] font-semibold uppercase tracking-[0.22em] text-ieee-blue/50">Lead</span>
            </div>

            <div className="absolute inset-x-[10%] bottom-[13%] top-[14%] z-20 flex items-center justify-center">
              <svg viewBox="108 120 96 96" className="h-full w-full max-w-[760px] overflow-visible" role="img" aria-label="Deconstructed IEEE identity mark">
                <g fill="#00629B" opacity="0.14"><FullMark /></g>
                <motion.g fill="#020617" style={{ x: outerX, y: outerY }}>
                  <path d={MARK_PATHS.a} /><path d={MARK_PATHS.c} />
                </motion.g>
                <motion.g fill="#020617" style={{ x: counterX, y: counterY }}>
                  <path d={MARK_PATHS.b} /><path d={MARK_PATHS.g} />
                </motion.g>
                <motion.g fill="#020617" style={{ x: innerX, y: innerY }}>
                  <path d={MARK_PATHS.h} /><path d={MARK_PATHS.i} /><path d={MARK_PATHS.e} />
                </motion.g>
                <motion.g fill="#020617" style={{ x: accentX, y: accentY }}>
                  <path d={MARK_PATHS.d} /><path d={MARK_PATHS.f} />
                </motion.g>
              </svg>
            </div>

            <div className="absolute bottom-6 left-6 z-30 font-mono text-[8px] font-semibold uppercase leading-5 tracking-[0.17em] text-slate-400 xl:left-7">
              <p className="text-slate-900">{String(communityCount).padStart(2, "0")} communities · one student branch</p>
              <p>Thrissur · Kerala · IEEE student branch</p>
            </div>

            <div className="absolute bottom-6 right-6 z-30 flex items-end gap-9 xl:right-7">
              <div data-testid="society-field-coordinates" className="text-right font-mono text-[8px] font-semibold uppercase leading-5 tracking-[0.16em] text-slate-400" aria-live="off">
                <p>X {String(coords.x).padStart(4, "0")}</p>
                <p>Y {String(coords.y).padStart(4, "0")}</p>
                <p className="text-ieee-blue">Field / {String(communityCount).padStart(3, "0")}</p>
              </div>
              <a href="#society-directory" className="group inline-flex items-center gap-3 font-mono text-[8px] font-semibold uppercase tracking-[0.19em] text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ieee-blue focus-visible:ring-offset-4">
                Explore the directory <span className="transition-transform duration-300 group-hover:translate-y-1">↓</span>
              </a>
            </div>

            <div aria-hidden="true" className="absolute left-5 top-20 h-3 w-3 border-l border-t border-ieee-blue/45" />
            <div aria-hidden="true" className="absolute right-5 top-20 h-3 w-3 border-r border-t border-ieee-blue/45" />
            <div aria-hidden="true" className="absolute bottom-5 left-5 h-3 w-3 border-b border-l border-ieee-blue/45" />
            <div aria-hidden="true" className="absolute bottom-5 right-5 h-3 w-3 border-b border-r border-ieee-blue/45" />
          </div>
        </div>
      </div>
    </section>
  );
}
