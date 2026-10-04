import { useState } from "react";
import { ArrowUpRight, Maximize2, X } from "lucide-react";
import { Dialog } from "radix-ui";
import { Link } from "react-router";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { InfiniaVideoChapters } from "@/components/InfiniaScene";
import { InfiniaHero } from "@/components/InfiniaHero";
import { CanonicalLink } from "@/components/CanonicalLink";
import { FLAGSHIP_TIMELINE, type FlagshipImage } from "@/lib/flagships";
import { INFINIA, INFINIA_2024_PHOTOS, INFINIA_EVENING, INFINIA_PANEL, INFINIA_PHOTOS, INFINIA_POSTERS, INFINIA_STATS, INFINIA_WORKSHOPS, infiniaPoster } from "@/lib/infinia";
import "./infinia.css";

function Photo({ photo, priority = false }: { photo: FlagshipImage; priority?: boolean }) {
  return <img src={photo.src} alt={photo.alt} width={photo.width} height={photo.height} loading={priority ? "eager" : "lazy"} fetchPriority={priority ? "high" : undefined} />;
}
function MediaView({ photo, poster = false, compact = false }: { photo: FlagshipImage; poster?: boolean; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  return <figure className={`${poster ? "infinia-poster" : "infinia-photo"}${compact ? " infinia-poster-compact" : ""}`}>
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <a href={photo.src} onClick={event => { event.preventDefault(); setOpen(true); }} aria-label={`View ${photo.caption}`} className="infinia-media-trigger">
          <Photo photo={photo} />{compact ? <span className="infinia-poster-label" aria-hidden="true">Original poster <ArrowUpRight size={16} /></span> : <span className="infinia-expand" aria-hidden="true"><Maximize2 size={16} /></span>}
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
    <div><p className="infinia-eyebrow">Infinia editions</p><Link to="/flagships/altair" className="infinia-editions-archive">Altair archive <ArrowUpRight size={13} aria-hidden="true" /></Link></div>
    {INFINIA.editions.map(edition => <Link key={edition.year} to={`/infinia/${edition.year}`} aria-current={year === edition.year ? "page" : undefined}>
      <span>{edition.title}</span><span className="infinia-edition-year">{edition.year}</span><ArrowUpRight size={18} aria-hidden="true" />
    </Link>)}
  </nav>;
}

function FlagshipTimeline() {
  return <section id="timeline" className="infinia-section infinia-timeline" aria-labelledby="timeline-heading">
    <header className="infinia-timeline-heading">
      <p className="infinia-eyebrow">IEEE Sahrdaya SB / Our flagship events</p>
      <h2 id="timeline-heading">Flagship timeline</h2>
      <p>Infinia and Altair, from 2025 back to 2022. Each edition has its own programme and photographs.</p>
    </header>
    <ol className="infinia-timeline-list" role="list">
      {FLAGSHIP_TIMELINE.map(({ flagship, edition, href }) => <li key={`${flagship.slug}-${edition.year}`}>
        <Link to={href} className="infinia-timeline-entry" aria-label={`Explore ${edition.title} ${edition.year}`}>
          <span className="infinia-timeline-year">{edition.year}</span>
          <div className="infinia-timeline-copy">
            <p className="infinia-eyebrow">{flagship.name} / {edition.date}</p>
            <h3>{edition.title}<ArrowUpRight size={24} aria-hidden="true" /></h3>
            <p className="infinia-timeline-summary">{edition.summary}</p>
            <span className="infinia-timeline-status">{edition.recordType === "programme" ? "Programme archive" : "Event recap"}</span>
          </div>
          {edition.image && <figure><Photo photo={edition.image} /><figcaption>{edition.image.caption}</figcaption></figure>}
        </Link>
      </li>)}
    </ol>
  </section>;
}

export function InfiniaShowcase({ year = "2025", hub = false }: { year?: string; hub?: boolean }) {
  const edition = INFINIA.editions.find(edition => edition.year === year)!;
  const latest = year === "2025";
  const path = hub ? "/infinia" : `/infinia/${year}`;
  const gallery = latest ? INFINIA_PHOTOS : INFINIA_2024_PHOTOS;
  return <><div className="infinia-site">
    <CanonicalLink path={path} />
    <Navbar />
    <main id="main-content">
      <InfiniaHero key={path} hub={hub} latest={latest} title={hub ? "INFINIA" : edition.title} date={edition.date} photo={hub ? INFINIA.editions[1]!.image! : edition.image!} />
      {(hub || !latest) && <InfiniaVideoChapters />}
      <Editions year={year} />
      <section id="experience" className="infinia-section infinia-intro" aria-labelledby="experience-heading">
        <div><p className="infinia-eyebrow">{hub ? "The latest edition" : "The event"} / Sahrdaya, Kerala</p><h2 id="experience-heading">{edition.title}.<br /><em>{latest ? "26–28 September" : "27–29 September"}</em><br />{year}.</h2></div>
        <div className="infinia-intro-copy"><p>{edition.summary}</p><p>{latest ? "UIXOR teams designed a college companion app in Figma. QBIT participants worked with Verilog and a Basys 3 board. At IONIX, Hyundai brought an electric car for a live demonstration." : "The programme included a team hackathon, four expos and Bridge-the-Gap STEM outreach for pre-university students. Musical and cultural evenings followed the daytime sessions."}</p></div>
      </section>
      <figure className="infinia-community"><Photo photo={edition.image!} /><figcaption>{edition.image!.caption}</figcaption></figure>
      {latest && <section className="infinia-section infinia-numbers" aria-labelledby="numbers-heading">
        <div className="infinia-numbers-top"><h2 id="numbers-heading">Infinia 2.0<br />in numbers.</h2><p>26–28 September 2025<br />Figures from the completed event report.</p></div>
        <dl className="infinia-stat-grid">{INFINIA_STATS.map(stat => <div key={stat.label}><dt>{stat.label}</dt><dd>{stat.value}</dd></div>)}</dl>
        <div className="infinia-collaborators"><p className="infinia-eyebrow">Collaborations included / 2025</p><ul>{["TCS", "Hyundai", "Inker Robotics", "SpinX", "NIELIT"].map(name => <li key={name}>{name}</li>)}</ul></div>
      </section>}
      <section id="workshops" className="infinia-section infinia-workshops" aria-labelledby="workshops-heading">
        <Heading number="01" label={latest ? "27 September 2025 / Workshop day" : "28 September 2024 / Workshop day"} title={latest ? "Six workshop tracks." : "Nine workshop tracks."} id="workshops-heading" />
        {latest ? <><div className="infinia-workshop-grid">{INFINIA_WORKSHOPS.map((workshop, index) => <article key={workshop.name}>
          <div className="infinia-workshop-top"><span>{String(index + 1).padStart(2, "0")}</span><span>{workshop.topic}</span></div>
          <div className="infinia-workshop-photo"><MediaView photo={workshop.photo} /></div>
          <h3>{workshop.name}</h3><p className="infinia-workshop-description">{workshop.text}</p>
          <p className="infinia-host">{workshop.host}</p>
          <MediaView photo={infiniaPoster(workshop.poster, `${workshop.name  } · ${  workshop.topic}`)} poster compact />
          <details><summary>Inside {workshop.name}</summary><p>{workshop.detail}</p><p className="infinia-attendance">{workshop.count} attendees reported for this workshop · 2025</p></details>
        </article>)}</div><p className="infinia-source-note">Workshop attendance is reported per session and is separate from the event’s overall participant figure.</p></>
        : <div className="infinia-track-list">{edition.tracks.map((track, index) => <div key={track}><span>{String(index + 1).padStart(2, "0")}</span><h3>{track}</h3></div>)}</div>}
      </section>
      <section id="days" className="infinia-section infinia-days" aria-labelledby="days-heading">
        <Heading number="02" label={`${edition.date} / The programme`} title="Three days. The programme." id="days-heading" />
        <div className="infinia-day-grid" data-days={edition.highlights.length}>{edition.highlights.map((highlight, index) => <article key={highlight.title}>{latest && <Photo photo={[INFINIA_PHOTOS[0]!, INFINIA_WORKSHOPS[2]!.photo, INFINIA_PHOTOS[4]!][index]!} />}<span className="infinia-day-number">{String(index + 1).padStart(2, "0")}</span><h3>{highlight.title}</h3><p>{highlight.text}</p></article>)}</div>
      </section>
      {latest && <>
        <section className="infinia-evening" aria-labelledby="evening-heading"><Photo photo={INFINIA_EVENING} /><div className="infinia-evening-copy"><p className="infinia-eyebrow">Infinia 2.0 / 2025</p><h2 id="evening-heading">After the workshops.</h2><p>Wearable technology on stage, live music and cultural programmes rounded out the three days.</p></div></section>
        <section id="conversations" className="infinia-section infinia-conversations" aria-labelledby="conversations-heading">
          <Heading number="03" label="26 September 2025 / Panel discussion" title="The speakers." id="conversations-heading" />
          <div className="infinia-conversation-grid"><div><Photo photo={INFINIA_PHOTOS[1]!} /><p className="infinia-source-note">Panel moderated by Dr. Ramkumar S · Principal, SCET</p></div>
            <div><p className="infinia-panel-theme">Future-Proof Skills: What Engineers Need to Thrive in the Next Decade</p><p>Industry, research and academia met in one conversation about career choices, emerging technology and learning beyond the classroom.</p><ul>{INFINIA_PANEL.map(([name, role]) => <li key={name}><strong>{name}</strong><span>{role}</span></li>)}</ul></div>
          </div>
        </section>
        <section className="infinia-section infinia-vitals" aria-labelledby="vitals-heading">
          <div><p className="infinia-eyebrow">The pre-event / 30–31 August 2025</p><h2 id="vitals-heading">VITALS 24<span>A 24-hour hackathon.</span></h2><p>Before Infinia 2.0, teams progressed through project screening and presentations to an offline final. Twelve shortlisted teams competed in the final round.</p><p className="infinia-source-note">IEEE Computer Society · Unstop · IEEE CS Kerala Chapter</p></div>
          <dl className="infinia-vitals-stats"><div><dt>Individual registrations</dt><dd>724</dd></div><div><dt>Teams registered</dt><dd>270+</dd></div><div><dt>Colleges represented</dt><dd>150+</dd></div><div><dt>States represented</dt><dd>12</dd></div></dl>
          <p className="infinia-vitals-note">Vitals 24 pre-event figures · 2025. Registrations are separate from Infinia 2.0 attendance.</p>
        </section>
        <section id="posters" className="infinia-section infinia-poster-section" aria-labelledby="posters-heading">
          <Heading number="04" label="2025 / Original artwork" title="Original event artwork." id="posters-heading" />
          <p className="infinia-section-lede">The original announcements for the panel, healthcare talk, expos and evening programmes. Select a poster to see the full artwork.</p>
          <div className="infinia-poster-wall">{INFINIA_POSTERS.map(poster => <MediaView key={poster.src} photo={poster} poster />)}</div>
          <p className="infinia-source-note">Archived posters from 2025. Select any poster to read it in full.</p>
        </section>
      </>}
      <section id="moments" className="infinia-section infinia-gallery-section" aria-labelledby="moments-heading">
        <Heading number={latest ? "05" : "03"} label={`${year  } / Photo archive`} title={`${edition.title} in photos.`} id="moments-heading" />
        <div className="infinia-photo-grid">{gallery.map(photo => <MediaView key={photo.src} photo={photo} />)}</div>
      </section>
      {!latest && <section id="film" className="infinia-section infinia-film" aria-labelledby="film-heading">
        <div><p className="infinia-eyebrow">04 / TechX Infinia / 2024</p><h2 id="film-heading">The 2024<br />highlights.</h2><p>Expo tables, drone flights, outdoor activities and the closing ceremony from the first edition.</p><p className="infinia-source-note">43-second silent highlights · TechX Infinia, 2024</p><details><summary>Read the visual description</summary><p>The film opens on expo tables and student demonstrations, moves through outdoor activities and drone flights, then shows speakers at the podium. It closes with the TechX Infinia identity and sponsor board.</p></details>
          {edition.recap && <Link to={edition.recap.href} className="infinia-link">{edition.recap.label}<ArrowUpRight size={18} aria-hidden="true" /></Link>}
        </div>
        <video controls playsInline preload="none" poster="/media/infinia/techx-2024-video-poster.webp" width="360" height="640" aria-label="TechX Infinia 2024 silent highlights"><source src="/media/infinia/techx-2024-highlights.webm" type="video/webm" /><source src="/media/infinia/techx-2024-highlights.mp4" type="video/mp4" /><track kind="captions" src="/media/infinia/techx-2024-highlights.vtt" srcLang="en" label="Visual descriptions" default />Your browser does not support video. The visual description is available beside the player.</video>
      </section>}
      <section id={latest ? "edition-2024" : "edition-2025"} className="infinia-next-edition" aria-labelledby="next-edition-heading">
        <div><p className="infinia-eyebrow">{latest ? "The first edition" : "The next edition"}</p><h2 id="next-edition-heading">{latest ? "2024" : "2025"}</h2><Link to={latest ? "/infinia/2024" : "/infinia/2025"} className="infinia-next-link">{latest ? "TechX Infinia" : "Infinia 2.0"} <ArrowUpRight aria-hidden="true" /></Link><p>{latest ? "Nine workshop tracks, four expos, a hackathon and the beginning of the Infinia story." : "Six workshop tracks and a new meeting between campus learning and industry practice."}</p>{latest && <Link className="infinia-link" to="/infinia/2024#film">Watch the 2024 highlights <ArrowUpRight size={18} aria-hidden="true" /></Link>}</div>
        <Link to={latest ? "/infinia/2024" : "/infinia/2025"} aria-label={latest ? "Explore TechX Infinia 2024" : "Explore Infinia 2.0 2025"}><Photo photo={INFINIA.editions[latest ? 1 : 0]!.image!} /></Link>
      </section>
      {hub && <FlagshipTimeline />}
    </main>
  </div><Footer /></>;
}
