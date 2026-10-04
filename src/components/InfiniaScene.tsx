import { useEffect, useRef, useState } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { ArrowDown, Pause, Play } from "lucide-react";

type Connection = EventTarget & { saveData?: boolean; effectiveType?: string };

// A scene plays only while its stage contains the viewport centre. Adjacent stages
// cannot both own that point; scroll never seeks the video or intercepts input.
export function useInfiniaScene(enabled = true) {
  const section = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const companions = useRef<Array<HTMLVideoElement | null>>([]);
  const desired = useRef(false);
  const [allowed, setAllowed] = useState(false);
  const [entered, setEntered] = useState(false);
  const [active, setActive] = useState(false);
  const [visible, setVisible] = useState(true);
  const [paused, setPaused] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [canPin, setCanPin] = useState(false);
  const [wide, setWide] = useState(false);
  const { scrollYProgress } = useScroll({ target: section, offset: ["start start", "end end"] });
  const reveal = useTransform(scrollYProgress, [0, 1], ["inset(0% round 0px)", "inset(3% round 16px)"]);

  useEffect(() => {
    if (!enabled) return;
    const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const connection = (navigator as Navigator & { connection?: Connection }).connection;
    let pending = 0;
    const measure = () => {
      pending = 0;
      setCanPin(window.innerWidth > 1000 && window.innerHeight >= 850);
      setWide(window.innerWidth > 767);
      const rect = stage.current?.getBoundingClientRect();
      const centre = window.innerHeight / 2;
      const ownsCentre = !!rect && rect.top <= centre && rect.bottom > centre;
      setActive(ownsCentre);
      if (ownsCentre) setEntered(true);
    };
    const queue = () => { if (!pending) pending = requestAnimationFrame(measure); };
    const preferences = () => setAllowed(!motionPreference.matches && !connection?.saveData && !["slow-2g", "2g"].includes(connection?.effectiveType ?? ""));
    const visibility = () => setVisible(document.visibilityState === "visible");
    preferences(); visibility(); measure();
    window.addEventListener("scroll", queue, { passive: true });
    window.addEventListener("resize", queue);
    motionPreference.addEventListener("change", preferences);
    connection?.addEventListener("change", preferences);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      cancelAnimationFrame(pending);
      window.removeEventListener("scroll", queue);
      window.removeEventListener("resize", queue);
      motionPreference.removeEventListener("change", preferences);
      connection?.removeEventListener("change", preferences);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [enabled]);

  const showVideo = enabled && allowed && entered && !failed;
  useEffect(() => {
    const run = showVideo && active && visible && !paused;
    desired.current = run;
    [video.current, ...companions.current].forEach((node, index) => {
      if (!node) return;
      if (run) void node.play().then(() => {
        if (!desired.current) node.pause();
        if (index === 0) setPlaying(!node.paused);
      }).catch(() => { if (index === 0) setPlaying(false); });
      else node.pause();
    });
  }, [showVideo, active, visible, paused, wide]);

  function toggle() {
    const stop = !video.current?.paused;
    setPaused(stop);
    desired.current = !stop;
    [video.current, ...companions.current].forEach((node, index) => {
      if (!node) return;
      if (stop) { node.pause(); if (index === 0) setPlaying(false); }
      else void node.play().then(() => {
        if (!desired.current) node.pause();
        if (index === 0) setPlaying(!node.paused);
      }).catch(() => { if (index === 0) setPlaying(false); });
    });
  }
  return { section, stage, video, companions, wide, allowed, canReveal: allowed && canPin, paused, playing, ready, active, showVideo, reveal, progress: scrollYProgress, toggle,
    loaded: () => setReady(true), started: () => setPlaying(true), stopped: () => setPlaying(false),
    error: () => { setFailed(true); setReady(false); setPlaying(false); } };
}

export function SceneMedia({ scene, file, landscape = false, priority = false, label, loopEnd, companion }: {
  scene: ReturnType<typeof useInfiniaScene>; file: string; landscape?: boolean; priority?: boolean; label: string; loopEnd?: number; companion?: number;
}) {
  const [companionReady, setCompanionReady] = useState(false);
  const secondary = companion !== undefined;
  const mounted = scene.showVideo && (!secondary || scene.wide);
  return <div className={`infinia-scene-media${landscape ? " infinia-scene-landscape" : ""}`} data-ready={(secondary ? companionReady : scene.ready) && mounted}>
    <img src={`/media/infinia/${file}.webp`} alt={label} width={landscape ? 1920 : 1080} height={landscape ? 1080 : 1920} loading={priority ? "eager" : "lazy"} fetchPriority={priority ? "high" : undefined} />
    {mounted && <video ref={secondary ? node => { scene.companions.current[companion!] = node; } : scene.video} muted loop playsInline preload="none" tabIndex={-1} aria-hidden="true" width={landscape ? 1920 : 1080} height={landscape ? 1080 : 1920} poster={`/media/infinia/${file}.webp`} onLoadedData={secondary ? () => setCompanionReady(true) : scene.loaded} onPlaying={secondary ? undefined : scene.started} onPause={secondary ? undefined : scene.stopped} onError={secondary ? () => setCompanionReady(false) : scene.error} onTimeUpdate={loopEnd ? event => { if (event.currentTarget.currentTime >= loopEnd) event.currentTarget.currentTime = 0; } : undefined}>
      <source src={`/media/infinia/${file}.webm`} type="video/webm" /><source src={`/media/infinia/${file}.mp4`} type="video/mp4" />
    </video>}
  </div>;
}

export function SceneControl({ scene, name }: { scene: ReturnType<typeof useInfiniaScene>; name: string }) {
  return scene.showVideo ? <button type="button" onClick={scene.toggle} className="infinia-film-toggle" aria-label={`${scene.playing ? "Pause" : "Play"} ${name}`}>
    {scene.playing ? <Pause size={15} aria-hidden="true" /> : <Play size={15} aria-hidden="true" />}{scene.playing ? "Pause" : "Play"}
  </button> : null;
}

const CHAPTERS = [
  { id: "expo-floor", file: "techx-2024-robot-football", title: "Robot football.", label: "Robots moving across a miniature football pitch at the 2024 expo", number: "02", tag: "Expo floor", date: "29 September 2024", text: "A miniature pitch, remote-controlled robots and students gathered around the expo table.", next: "flight-demo", nextLabel: "Next: flight demonstration", theme: "blue", landscape: true },
  { id: "flight-demo", file: "techx-2024-film-3", title: "Taking flight.", label: "A yellow model aircraft flying over the campus in 2024", number: "03", tag: "Outside the expo", date: "29 September 2024", text: "The demonstrations moved outdoors, with a model aircraft flying above the campus.", next: "lantern-fest", nextLabel: "Next: Lantern Fest", theme: "sky", landscape: false },
  { id: "lantern-fest", file: "techx-2024-film-1", title: "Lantern Fest.", label: "Students releasing a glowing lantern together at Lantern Fest in 2024", number: "04", tag: "After dark", date: "28 September 2024", text: "After the workshop day, students gathered outside to release lanterns into the night sky.", next: "experience", nextLabel: "Explore the programme", theme: "amber", landscape: false },
];

function VideoChapter({ chapter }: { chapter: typeof CHAPTERS[number] }) {
  const scene = useInfiniaScene();
  return <section ref={scene.section} id={chapter.id} className={`infinia-video-chapter infinia-scene-${chapter.theme}`} data-enhanced={scene.allowed} data-active={scene.active} aria-labelledby={`${chapter.id}-heading`}>
    <div ref={scene.stage} className="infinia-scene-stage">
      <div className="infinia-scene-top"><span>{chapter.number} / 04 — {chapter.tag}</span><span>TechX Infinia · 2024</span></div>
      <motion.div className="infinia-scene-frame" style={scene.canReveal && !scene.paused ? { clipPath: scene.reveal } : undefined}>
        <SceneMedia scene={scene} file={chapter.file} landscape={chapter.landscape} label={chapter.label} loopEnd={chapter.id === "flight-demo" ? 3 : undefined} />
      </motion.div>
      <div className="infinia-scene-layout">
        <div className="infinia-scene-copy"><p className="infinia-eyebrow">{chapter.date}</p><h2 id={`${chapter.id}-heading`}>{chapter.title}</h2><p>{chapter.text}</p><a href={`#${chapter.next}`} className="infinia-link">{chapter.nextLabel}<ArrowDown size={18} aria-hidden="true" /></a></div>
      </div>
      <div className="infinia-scene-caption"><span>{chapter.tag} · TechX Infinia, 2024</span><SceneControl scene={scene} name={`${chapter.tag.toLowerCase()} film`} /></div>
      <div className="infinia-scene-bottom" aria-hidden="true"><span>Scroll to continue</span><div className="infinia-scene-progress"><motion.span style={scene.allowed && !scene.paused ? { scaleX: scene.progress } : { scaleX: 0 }} /></div><span>{chapter.number} / 04</span></div>
    </div>
  </section>;
}

export function InfiniaVideoChapters() {
  return <>{CHAPTERS.map(chapter => <VideoChapter key={chapter.id} chapter={chapter} />)}</>;
}
