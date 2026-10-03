import { useState } from "react";
import { ArrowDown, ArrowUpRight, Maximize2, X } from "lucide-react";
import { Dialog } from "radix-ui";
import { Link } from "react-router";
import Navbar from "@/components/Navbar";
import { CanonicalLink } from "@/components/CanonicalLink";
import { type FlagshipImage } from "@/lib/flagships";
import { INFINIA, INFINIA_2024_PHOTOS, INFINIA_PANEL, INFINIA_PHOTOS, INFINIA_POSTERS, INFINIA_STATS, INFINIA_WORKSHOPS, infiniaPoster } from "@/lib/infinia";
import "./infinia.css";

function Photo({ photo, priority = false }: { photo: FlagshipImage; priority?: boolean }) {
  return <img src={photo.src} alt={photo.alt} width={photo.width} height={photo.height} loading={priority ? "eager" : "lazy"} fetchPriority={priority ? "high" : undefined} />;
}
function MediaView({ photo, poster = false }: { photo: FlagshipImage; poster?: boolean }) {
  const [open, setOpen] = useState(false);
  return <figure className={poster ? "infinia-poster" : "infinia-photo"}>
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <a href={photo.src} onClick={event => { event.preventDefault(); setOpen(true); }} aria-label={`View ${photo.caption}`} className="infinia-media-trigger">
          <Photo photo={photo} /><span className="infinia-expand" aria-hidden="true"><Maximize2 size={16} /></span>
        </a>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="infinia-viewer-overlay" />
        <Dialog.Content className="infinia-viewer">
          <div className="infinia-viewer-top">
            <Dialog.Title>{photo.caption}</Dialog.Title>
            <Dialog.Close className="infinia-viewer-close" aria-label="Close image"><X size={22} /></Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">{photo.alt}</Dialog.Description>
          <img src={photo.src} alt={photo.alt} width={photo.width} height={photo.height} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
    <figcaption>{photo.caption}</figcaption>
  </figure>;
}
function Heading({ number, label, title, id }: { number: string; label: string; title: string; id: string }) {
  return <header className="infinia-section-heading"><p className="infinia-eyebrow">{number} / {label}</p><h2 id={id}>{title}</h2></header>;
}
function Editions({ year }: { year: string }) {
  return <nav className="infinia-editions" aria-label="Infinia editions">
    <span className="infinia-eyebrow">Choose your chapter</span>
    {INFINIA.editions.map(edition => <Link key={edition.year} to={`/infinia/${edition.year}`} aria-current={year === edition.year ? "page" : undefined}>
      <span>{edition.title}</span><span className="infinia-edition-year">{edition.year}</span><ArrowUpRight size={18} aria-hidden="true" />
    </Link>)}
  </nav>;
}

