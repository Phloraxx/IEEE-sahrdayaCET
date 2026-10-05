import { useId } from "react";
import { ArrowDown, ArrowUpRight } from "lucide-react";
import { motion, useTransform } from "framer-motion";
import { Link } from "react-router";
import { type FlagshipImage } from "@/lib/flagships";
import { SceneControl, SceneMedia, useInfiniaScene } from "@/components/InfiniaScene";

export function InfiniaHero({ hub, latest, title, date, photo }: {
  hub: boolean; latest: boolean; title: string; date: string; photo: FlagshipImage;
}) {
  const film = hub || !latest;
  const scene = useInfiniaScene(film);
  const id = useId().replace(/:/g, "");
  const centreWidth = useTransform(scene.progress, [0, 1], ["34.5%", "100%"]);
  const leftX = useTransform(scene.progress, [0, 1], ["0%", "-90%"]);
  const rightX = useTransform(scene.progress, [0, 1], ["0%", "90%"]);
  const leftRotate = useTransform(scene.progress, [0, 1], [0, -7]);
  const rightRotate = useTransform(scene.progress, [0, 1], [0, 7]);
  const titleY = useTransform(scene.progress, [0, 1], [0, -55]);
  const animate = scene.canReveal && !scene.paused;
  const rainbow = `infinia-ribbon-${id}`;
  return <header ref={scene.section} className="infinia-hero infinia-playful-hero" data-film={film} data-enhanced={scene.allowed} data-paused={scene.paused || (film && !scene.playing)}>
    <link rel="preload" href="/fonts/infinia/bricolage-grotesque-latin-display.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
    <div ref={scene.stage} className="infinia-hero-stage">
      <svg className="infinia-shape-definitions" width="0" height="0" aria-hidden="true"><defs>
        <clipPath id={`infinia-seam-${id}`} clipPathUnits="objectBoundingBox"><path d="M0,0 H.94 C.86,.16 1.05,.32 .95,.5 C.84,.7 1.04,.83 .96,1 H0 Z" /></clipPath>
        <clipPath id={`infinia-seam-right-${id}`} clipPathUnits="objectBoundingBox"><path d="M.04,0 H1 V1 H.04 C-.04,.83 .16,.7 .05,.5 C-.05,.32 .14,.16 .04,0 Z" /></clipPath>
      </defs></svg>
      {film ? <div className="infinia-hero-triptych">
        <motion.div className="infinia-hero-panel infinia-hero-panel-night" style={{ clipPath: `url(#infinia-seam-${id})`, ...(animate ? { x: leftX, rotate: leftRotate } : {}) }}>
          <SceneMedia scene={scene} file="techx-2024-film-1" companion={0} label="Students releasing a glowing lantern at TechX Infinia in 2024" priority />
        </motion.div>
        <motion.div className="infinia-hero-panel infinia-hero-panel-car" style={animate ? { width: centreWidth } : undefined}>
          <SceneMedia scene={scene} file="techx-2024-film-2" label="An RC car spinning on the campus ground at TechX Infinia in 2024" priority />
        </motion.div>
        <motion.div className="infinia-hero-panel infinia-hero-panel-flight" style={{ clipPath: `url(#infinia-seam-right-${id})`, ...(animate ? { x: rightX, rotate: rightRotate } : {}) }}>
          <SceneMedia scene={scene} file="techx-2024-film-3" companion={1} label="A model aircraft flying above campus at TechX Infinia in 2024" priority loopEnd={3} />
        </motion.div>
      </div> : <div className="infinia-hero-screen"><img src={photo.src} alt={photo.alt} width={photo.width} height={photo.height} fetchPriority="high" /></div>}
      <div className="infinia-hero-meta"><Link to="/">IEEE Sahrdaya SB <ArrowUpRight size={15} aria-hidden="true" /></Link><span>Sahrdaya, Kerala</span></div>
      <div className="infinia-hero-layout">
        <motion.div className="infinia-hero-story" style={animate ? { y: titleY } : undefined}>
          <p className="infinia-eyebrow">The flagship technical event</p>
          <h1 className={hub ? "infinia-wordmark" : "infinia-edition-wordmark"}><span className="infinia-rainbow-word">{title}</span></h1>
          <p className="infinia-hero-description">Workshops · Expos · Campus nights</p>
          {film && <a href="#expo-floor" className="infinia-hero-watch">See it in motion<ArrowDown size={18} aria-hidden="true" /></a>}
        </motion.div>
        <div className="infinia-hero-invite">
          <p className="infinia-eyebrow">{hub ? "Infinia 2.0 / The latest edition" : "This edition"}</p>
          <p className="infinia-hero-date">{hub || latest ? "26–28 September 2025" : "27–29 September 2024"}</p>
          <a href="#experience" className="infinia-hero-enter"><span>{hub ? "Explore Infinia 2.0" : "Explore the programme"}</span><ArrowDown size={21} aria-hidden="true" /></a>
        </div>
      </div>
      <div className="infinia-hero-caption"><p>{film ? "Lanterns · RC cars · Flight / TechX Infinia, 2024" : date}</p>
        <div className="infinia-scene-progress" aria-hidden="true"><motion.span style={scene.allowed && !scene.paused ? { scaleX: scene.progress } : { scaleX: 0 }} /></div>
        {film && <SceneControl scene={scene} name="hero films" />}
        {film && <Link to={hub ? "/infinia/2024#film" : "#film"} className="infinia-hero-watch">Watch the 2024 film<ArrowUpRight size={16} aria-hidden="true" /></Link>}
        {hub && <a href="#timeline" className="infinia-hero-history">Explore the timeline<ArrowDown size={14} aria-hidden="true" /></a>}
      </div>
      <svg className="infinia-rainbow-ribbon" viewBox="0 0 1440 75" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id={rainbow}><stop stopColor="#ff86b7" /><stop offset=".25" stopColor="#ffe29a" /><stop offset=".5" stopColor="#97e8c8" /><stop offset=".75" stopColor="#99c9ff" /><stop offset="1" stopColor="#dab0ff" /></linearGradient></defs><path d="M-10,53 C240,6 390,76 650,40 S1100,0 1450,50" fill="none" stroke={`url(#${rainbow})`} strokeWidth="8" /></svg>
    </div>
  </header>;
}
