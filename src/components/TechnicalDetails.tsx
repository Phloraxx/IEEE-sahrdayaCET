import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useHydratedReducedMotion } from "@/lib/use-hydrated-reduced-motion";

/**
 * The build badge renders on every deployment - dev, staging and production -
 * so anyone can confirm which version the site is running. __BUILD_INFO__ is
 * baked at build time: package version + git short SHA, or the build
 * timestamp when git is unavailable in the build container.
 */
const showBuildVersion = true;

export const TechnicalDetails: React.FC = () => {
  const reduceMotion = useHydratedReducedMotion();
  const [scrolled, setScrolled] = useState(false);
  const year = new Date().getFullYear();

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 120);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  return (
    <>
      {/* Top Left - IEEE Logo */}
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, x: -16, y: -4 }}
        animate={{ opacity: scrolled ? 0 : 1, x: scrolled ? -8 : 0, y: scrolled ? -8 : 0 }}
        transition={{ delay: reduceMotion || scrolled ? 0 : 0.18, duration: reduceMotion ? 0 : 0.45, ease: [0.22, 1, 0.36, 1] }}
        className={`absolute left-4 top-4 z-30 md:hidden lg:left-7 lg:top-5 lg:block ${scrolled ? "pointer-events-none" : ""}`}
      >
        <img
          src="/Ieee.svg"
          alt="IEEE SB Logo"
          width={112}
          height={33}
          loading="eager"
          className="h-auto w-20 contrast-125 drop-shadow-[0_1px_0_rgba(255,255,255,0.85)] md:w-24 xl:w-28 2xl:w-32"
        />
      </motion.div>

      {/* Top Right - Sahrdaya Emblem */}
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, x: 16, y: -4 }}
        animate={{ opacity: scrolled ? 0 : 1, x: scrolled ? 8 : 0, y: scrolled ? -8 : 0 }}
        transition={{ delay: reduceMotion || scrolled ? 0 : 0.18, duration: reduceMotion ? 0 : 0.45, ease: [0.22, 1, 0.36, 1] }}
        className={`absolute right-4 top-4 z-30 text-right md:hidden lg:right-7 lg:top-3.5 lg:block 2xl:top-3 ${scrolled ? "pointer-events-none" : ""}`}
      >
        <img
          src="/emblem.png"
          alt="Sahrdaya Logo"
          width={48}
          height={48}
          loading="eager"
          className="h-9 w-9 object-contain contrast-125 drop-shadow-[0_1px_0_rgba(255,255,255,0.9)] md:h-10 md:w-10 xl:h-12 xl:w-12 2xl:h-14 2xl:w-14"
        />
      </motion.div>

      {/* Bottom Right - BUILD_VER (shown in every environment by design) */}
      {showBuildVersion ? (
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: reduceMotion ? 0 : 1.2, duration: reduceMotion ? 0 : 0.8 }}
          className="absolute bottom-24 right-4 z-10 text-right md:bottom-6 md:right-6"
        >
          <p className="font-mono text-[9px] text-gray-600 md:text-[10px]">
            BUILD_VER: {__BUILD_INFO__.display}
          </p>
        </motion.div>
      ) : null}

      {/* Bottom Left - Copyright */}
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: reduceMotion ? 0 : 1.2, duration: reduceMotion ? 0 : 0.8 }}
        className="absolute bottom-24 left-4 z-10 md:bottom-6 md:left-6"
      >
        <p className="font-mono text-[9px] text-gray-600 md:text-[10px]">
          &copy; {year} IEEE SAHRDAYA SB
        </p>
      </motion.div>
    </>
  );
};