export function InfiniaShowcase({ year = "2025", hub = false }: { year?: string; hub?: boolean }) {
  const edition = INFINIA.editions.find(edition => edition.year === year)!;
  const latest = year === "2025";
  const path = hub ? "/infinia" : `/infinia/${year}`;
  const gallery = latest ? INFINIA_PHOTOS : INFINIA_2024_PHOTOS;
  return <div className="infinia-site">
    <CanonicalLink path={path} />
    <Navbar />
    <main id="main-content">
      <header className="infinia-hero">
        <div className="infinia-hero-meta"><Link to="/">IEEE Sahrdaya SB <ArrowUpRight size={15} aria-hidden="true" /></Link><span>Flagship experience / Edition archive</span></div>
        <h1 className={hub ? "infinia-wordmark" : "infinia-edition-wordmark"}>{hub ? "INFINIA" : edition.title}</h1>
        <div className="infinia-hero-bottom">
          <div><p className="infinia-eyebrow">{latest ? "Infinia 2.0" : "The first edition"} / {edition.date}</p>
            <p className="infinia-hero-line">{latest ? <>Beyond imagination.<br /><span>Into experience.</span></> : <>Where imagination<br /><span>meets technology.</span></>}</p>
          </div>
          <div className="infinia-hero-intro"><p>A meeting place for curious minds. Hands-on technology, industry conversations and the people who make it happen.</p><a href="#experience" className="infinia-link">Step inside <ArrowDown size={18} aria-hidden="true" /></a></div>
        </div>
        <div className="infinia-spectrum" aria-hidden="true" />
      </header>
      <Editions year={year} />
      <section id="experience" className="infinia-section infinia-intro" aria-labelledby="experience-heading">
        <div><p className="infinia-eyebrow">Sahrdaya, Kerala / {year}</p><h2 id="experience-heading">The ideas are big.<br />The experience<br /><em>is hands-on.</em></h2></div>
        <div className="infinia-intro-copy"><p>{edition.summary}</p><p>{latest ? "Build an interface. Explore an electric car. Put logic on a board. Infinia 2.0 connected what students learn on campus with the tools, questions and people shaping industry." : "The first edition brought nine technical workshop tracks together with a hackathon, four expos and STEM outreach. Making, conversation and community shared the same campus."}</p></div>
      </section>
      <figure className="infinia-community"><Photo photo={edition.image!} priority /><figcaption>{edition.image!.caption}</figcaption></figure>
      {latest && <section className="infinia-section infinia-numbers" aria-labelledby="numbers-heading">
        <div className="infinia-numbers-top"><h2 id="numbers-heading">One edition.<br />A collective effort.</h2><p>Infinia 2.0 · 2025<br />Figures from the completed event report.</p></div>
        <dl className="infinia-stat-grid">{INFINIA_STATS.map(stat => <div key={stat.label}><dt>{stat.label}</dt><dd>{stat.value}</dd></div>)}</dl>
        <div className="infinia-collaborators"><p className="infinia-eyebrow">Collaborations included / 2025</p><ul>{["TCS", "Hyundai", "Inker Robotics", "SpinX", "NIELIT"].map(name => <li key={name}>{name}</li>)}</ul></div>
      </section>}
      <section id="workshops" className="infinia-section infinia-workshops" aria-labelledby="workshops-heading">
        <Heading number="01" label={latest ? "27 September 2025 / Workshop day" : "28 September 2024 / Workshop day"} title={latest ? "Six ways to get your hands on the future." : "Nine starting points. Endless curiosity."} id="workshops-heading" />
        {latest ? <><div className="infinia-workshop-grid">{INFINIA_WORKSHOPS.map((workshop, index) => <article key={workshop.name}>
          <div className="infinia-workshop-top"><span>{String(index + 1).padStart(2, "0")}</span><span>{workshop.topic}</span></div>
          <MediaView photo={infiniaPoster(workshop.poster, `${workshop.name  } · ${  workshop.topic}`)} poster />
          <h3>{workshop.name}</h3><p className="infinia-workshop-description">{workshop.text}</p>
          <p className="infinia-host">{workshop.host}</p>
          <details><summary>Inside {workshop.name}</summary><p>{workshop.detail}</p><p className="infinia-attendance">{workshop.count} attendees reported for this workshop · 2025</p></details>
        </article>)}</div><p className="infinia-source-note">Workshop attendance is reported per session and is separate from the event’s overall participant figure.</p></>
        : <div className="infinia-track-list">{edition.tracks.map((track, index) => <div key={track}><span>{String(index + 1).padStart(2, "0")}</span><h3>{track}</h3></div>)}</div>}
      </section>
      <section id="days" className="infinia-section infinia-days" aria-labelledby="days-heading">
        <Heading number="02" label="Three days / A shared campus" title="A story you can step into." id="days-heading" />
        <div className="infinia-day-grid">{edition.highlights.map((highlight, index) => <article key={highlight.title}><span className="infinia-day-number">{String(index + 1).padStart(2, "0")}</span><h3>{highlight.title}</h3><p>{highlight.text}</p></article>)}</div>
      </section>
      {latest && <>
        <section id="conversations" className="infinia-section infinia-conversations" aria-labelledby="conversations-heading">
          <Heading number="03" label="26 September 2025 / In conversation" title="The questions that shape what comes next." id="conversations-heading" />
          <div className="infinia-conversation-grid"><div><Photo photo={INFINIA_PHOTOS[1]!} /><p className="infinia-source-note">Panel moderated by Dr. Ramkumar S · Principal, SCET</p></div>
            <div><p className="infinia-panel-theme">Future-Proof Skills: What Engineers Need to Thrive in the Next Decade</p><p>Industry, research and academia met in one conversation about career choices, emerging technology and learning beyond the classroom.</p><ul>{INFINIA_PANEL.map(([name, role]) => <li key={name}><strong>{name}</strong><span>{role}</span></li>)}</ul></div>
          </div>
        </section>
        <section className="infinia-section infinia-vitals" aria-labelledby="vitals-heading">
          <div><p className="infinia-eyebrow">The pre-event / 30–31 August 2025</p><h2 id="vitals-heading">VITALS 24<span>Ideas under pressure.</span></h2><p>Before Infinia 2.0, a 24-hour hackathon brought teams through project screening, presentations and an offline final. Twelve shortlisted teams took their ideas into the final round.</p><p className="infinia-source-note">IEEE Computer Society · Unstop · IEEE CS Kerala Chapter</p></div>
          <dl className="infinia-vitals-stats"><div><dt>Individual registrations</dt><dd>724</dd></div><div><dt>Teams registered</dt><dd>270+</dd></div><div><dt>Colleges represented</dt><dd>150+</dd></div><div><dt>States represented</dt><dd>12</dd></div></dl>
          <p className="infinia-vitals-note">Vitals 24 pre-event figures · 2025. Registrations are separate from Infinia 2.0 attendance.</p>
        </section>
        <section id="posters" className="infinia-section infinia-poster-section" aria-labelledby="posters-heading">
          <Heading number="04" label="2025 / The visual identity" title="An experience with its own language." id="posters-heading" />
          <p className="infinia-section-lede">Robotics and drone expos. AI in healthcare. Wearable circuits on the runway. Live music after a day of making. The original posters capture the different sides of Infinia 2.0.</p>
          <div className="infinia-poster-wall">{INFINIA_POSTERS.map(poster => <MediaView key={poster.src} photo={poster} poster />)}</div>
          <p className="infinia-source-note">Archived posters from 2025. Select any poster to read it in full.</p>
        </section>
      </>}
      <section id="moments" className="infinia-section infinia-gallery-section" aria-labelledby="moments-heading">
        <Heading number={latest ? "05" : "03"} label={`${year  } / Through the lens`} title="The people make the picture." id="moments-heading" />
        <div className="infinia-photo-grid">{gallery.map(photo => <MediaView key={photo.src} photo={photo} />)}</div>
      </section>
      {!latest && <section id="film" className="infinia-section infinia-film" aria-labelledby="film-heading">
        <div><p className="infinia-eyebrow">04 / TechX Infinia / 2024</p><h2 id="film-heading">A little of<br />the atmosphere.</h2><p>Step into the expo floor, watch drones take flight and revisit the closing moments of the first edition.</p><p className="infinia-source-note">43-second silent highlights · TechX Infinia, 2024</p><details><summary>Read the visual description</summary><p>The film opens on expo tables and student demonstrations, moves through outdoor activities and drone flights, then shows speakers at the podium. It closes with the TechX Infinia identity and sponsor board.</p></details>
          {edition.recap && <Link to={edition.recap.href} className="infinia-link">{edition.recap.label}<ArrowUpRight size={18} aria-hidden="true" /></Link>}
        </div>
        <video controls playsInline preload="none" poster="/media/infinia/techx-2024-video-poster.webp" width="360" height="640" aria-label="TechX Infinia 2024 silent highlights"><source src="/media/infinia/techx-2024-highlights.webm" type="video/webm" /><source src="/media/infinia/techx-2024-highlights.mp4" type="video/mp4" /><track kind="captions" src="/media/infinia/techx-2024-highlights.vtt" srcLang="en" label="Visual descriptions" default />Your browser does not support video. The visual description is available beside the player.</video>
      </section>}
      <section id={latest ? "edition-2024" : "edition-2025"} className="infinia-next-edition" aria-labelledby="next-edition-heading">
        <div><p className="infinia-eyebrow">{latest ? "Revisit the first chapter" : "Discover the next chapter"}</p><h2 id="next-edition-heading">{latest ? "2024" : "2025"}</h2><Link to={latest ? "/infinia/2024" : "/infinia/2025"} className="infinia-next-link">{latest ? "TechX Infinia" : "Infinia 2.0"} <ArrowUpRight aria-hidden="true" /></Link><p>{latest ? "Nine workshop tracks, four expos, a hackathon and the beginning of the Infinia story." : "Six workshop tracks and a new meeting between campus learning and industry practice."}</p>{latest && <Link className="infinia-link" to="/infinia/2024#film">Watch the 2024 highlights <ArrowUpRight size={18} aria-hidden="true" /></Link>}</div>
        <Link to={latest ? "/infinia/2024" : "/infinia/2025"} aria-label={latest ? "Explore TechX Infinia 2024" : "Explore Infinia 2.0 2025"}><Photo photo={INFINIA.editions[latest ? 1 : 0]!.image!} /></Link>
      </section>
    </main>
    <footer className="infinia-footer"><Link to="/">IEEE Sahrdaya SB <ArrowUpRight size={16} aria-hidden="true" /></Link><p>Curiosity. Community. Infinia.</p><nav aria-label="Infinia footer"><Link to="/flagships/altair">Altair archive</Link><Link to="/privacy-policy">Privacy</Link></nav></footer>
  </div>;
}
