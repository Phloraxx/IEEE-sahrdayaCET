import React from "react";
import { motion } from "framer-motion";
import pkg from "../../package.json";
const { version } = pkg;

export const TechnicalDetails: React.FC = () => {
  return (
    <>
      {/* Top Left - IEEE Logo */}
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 1, duration: 0.8 }}
        className="absolute left-5 top-4 z-10 hidden xl:block"
      >
        <img
          src="/Ieee.svg"
          alt="IEEE SB Logo"
          width={160}
          height={78}
          loading="eager"
          className="h-auto w-36 opacity-65 2xl:w-40"
        />
      </motion.div>

      {/* Top Right - Sahrdaya Emblem */}
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 1, duration: 0.8 }}
        className="absolute right-5 top-4 z-10 hidden xl:block text-right"
      >
        <img
          src="/emblem.png"
          alt="Sahrdaya Logo"
          width={56}
          height={56}
          loading="eager"
          className="h-14 w-14 object-contain opacity-65 2xl:h-16 2xl:w-16"
        />
      </motion.div>

      {/* Bottom Right - BUILD_VER */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.2, duration: 0.8 }}
        className="absolute bottom-6 right-6 z-10 hidden md:block text-right"
      >
        <p className="font-mono text-[10px] text-gray-400">
          BUILD_VER: {version}
        </p>
      </motion.div>

      {/* Bottom Left - Copyright */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.2, duration: 0.8 }}
        className="absolute bottom-6 left-6 z-10 hidden md:block"
      >
        <p className="font-mono text-[10px] text-gray-400">
          &copy; 2026 IEEE SAHRDAYA SB
        </p>
      </motion.div>
    </>
  );
};
