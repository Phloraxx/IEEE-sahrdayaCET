import { ArrowDown, ArrowUpRight } from "lucide-react";
import { motion } from "framer-motion";
import { Link } from "react-router";
import { type FlagshipImage } from "@/lib/flagships";
import { SceneControl, SceneMedia, useInfiniaScene } from "@/components/InfiniaScene";

export function InfiniaHero({ hub, latest, title, date, photo }: {
  hub: boolean; latest: boolean; title: string; date: string; photo: FlagshipImage;
}) {
  const film = hub || !latest;
  const scene = useInfiniaScene(film);
  return <header ref={scene.section} className="infinia-hero" data-film={film} data-enhanced={scene.allowed}>
    <div ref={scene.stage} className="infinia-hero-stage">
      <div className="infinia-orbit" aria-hidden="true"><span /><span /><span /></div>
      <div className="infinia-hero-meta"><Link to="/">IEEE Sahrdaya SB <ArrowUpRight size={15} aria-hidden="true" /></Link><span>Sahrdaya, Kerala / {hub ? "2024–2025" : date}</span></div>
      <div className="infinia-hero-layout">
        <div className="infinia-hero-story">
          <p className="infinia-eyebrow">IEEE Sahrdaya’s flagship technical event</p>
          <h1 className={hub ? "infinia-wordmark" : "infinia-edition-wordmark"}>{title}</h1>
          <p className="infinia-hero-line">Workshops.<br />Expos.<br /><span>All on campus.</span></p>
          <p className="infinia-hero-description">Three days of technology, demonstrations and evenings together at Sahrdaya.</p>
          <div className="infinia-hero-actions"><a href="#experience" className="infinia-hero-enter">{hub ? "Explore Infinia 2.0" : "Explore the programme"}<ArrowDown size={18} aria-hidden="true" /></a>{film && <a href="#expo-floor" className="infinia-hero-watch">See it in motion<ArrowDown size={18} aria-hidden="true" /></a>}</div>
        </div>
        <motion.div className="infinia-hero-screen" style={scene.allowed && !scene.paused ? { scale: scene.scale, y: scene.y } : undefined}>
          {film ? <SceneMedia scene={scene} file="techx-2024-film-2" label="An RC car spinning on the campus ground at TechX Infinia in 2024" priority /> : <img src={photo.src} alt={photo.alt} width={photo.width} height={photo.height} fetchPriority="high" />}
          <div className="infinia-scene-caption"><span>{film ? "RC-car expo · TechX Infinia, 2024" : "Infinia 2.0 · 26–28 September 2025"}</span>{film && <SceneControl scene={scene} name="RC-car film" />}</div>
          {film && <span className="infinia-screen-marker" aria-hidden="true">01 / 04</span>}
        </motion.div>
      </div>
      <div className="infinia-hero-caption"><p>{film ? "In motion · TechX Infinia, 2024" : date}</p><div className="infinia-scene-progress" aria-hidden="true"><motion.span style={scene.allowed && !scene.paused ? { scaleX: scene.progress } : { scaleX: 0 }} /></div>{film && <Link to={hub ? "/infinia/2024#film" : "#film"} className="infinia-hero-watch">Watch the 2024 film<ArrowUpRight size={16} aria-hidden="true" /></Link>}{hub && <a href="#timeline" className="infinia-hero-history">Explore the timeline<ArrowDown size={14} aria-hidden="true" /></a>}</div>
    </div>
  </header>;
}
