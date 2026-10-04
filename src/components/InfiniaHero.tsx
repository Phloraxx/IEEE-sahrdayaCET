import { ArrowDown, ArrowUpRight, Asterisk } from "lucide-react";
import { motion, useTransform } from "framer-motion";
import { Link } from "react-router";
import { type FlagshipImage } from "@/lib/flagships";
import { SceneControl, SceneMedia, useInfiniaScene } from "@/components/InfiniaScene";

export function InfiniaHero({ hub, latest, title, date, photo }: {
  hub: boolean; latest: boolean; title: string; date: string; photo: FlagshipImage;
}) {
  const film = hub || !latest;
  const scene = useInfiniaScene(film);
  const turn = useTransform(scene.progress, [0, 1], [-3, 3]);
  const lift = useTransform(scene.progress, [0, 1], [0, -35]);
  return <header ref={scene.section} className="infinia-hero" data-film={film} data-enhanced={scene.allowed}>
    <div ref={scene.stage} className="infinia-hero-stage">
      <div className="infinia-hero-meta"><Link to="/">IEEE Sahrdaya SB <ArrowUpRight size={15} aria-hidden="true" /></Link><span>Flagship technical event / Kerala</span></div>
      <h1 className={hub ? "infinia-wordmark" : "infinia-edition-wordmark"}>{title}</h1>
      <div className="infinia-hero-layout">
        <div className="infinia-hero-story">
          <Asterisk className="infinia-festival-symbol" strokeWidth={1.1} aria-hidden="true" />
          <p className="infinia-hero-line">Three days.<br />One campus.</p>
          <p className="infinia-hero-description">Workshops, live expos and evenings together at Sahrdaya.</p>
          {film && <a href="#expo-floor" className="infinia-hero-watch">See it in motion<ArrowDown size={18} aria-hidden="true" /></a>}
        </div>
        <motion.div className="infinia-hero-screen" style={scene.allowed && !scene.paused ? { rotate: turn, y: lift } : undefined}>
          {film ? <SceneMedia scene={scene} file="techx-2024-film-2" label="An RC car spinning on the campus ground at TechX Infinia in 2024" priority /> : <img src={photo.src} alt={photo.alt} width={photo.width} height={photo.height} fetchPriority="high" />}
          {!film && <div className="infinia-scene-caption"><span>Infinia 2.0 · 26–28 September 2025</span></div>}
        </motion.div>
        <div className="infinia-hero-invite"><p className="infinia-eyebrow">{hub ? "The latest edition" : "This edition"}</p><p className="infinia-hero-date">{hub || latest ? <>26—28 SEP<br /><span>2025</span></> : <>27—29 SEP<br /><span>2024</span></>}</p><a href="#experience" className="infinia-hero-enter"><span>{hub ? "Explore Infinia 2.0" : "Explore the programme"}</span><ArrowDown size={24} aria-hidden="true" /></a></div>
      </div>
      <div className="infinia-hero-caption"><p>{film ? "RC-car expo · TechX Infinia, 2024" : date}</p><div className="infinia-scene-progress" aria-hidden="true"><motion.span style={scene.allowed && !scene.paused ? { scaleX: scene.progress } : { scaleX: 0 }} /></div>{film && <SceneControl scene={scene} name="RC-car film" />}{film && <Link to={hub ? "/infinia/2024#film" : "#film"} className="infinia-hero-watch">Watch the 2024 film<ArrowUpRight size={16} aria-hidden="true" /></Link>}{hub && <a href="#timeline" className="infinia-hero-history">Explore the timeline<ArrowDown size={14} aria-hidden="true" /></a>}</div>
    </div>
  </header>;
}
