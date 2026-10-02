import { useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ArrowUpRight, Globe2 } from 'lucide-react';
import { Link } from 'react-router';
import { HomeSectionHeading } from '@/components/home/HomeSectionHeading';
import { Linkedin } from '@/components/icons';
import type { ExecomMemberDoc } from '@/features/execom/ExecomClient';
function MemberCard({ member }: { member: ExecomMemberDoc }) {
  const [failed, setFailed] = useState(false);
  const contactClass = 'inline-flex min-h-11 items-center gap-2 text-xs font-semibold text-ieee-blue hover:underline focus-visible:outline-2 focus-visible:outline-ieee-blue';
  return (
    <li className="w-[min(270px,78vw)] shrink-0 snap-start">
      <div className="relative mb-4 aspect-[3/4] overflow-hidden rounded-xl bg-gray-100">
        {member.photoUrl && !failed ? <img src={member.photoUrl} alt="" loading="lazy" onError={() => setFailed(true)} className="h-full w-full object-cover" /> : <div aria-hidden="true" className="grid h-full place-items-center text-4xl font-bold text-gray-400">{member.name.split(' ').map(n => n[0]).join('').slice(0, 2)}</div>}
      </div>
      <h3 className="text-xl font-bold tracking-tight text-gray-900">{member.name}</h3>
      <p className="mt-1 text-sm text-gray-600">{member.position}</p>
      <div className="mt-2 flex flex-wrap gap-x-5">
        {member.linkedin && <a href={member.linkedin} target="_blank" rel="noopener noreferrer" aria-label={`${member.name} on LinkedIn`} className={contactClass}><Linkedin className="h-4 w-4" aria-hidden="true" />LinkedIn</a>}
        {member.portfolio && <a href={member.portfolio} target="_blank" rel="noopener noreferrer" aria-label={`${member.name}'s website`} className={contactClass}><Globe2 className="h-4 w-4" aria-hidden="true" />Website</a>}
      </div>
    </li>
  );
}
export function Execom({ members }: { members: ExecomMemberDoc[] }) {
  const track = useRef<HTMLUListElement>(null);
  return (
    <section id="execom" className="relative overflow-hidden border-t border-gray-200 bg-white pb-20 pt-14 md:pb-24 md:pt-16">
      <div className="mx-auto max-w-[1320px] px-5 sm:px-6 lg:px-10">
        <HomeSectionHeading index="02" label="The people" title={<>Meet the people<br /><span className="text-ieee-blue">behind the vision.</span></>} description="The core committee coordinating the branch, its communities and the work that happens between them." action={<Link to="/full-execom" className="inline-flex min-h-11 items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-gray-700 hover:text-ieee-blue">View full Execom <ArrowUpRight className="h-4 w-4" /></Link>} />
        {members.length > 0 && <div className="mb-4 mt-8 flex items-center justify-between gap-4">
          <p className="text-xs text-gray-500">Scroll to meet the core team.</p>
          <div className="flex gap-2">
            <button type="button" aria-label="Previous team members" onClick={() => track.current?.scrollBy({ left: -300, behavior: 'auto' })} className="grid h-11 w-11 place-items-center rounded-full border border-gray-200 hover:border-ieee-blue"><ArrowLeft className="h-4 w-4" /></button>
            <button type="button" aria-label="Next team members" onClick={() => track.current?.scrollBy({ left: 300, behavior: 'auto' })} className="grid h-11 w-11 place-items-center rounded-full border border-gray-200 hover:border-ieee-blue"><ArrowRight className="h-4 w-4" /></button>
          </div>
        </div>}
        <div data-home-execom-static>
        {members.length > 0 ? <ul ref={track} tabIndex={0} aria-label="Core executive committee" className="flex snap-x snap-mandatory gap-[30px] overflow-x-auto pb-4 [scrollbar-width:thin] focus-visible:outline-2 focus-visible:outline-ieee-blue">
          {members.map(member => <MemberCard key={member.id} member={member} />)}
        </ul> : <p className="mt-8 rounded-xl bg-gray-50 p-6 text-sm text-gray-600">The core team roster is not available here yet. Visit the full directory or contact the branch for current committee details.</p>}
        </div>
        <div className="mt-8 flex flex-wrap items-center gap-5 text-sm">
          <Link to="/contact" className="inline-flex min-h-11 items-center gap-2 font-semibold text-ieee-blue">Contact the branch <ArrowUpRight className="h-4 w-4" /></Link>
          <a href="https://students.ieee.org/" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 font-semibold text-gray-700">Join IEEE <ArrowUpRight className="h-4 w-4" /></a>
        </div>
      </div>
    </section>
  );
}
