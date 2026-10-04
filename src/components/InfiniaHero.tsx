import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUpRight, Pause, Play } from "lucide-react";
import { Link } from "react-router";
import { type FlagshipImage } from "@/lib/flagships";

type Connection = EventTarget & { saveData?: boolean; effectiveType?: string };

// The film is TechX Infinia 2024. It can introduce the shared hub, never the 2025 leaf.
export function InfiniaHero({ hub, latest, title, date, photo }: {
  hub: boolean; latest: boolean; title: string; date: string; photo: FlagshipImage;
}) {
  const film = hub || !latest;
  const frame = useRef<HTMLElement>(null);
  const videos = useRef<Array<HTMLVideoElement | null>>([]);
  const desiredPlayback = useRef(false);
  const [allowed, setAllowed] = useState(false);
  const [narrow, setNarrow] = useState(true);
  const [entered, setEntered] = useState(false);
  const [inView, setInView] = useState(false);
  const [visible, setVisible] = useState(true);
  const [paused, setPaused] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!film) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const mobile = window.matchMedia("(max-width: 767px)");
    const connection = (navigator as Navigator & { connection?: Connection }).connection;
    const preferences = () => {
      setAllowed(!motion.matches && !connection?.saveData && !["slow-2g", "2g"].includes(connection?.effectiveType ?? ""));
      setNarrow(mobile.matches);
    };
    const visibility = () => setVisible(document.visibilityState === "visible");
    const observer = new IntersectionObserver(([entry]) => {
      const onScreen = !!entry?.isIntersecting;
      setInView(onScreen);
      if (onScreen) setEntered(true);
    }, { threshold: 0.08 });
    if (frame.current) observer.observe(frame.current);
    preferences();
    visibility();
    motion.addEventListener("change", preferences);
    mobile.addEventListener("change", preferences);
    connection?.addEventListener("change", preferences);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      observer.disconnect();
      motion.removeEventListener("change", preferences);
      mobile.removeEventListener("change", preferences);
      connection?.removeEventListener("change", preferences);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [film]);

  useEffect(() => {
    const run = allowed && entered && inView && visible && !paused && !failed;
    desiredPlayback.current = run;
    videos.current.forEach((video, index) => {
      if (!video) return;
      if (run) void video.play().then(() => {
        if (!desiredPlayback.current) video.pause();
        if (index === 1) setPlaying(!video.paused);
      }).catch(() => { if (index === 1) setPlaying(!video.paused); });
      else video.pause();
    });
  }, [allowed, entered, inView, visible, paused, failed, narrow]);

  function toggleFilm() {
    const stop = !paused && !videos.current[1]?.paused;
    desiredPlayback.current = !stop;
    setPaused(stop);
    if (stop) {
      setPlaying(false);
      videos.current.forEach(video => video?.pause());
    } else {
      // Keep manual play in the user gesture for browsers that declined autoplay.
      videos.current.forEach((video, index) => {
        if (video) void video.play().then(() => {
          if (!desiredPlayback.current) video.pause();
          if (index === 1) setPlaying(!video.paused);
        }).catch(() => { if (index === 1) setPlaying(!video.paused); });
      });
    }
  }

  const panels = narrow ? [1] : [0, 1, 2];
  const showFilm = film && allowed && entered && !failed;
  return <header ref={frame} className="infinia-hero" data-film={film} data-ready={ready && !failed}>
    <div className="infinia-hero-backdrop" aria-hidden="true">
      <img className="infinia-hero-still" src={photo.src} alt="" width={photo.width} height={photo.height} fetchPriority="high" />
      {showFilm && <div className="infinia-hero-filmstrip">{panels.map(index => <video
        key={index} ref={node => { videos.current[index] = node; }}
        muted loop playsInline preload="none" tabIndex={-1}
        onLoadedMetadata={event => { event.currentTarget.currentTime = index === 0 ? 14 : index === 2 ? 27 : 0; }}
        onLoadedData={() => { if (index === 1) setReady(true); }}
        onPlaying={event => { if (index === 1) setPlaying(!event.currentTarget.paused); }}
        onPause={() => { if (index === 1) setPlaying(false); }}
        onError={() => { if (index === 1) { setFailed(true); setPlaying(false); } }}
      ><source src="/media/infinia/techx-2024-highlights.webm" type="video/webm" /><source src="/media/infinia/techx-2024-highlights.mp4" type="video/mp4" /></video>)}</div>}
    </div>
    <div className="infinia-hero-meta">
      <Link to="/">IEEE Sahrdaya SB <ArrowUpRight size={15} aria-hidden="true" /></Link>
      <span>Sahrdaya, Kerala / {hub ? "The Infinia experience" : date}</span>
    </div>
    <div className="infinia-hero-story">
      <p className="infinia-eyebrow">{hub ? "Our flagship. Your next perspective." : date}</p>
      <p className="infinia-hero-line">Three days.<br /><span>A world of possibility.</span></p>
      <div className="infinia-hero-actions">
        <a href="#experience" className="infinia-hero-enter">Step inside <ArrowDown size={18} aria-hidden="true" /></a>
        {film && <Link to={hub ? "/infinia/2024#film" : "#film"} className="infinia-hero-watch"><Play size={15} aria-hidden="true" />Watch the 2024 film <ArrowUpRight size={16} aria-hidden="true" /></Link>}
      </div>
    </div>
    <div className="infinia-hero-signature">
      <h1 className={hub ? "infinia-wordmark" : "infinia-edition-wordmark"}>{title}</h1>
      <div className="infinia-hero-caption">
        <p>{film ? "In motion · TechX Infinia, 2024" : "Infinia 2.0 · 26–28 September 2025"}</p>
        {showFilm && <button type="button" onClick={toggleFilm} className="infinia-film-toggle">
          {playing ? <Pause size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}
          {playing ? "Pause background film" : "Play background film"}
        </button>}
        {hub && <a href="#timeline" className="infinia-hero-history">Explore the timeline <ArrowDown size={14} aria-hidden="true" /></a>}
      </div>
    </div>
  </header>;
}
