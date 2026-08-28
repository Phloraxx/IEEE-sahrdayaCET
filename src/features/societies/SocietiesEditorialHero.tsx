import { useRef } from "react";
import { motion, useReducedMotion, useScroll, useTransform, type MotionValue } from "framer-motion";

const PHOTO_WORKSHOP = "/images/wie/witech-feature.webp";
const PHOTO_COMMUNITY = "/images/wie/wie-community.webp";
const PHOTO_CAMPUS = "/AGM.webp";

export function SocietiesEditorialHero({ communityCount }: { communityCount: number }) {
  const storyRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: storyRef,
    offset: ["start start", "end end"],
  });

  const titleOpacity = useTransform(scrollYProgress, [0, 0.34, 0.62], [1, 1, 0]);
  const whereX = useTransform(scrollYProgress, [0, 0.62], ["0vw", "-15vw"]);
  const ideasX = useTransform(scrollYProgress, [0, 0.62], ["0vw", "11vw"]);
  const leaveX = useTransform(scrollYProgress, [0, 0.62], ["0vw", "-8vw"]);
  const classroomX = useTransform(scrollYProgress, [0, 0.62], ["0vw", "12vw"]);
  const classroomY = useTransform(scrollYProgress, [0, 0.62], ["0vh", "-6vh"]);

  const workshopX = useTransform(scrollYProgress, [0, 0.62], ["0vw", "24vw"]);
  const workshopY = useTransform(scrollYProgress, [0, 0.62], ["0vh", "21vh"]);
  const workshopScale = useTransform(scrollYProgress, [0, 0.52, 0.72], [0.78, 1.45, 1.12]);
  const communityX = useTransform(scrollYProgress, [0, 0.62], ["0vw", "-22vw"]);
  const communityY = useTransform(scrollYProgress, [0, 0.62], ["0vh", "-16vh"]);
  const communityScale = useTransform(scrollYProgress, [0, 0.58], [0.92, 1.22]);
  const campusY = useTransform(scrollYProgress, [0, 0.62], ["0vh", "14vh"]);
  const campusScale = useTransform(scrollYProgress, [0, 0.64], [0.72, 1.12]);

  const verbsOpacity = useTransform(scrollYProgress, [0.28, 0.42, 0.64, 0.76], [0, 1, 1, 0]);
  const buildX = useTransform(scrollYProgress, [0.32, 0.68], ["-8vw", "7vw"]);
  const questionX = useTransform(scrollYProgress, [0.32, 0.68], ["12vw", "-6vw"]);
  const competeY = useTransform(scrollYProgress, [0.32, 0.68], ["8vh", "-5vh"]);
  const leadY = useTransform(scrollYProgress, [0.32, 0.68], ["-5vh", "7vh"]);

  const finalOpacity = useTransform(scrollYProgress, [0.72, 0.86, 1], [0, 1, 1]);
  const finalY = useTransform(scrollYProgress, [0.72, 0.9], ["5vh", "0vh"]);
  const imageFade = useTransform(scrollYProgress, [0.66, 0.86], [1, 0.18]);

  const motionStyle = <T extends string | number>(animated: MotionValue<T>, fallback: T): MotionValue<T> | T => reduceMotion ? fallback : animated;

  return (
    <>
      <div className="mt-8 lg:hidden" data-testid="society-editorial-mobile">
        <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.2em] text-ieee-blue">IEEE Sahrdaya / Beyond the classroom</p>
        <h1 className="mt-5 text-[2.7rem] font-semibold leading-[0.92] tracking-[-0.06em] text-slate-950 sm:text-6xl">
          Where ideas leave the classroom.
        </h1>
        <div className="relative mt-8 h-[330px] overflow-hidden border-y border-slate-200 bg-slate-50 sm:h-[420px]">
          <img src={PHOTO_WORKSHOP} alt="IEEE Sahrdaya workshop in a computer lab" className="absolute left-4 top-6 h-36 w-[58%] object-cover sm:h-48" />
          <img src={PHOTO_COMMUNITY} alt="IEEE Sahrdaya community session" className="absolute bottom-7 right-4 h-44 w-[64%] object-cover sm:h-56" />
          <div className="absolute bottom-4 left-4 max-w-[42%] font-mono text-[8px] font-semibold uppercase leading-4 tracking-[0.17em] text-slate-500">
            Build.<br />Question.<br />Compete.<br />Lead.
          </div>
        </div>
        <div className="mt-6 flex items-end justify-between gap-6 border-b border-slate-200 pb-6 font-mono text-[8px] font-semibold uppercase tracking-[0.17em] text-slate-400">
          <span>{String(communityCount).padStart(2, "0")} communities · one student branch</span>
          <a href="#society-directory" className="text-slate-600">Explore ↓</a>
        </div>
      </div>

      <div ref={storyRef} data-testid="society-editorial-story" className="relative mt-8 hidden h-[235vh] lg:block">
        <div className="sticky top-20 h-[calc(100vh-5rem)] min-h-[650px] py-5">
          <div
            className="relative h-full overflow-hidden bg-slate-950 bg-cover bg-center p-5 xl:p-7"
            style={{ backgroundImage: `linear-gradient(rgba(2,6,23,.88), rgba(2,6,23,.9)), url(${PHOTO_CAMPUS})` }}
          >
            <div className="relative h-full overflow-hidden rounded-[5px] bg-[#fbfbf8] shadow-[0_30px_90px_rgba(0,0,0,.35)]">
              <div className="absolute inset-x-0 top-0 z-50 flex h-14 items-center justify-between border-b border-slate-200 px-5 font-mono text-[8px] font-semibold uppercase tracking-[0.18em] text-slate-500 xl:px-7">
                <span>IEEE Sahrdaya / Societies</span>
                <span>Scroll to move through the story ↓</span>
              </div>

              <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-[0.42]" style={{ backgroundImage: "linear-gradient(rgba(15,23,42,.055) 1px, transparent 1px), linear-gradient(90deg, rgba(15,23,42,.055) 1px, transparent 1px)", backgroundSize: "56px 56px" }} />

              <motion.div style={{ opacity: motionStyle(imageFade, 1) }} className="absolute inset-0 z-10">
                <motion.figure
                  style={{ x: motionStyle(workshopX, "0vw"), y: motionStyle(workshopY, "0vh"), scale: motionStyle(workshopScale, 1) }}
                  className="absolute left-[6%] top-[18%] w-[17%] overflow-hidden bg-slate-100 shadow-sm"
                >
                  <img src={PHOTO_WORKSHOP} alt="IEEE Sahrdaya workshop in a computer lab" className="aspect-[4/3] w-full object-cover" />
                </motion.figure>

                <motion.figure
                  style={{ x: motionStyle(communityX, "0vw"), y: motionStyle(communityY, "0vh"), scale: motionStyle(communityScale, 1) }}
                  className="absolute bottom-[8%] right-[3%] w-[31%] overflow-hidden bg-slate-100 shadow-sm"
                >
                  <img src={PHOTO_COMMUNITY} alt="IEEE Sahrdaya community session" className="aspect-[16/10] w-full object-cover" />
                </motion.figure>

                <motion.figure
                  style={{ y: motionStyle(campusY, "0vh"), scale: motionStyle(campusScale, 1) }}
                  className="absolute right-[10%] top-[16%] w-[14%] overflow-hidden bg-slate-100 shadow-sm"
                >
                  <img src={PHOTO_CAMPUS} alt="Sahrdaya campus" className="aspect-[4/3] w-full object-cover" />
                </motion.figure>
              </motion.div>

              <motion.div style={{ opacity: motionStyle(titleOpacity, 1) }} className="absolute inset-0 z-20 flex items-center justify-center px-[9%] pt-10">
                <h1 className="w-full text-center text-[clamp(4.1rem,7.7vw,8.8rem)] font-semibold uppercase leading-[0.78] tracking-[-0.075em] text-slate-950">
                  <motion.div style={{ x: motionStyle(whereX, "0vw") }} className="text-left pl-[11%]">Where</motion.div>
                  <motion.div style={{ x: motionStyle(ideasX, "0vw") }} className="text-right pr-[8%]">Ideas</motion.div>
                  <motion.div style={{ x: motionStyle(leaveX, "0vw") }} className="text-left pl-[20%]">Leave the</motion.div>
                  <motion.div style={{ x: motionStyle(classroomX, "0vw"), y: motionStyle(classroomY, "0vh") }} className="text-right">Classroom</motion.div>
                </h1>
              </motion.div>

              <motion.div data-testid="society-editorial-verbs" style={{ opacity: motionStyle(verbsOpacity, 0) }} className="pointer-events-none absolute inset-0 z-30 font-mono text-[clamp(2.5rem,5.2vw,6.2rem)] font-black uppercase leading-none tracking-[-0.06em] text-slate-950">
                <motion.span style={{ x: motionStyle(buildX, "0vw") }} className="absolute left-[8%] top-[24%]">Build.</motion.span>
                <motion.span style={{ x: motionStyle(questionX, "0vw") }} className="absolute right-[7%] top-[37%]">Question.</motion.span>
                <motion.span style={{ y: motionStyle(competeY, "0vh") }} className="absolute left-[21%] bottom-[20%]">Compete.</motion.span>
                <motion.span style={{ y: motionStyle(leadY, "0vh") }} className="absolute right-[18%] bottom-[11%]">Lead.</motion.span>
              </motion.div>

              <div className="absolute bottom-5 left-5 z-40 max-w-[260px] font-mono text-[8px] font-semibold uppercase leading-4 tracking-[0.16em] text-slate-500 xl:left-7">
                <span className="block text-slate-900">Ideas become practice here.</span>
                <span className="mt-2 block">Build · test · question · present · lead</span>
              </div>

              <motion.div data-testid="society-editorial-final" style={{ opacity: motionStyle(finalOpacity, 0), y: motionStyle(finalY, "0vh") }} className="absolute inset-0 z-40 flex items-center justify-center bg-[#fbfbf8]/95 px-[10%] backdrop-blur-[1px]">
                <div className="w-full">
                  <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.2em] text-ieee-blue">IEEE Sahrdaya / The collective</p>
                  <h2 className="mt-5 text-[clamp(3.5rem,6vw,7rem)] font-semibold uppercase leading-[0.84] tracking-[-0.07em] text-slate-950">
                    <span className="block whitespace-nowrap">{communityCount} communities.</span>
                    <span className="block whitespace-nowrap">One student branch.</span>
                  </h2>
                  <div className="mt-8 flex items-end justify-between gap-8 border-t border-slate-300 pt-5">
                    <p className="max-w-md text-base leading-6 text-slate-600">Different fields. Shared curiosity. One place to build beyond the syllabus.</p>
                    <a href="#society-directory" className="font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-950">Explore the directory ↓</a>
                  </div>
                </div>
              </motion.div>

              {!reduceMotion && <motion.div aria-hidden="true" style={{ scaleX: scrollYProgress }} className="absolute inset-x-0 bottom-0 z-50 h-[2px] origin-left bg-ieee-blue" />}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
