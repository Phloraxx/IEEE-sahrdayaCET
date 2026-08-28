import { ArrowRight, ArrowUpRight } from "lucide-react";
import { Link } from "react-router";
import { HomeSectionHeading } from "@/components/home/HomeSectionHeading";
import { formatDateShort } from "@/lib/dates";
import { getBlogContentType } from "@/lib/blog-presentation";
import type { BlogPost } from "@/types";

function authorName(post: BlogPost) {
  return typeof post.author === "string" ? post.author : post.author?.name || "IEEE Sahrdaya";
}

export function LatestSignals({ blogs }: { blogs: BlogPost[] }) {
  const [lead, ...rest] = blogs;
  if (!lead) return null;
  const secondary = rest.slice(0, 2);

  return (
    <section className="relative bg-white px-5 py-20 sm:px-6 sm:py-24 lg:px-10 lg:py-28">
      <div className="mx-auto max-w-[1320px]">
        <HomeSectionHeading
          index="04"
          label="Latest signals"
          title={<>Stories worth <span className="text-ieee-blue">keeping.</span></>}
          description="Event logs, technical notes and branch stories recorded as they happen."
          action={<Link to="/blog" className="group inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-gray-700 transition hover:text-ieee-blue">View all stories <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" /></Link>}
        />

        <div className="mt-10 grid gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.75fr)]">
          <Link to={`/blog/${lead.slug}`} className="group grid overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm md:grid-cols-[1.1fr_0.9fr]">
            <div className="relative min-h-[300px] overflow-hidden bg-gray-100 md:min-h-[430px]">
              {lead.coverUrl ? <img src={lead.coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-[1.035]" /> : <div className="absolute inset-0 bg-[linear-gradient(135deg,#f8fafc_25%,transparent_25%,transparent_50%,#f8fafc_50%,#f8fafc_75%,transparent_75%)] bg-[length:22px_22px]" />}
              <span className="absolute left-4 top-4 rounded-sm bg-gray-950 px-2.5 py-1.5 font-pixel text-[8px] text-white">LATEST / 01</span>
            </div>
            <div className="flex flex-col justify-between p-6 sm:p-7">
              <div>
                <p className="font-mono text-[8px] font-semibold uppercase tracking-[0.17em] text-ieee-blue">{getBlogContentType(lead)} · {lead.publishedAt ? formatDateShort(lead.publishedAt) : ""}</p>
                <h3 className="mt-4 text-3xl font-bold leading-[1] tracking-[-0.04em] text-gray-950 transition group-hover:text-ieee-blue sm:text-4xl">{lead.title}</h3>
                {lead.excerpt ? <p className="mt-4 line-clamp-4 text-sm leading-6 text-gray-500">{lead.excerpt}</p> : null}
              </div>
              <div className="mt-8 flex items-center justify-between border-t border-gray-100 pt-4"><span className="font-mono text-[8px] uppercase tracking-[0.15em] text-gray-400">{authorName(lead)} · {lead.readMinutes || 1} min</span><span className="grid h-10 w-10 place-items-center rounded-full border border-gray-200 text-gray-600 transition group-hover:border-ieee-blue group-hover:bg-ieee-blue group-hover:text-white"><ArrowUpRight className="h-4 w-4" /></span></div>
            </div>
          </Link>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-center justify-between border-b border-gray-100 pb-4"><p className="font-pixel text-[10px] text-gray-700">FROM THE ARCHIVE</p><span className="font-mono text-[8px] uppercase tracking-[0.16em] text-gray-400">Recent</span></div>
            <ol>
              {secondary.map((post, index) => (
                <li key={post.id} className="border-b border-gray-100 last:border-b-0">
                  <Link to={`/blog/${post.slug}`} className="group grid grid-cols-[34px_1fr_auto] gap-3 py-5">
                    <span className="font-pixel text-[9px] text-ieee-blue">{String(index + 2).padStart(2, "0")}</span>
                    <span><span className="block font-mono text-[7px] font-semibold uppercase tracking-[0.15em] text-gray-400">{getBlogContentType(post)} · {post.readMinutes || 1} min</span><span className="mt-1.5 block text-lg font-bold leading-snug tracking-[-0.02em] text-gray-900 transition group-hover:text-ieee-blue">{post.title}</span>{post.excerpt ? <span className="mt-2 line-clamp-2 block text-xs leading-5 text-gray-500">{post.excerpt}</span> : null}</span>
                    <ArrowUpRight className="mt-1 h-4 w-4 text-gray-300 transition group-hover:text-ieee-blue" />
                  </Link>
                </li>
              ))}
            </ol>
            <Link to="/blog" className="mt-5 flex items-center justify-between rounded-xl bg-gray-950 px-4 py-3 text-xs font-semibold text-white transition hover:bg-ieee-blue">Open the branch log <ArrowRight className="h-4 w-4" /></Link>
          </div>
        </div>
      </div>
    </section>
  );
}
