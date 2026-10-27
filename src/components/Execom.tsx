import { useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowUpRight, Globe2 } from 'lucide-react';
import { Link } from 'react-router';
import { HomeSectionHeading } from '@/components/home/HomeSectionHeading';
import { Linkedin } from '@/components/icons';
import type { ExecomMemberDoc } from '@/features/execom/ExecomClient';

function MemberCard({ member, index }: { member: ExecomMemberDoc; index: number }) {
  const [failed, setFailed] = useState(false);
  const reduceMotion = Boolean(useReducedMotion());
  const hasPhoto = Boolean(member.photoUrl) && !failed;
  const contactClass = 'inline-flex min-h-11 items-center gap-2 text-xs font-semibold text-ieee-blue hover:underline focus-visible:outline-2 focus-visible:outline-ieee-blue';

  return (
    <li className="group w-[min(270px,78vw)] shrink-0 snap-start">
      <div className="relative mb-4 aspect-[3/4] overflow-hidden rounded-xl bg-gray-100">
        {hasPhoto ? (
          <img
            src={member.photoUrl}
            alt={member.name}
            draggable={false}
            loading="lazy"
            onError={() => setFailed(true)}
            className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
          />
        ) : (
          <div className="grid h-full place-items-center bg-gray-100 text-4xl font-bold text-gray-400" aria-hidden="true">
            {member.name.split(' ').map(part => part[0]).join('').slice(0, 2)}
          </div>
        )}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
        <span className="absolute left-3 top-3 max-w-[calc(100%-1.5rem)] truncate rounded-sm bg-white/90 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-gray-800 backdrop-blur-sm">
          {member.position}
        </span>
        <span aria-hidden="true" className="pointer-events-none absolute bottom-3 right-3 font-pixel text-4xl text-white/75 opacity-0 transition-opacity group-hover:opacity-100">
          {String(index + 1).padStart(2, '0')}
        </span>
      </div>
      <h3 className="text-lg font-bold tracking-tight text-gray-900 transition-colors group-hover:text-ieee-blue sm:text-xl">{member.name}</h3>
      <div className="mt-1 overflow-hidden whitespace-nowrap" role="text" aria-label={member.position}>
        <motion.span
          aria-hidden="true"
          className="inline-block font-mono text-[10px] uppercase tracking-[0.2em] text-ieee-blue/70"
          animate={reduceMotion ? undefined : { x: ['0%', '-50%'] }}
          transition={reduceMotion ? undefined : { duration: 14, ease: 'linear', repeat: Infinity }}
        >
          {(member.position + '  •  ').repeat(8)}
        </motion.span>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-5">
        {member.linkedin && <a href={member.linkedin} target="_blank" rel="noopener noreferrer" aria-label={member.name + ' on LinkedIn'} className={contactClass}><Linkedin className="h-4 w-4" aria-hidden="true" />LinkedIn</a>}
        {member.portfolio && <a href={member.portfolio} target="_blank" rel="noopener noreferrer" aria-label={member.name + ' website'} className={contactClass}><Globe2 className="h-4 w-4" aria-hidden="true" />Website</a>}
      </div>
    </li>
  );
}

export function Execom({
  members,
  societyCount = 0,
  rosterCount = 0,
  upcomingCount = 0,
}: {
  members: ExecomMemberDoc[];
  societyCount?: number;
  rosterCount?: number;
  upcomingCount?: number;
}) {
  const track = useRef<HTMLUListElement>(null);
  const pointerStart = useRef<{ x: number; scrollLeft: number } | null>(null);
  const didDrag = useRef(false);

  return (
    <section id="execom" className="relative overflow-hidden border-t border-gray-200 bg-white pb-20 pt-14 md:pb-24 md:pt-16">
      <div className="relative mx-auto max-w-[1320px] px-5 sm:px-6 lg:px-10">
        <HomeSectionHeading
          index="02"
          label="The people"
          title={<>Meet the people<br /><span className="text-ieee-blue">behind the vision.</span></>}
          description="The core committee coordinating the branch, its communities and the work that happens between them."
          action={<Link to="/full-execom" className="inline-flex min-h-11 items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-gray-700 hover:text-ieee-blue">View full Execom <ArrowUpRight className="h-4 w-4" /></Link>}
        />

        <div className="mb-10 mt-10 grid grid-cols-3 border-y border-gray-200 md:mb-14">
          {([['Roster', rosterCount], ['Societies', societyCount], ['Upcoming', upcomingCount]] as const).map(([label, value], index) => (
            <div key={label} className={'py-5 text-center md:py-6 ' + (index > 0 ? 'border-l border-gray-200' : '')}>
              <div className="font-mono text-[8px] font-semibold uppercase tracking-[0.2em] text-gray-500 sm:text-[9px]">{label}</div>
              <div className="mt-2 font-pixel text-xl text-gray-900 sm:text-2xl md:text-3xl">{String(value).padStart(2, '0')}</div>
            </div>
          ))}
        </div>

        <div data-home-execom-static>
          {members.length > 0 ? (
            <>
              <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.12em] text-gray-500">Drag or scroll to meet the core team</p>
              <ul
                ref={track}
                tabIndex={0}
                aria-label="Core executive committee"
                onPointerDown={(event) => {
                  if (event.pointerType !== 'mouse' || event.button !== 0) return;
                  pointerStart.current = { x: event.clientX, scrollLeft: event.currentTarget.scrollLeft };
                  didDrag.current = false;
                }}
                onPointerMove={(event) => {
                  if (!pointerStart.current) return;
                  const delta = event.clientX - pointerStart.current.x;
                  if (Math.abs(delta) > 6) didDrag.current = true;
                  event.currentTarget.scrollLeft = pointerStart.current.scrollLeft - delta;
                }}
                onPointerUp={() => { pointerStart.current = null; }}
                onPointerCancel={() => { pointerStart.current = null; }}
                onPointerLeave={() => { pointerStart.current = null; }}
                onClickCapture={(event) => {
                  if (didDrag.current) { event.preventDefault(); event.stopPropagation(); didDrag.current = false; }
                }}
                className="flex snap-x snap-mandatory gap-[30px] overflow-x-auto pb-5 [scrollbar-width:thin] focus-visible:outline-2 focus-visible:outline-ieee-blue"
              >
                {members.map((member, index) => <MemberCard key={member.id} member={member} index={index} />)}
              </ul>
            </>
          ) : (
            <p className="mt-8 rounded-xl bg-gray-50 p-6 text-sm text-gray-600">The core team roster is not available here yet. Visit the full directory or contact the branch for current committee details.</p>
          )}
        </div>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-sm">
          <Link to="/contact" className="inline-flex min-h-11 items-center gap-2 font-semibold text-ieee-blue">Contact the branch <ArrowUpRight className="h-4 w-4" /></Link>
          <a href="https://students.ieee.org/" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 font-semibold text-gray-700">Join IEEE <ArrowUpRight className="h-4 w-4" /></a>
        </div>
      </div>
    </section>
  );
}
