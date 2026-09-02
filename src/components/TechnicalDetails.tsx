import React, { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import pkg from "../../package.json";
const { version } = pkg;

export const TechnicalDetails: React.FC = () => {
  const reduceMotion = Boolean(useReducedMotion());
  const [scrolled, setScrolled] = useState(false);

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
        className={`absolute left-7 top-5 z-30 hidden xl:block ${scrolled ? "pointer-events-none" : ""}`}
      >
        <img
          src="/Ieee.svg"
          alt="IEEE SB Logo"
          width={160}
          height={78}
          loading="eager"
          className="h-auto w-40 contrast-125 drop-shadow-[0_1px_0_rgba(255,255,255,0.85)] 2xl:w-44"
        />
      </motion.div>

      {/* Top Right - Sahrdaya Emblem */}
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, x: 16, y: -4 }}
        animate={{ opacity: scrolled ? 0 : 1, x: scrolled ? 8 : 0, y: scrolled ? -8 : 0 }}
        transition={{ delay: reduceMotion || scrolled ? 0 : 0.18, duration: reduceMotion ? 0 : 0.45, ease: [0.22, 1, 0.36, 1] }}
        className={`absolute right-7 top-5 z-30 hidden xl:block text-right ${scrolled ? "pointer-events-none" : ""}`}
      >
        <img
          src="/emblem.png"
          alt="Sahrdaya Logo"
          width={56}
          height={56}
          loading="eager"
          className="h-16 w-16 object-contain contrast-125 drop-shadow-[0_1px_0_rgba(255,255,255,0.9)] 2xl:h-[4.5rem] 2xl:w-[4.5rem]"
        />
      </motion.div>

      {/* Bottom Right - BUILD_VER */}
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: reduceMotion ? 0 : 1.2, duration: reduceMotion ? 0 : 0.8 }}
        className="absolute bottom-6 right-6 z-10 hidden md:block text-right"
      >
        <p className="font-mono text-[10px] text-gray-400">
          BUILD_VER: {version}
        </p>
      </motion.div>

      {/* Bottom Left - Copyright */}
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: reduceMotion ? 0 : 1.2, duration: reduceMotion ? 0 : 0.8 }}
        className="absolute bottom-6 left-6 z-10 hidden md:block"
      >
        <p className="font-mono text-[10px] text-gray-400">
          &copy; 2026 IEEE SAHRDAYA SB
        </p>
      </motion.div>
    </>
  );
};
