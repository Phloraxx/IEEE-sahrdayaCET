import { useState } from "react";
import { motion } from "framer-motion";
import type { Society } from "@/types";

// Helper to validate and fix logo URLs
const getValidLogoUrl = (logoUrl: string | undefined | null): string | null => {
  if (!logoUrl) return null;

  // Check if it's a valid URL (starts with / or http)
  if (
    logoUrl.startsWith("/") ||
    logoUrl.startsWith("http://") ||
    logoUrl.startsWith("https://")
  ) {
    return logoUrl;
  }

  // Invalid URL pattern
  return null;
};

const LogoItem: React.FC<{ society: Society }> = ({ society }) => {
  const [imgError, setImgError] = useState(false);
  const validLogoUrl = getValidLogoUrl(society.logoUrl);

  if (!validLogoUrl || imgError) {
    return (
      <div className="shrink-0 flex items-center justify-center group mx-6 md:mx-10">
        <div className="relative flex items-center justify-center h-10 md:h-12 w-auto transition-all duration-300 group-hover:scale-110">
          <div className="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center text-gray-500 text-xs font-bold">
            {society.name?.charAt(0) || "?"}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="shrink-0 flex items-center justify-center group mx-6 md:mx-10">
      <div className="relative h-10 md:h-12 w-14 md:w-16 transition-all duration-300 group-hover:scale-110">
        <img
          loading="lazy"
          src={validLogoUrl!}
          alt={society.name}
          onError={() => setImgError(true)}
          className="absolute inset-0 w-full h-full object-contain opacity-40 group-hover:opacity-90 transition-opacity duration-500 grayscale group-hover:grayscale-0"
          draggable={false}
        />
      </div>
    </div>
  );
};

interface SocietyStripProps {
  societies: Society[];
}

export const SocietyStrip: React.FC<SocietyStripProps> = ({ societies }) => {
  if (!societies || societies.length === 0) return null

  // Duplicate the list for seamless loop (4x for safety on wide screens)
  const repeated = [...societies, ...societies, ...societies, ...societies];

  return (
    <div className="relative mt-12 md:mt-16">
      {/* Label */}
      <div className="flex items-center gap-3 mb-5 px-4 md:px-0">
        <div className="font-mono text-[10px] tracking-[0.3em] text-gray-400 uppercase whitespace-nowrap">
          OUR SOCIETIES
        </div>
        <div className="h-px grow bg-gray-200" />
        <div className="font-mono text-[10px] tracking-[0.2em] text-gray-300">
          {societies.length}
        </div>
      </div>

      {/* Marquee container */}
      <div className="relative overflow-hidden py-4">
        {/* Fade edges */}
        <div className="absolute left-0 top-0 bottom-0 w-16 md:w-32 bg-linear-to-r from-white to-transparent z-10 pointer-events-none" />
        <div className="absolute right-0 top-0 bottom-0 w-16 md:w-32 bg-linear-to-l from-white to-transparent z-10 pointer-events-none" />

        {/* Scrolling track */}
        <motion.div
          className="flex items-center w-max"
          animate={{ x: ["0%", "-25%"] }}
          transition={{
            x: {
              repeat: Infinity,
              repeatType: "loop",
              duration: 40,
              ease: "linear",
            },
          }}
        >
          {repeated.map((society, i) => (
            <LogoItem key={`${society.id}-${i}`} society={society} />
          ))}
        </motion.div>
      </div>

      {/* Subtle bottom border */}
      <div className="h-px bg-linear-to-r from-transparent via-gray-200 to-transparent" />
    </div>
  );
};
