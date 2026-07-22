import { motion } from "framer-motion";
import { useNavigate } from "react-router";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { GridBackground } from "@/components/GridBackground";
import { FloatingIcons } from "@/components/FloatingIcons";
import { TechnicalDetails } from "@/components/TechnicalDetails";
import type { Society } from "@/types";

interface SocietiesClientProps {
  societies: Society[];
}

export default function SocietiesClient({ societies }: SocietiesClientProps) {
  const navigate = useNavigate();

  return (
    <div className="relative min-h-screen w-full bg-white font-sans text-gray-900">
      <div className="pointer-events-none fixed inset-0 z-0">
        <GridBackground />
        <FloatingIcons />
        <TechnicalDetails />
      </div>

      <Navbar />

      <main className="relative z-10 px-6 pb-20 pt-32">
        <div className="mx-auto max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="mb-16 text-center"
          >
            <h1
              className="mb-4 font-pixel text-4xl text-ieee-blue md:text-6xl lg:text-7xl"
              style={{ textShadow: "4px 4px 0px rgba(0,0,0,0.1)" }}
            >
              SELECT YOUR SOCIETY
            </h1>
            <div className="mt-8 flex items-center justify-center gap-6">
              <div className="hidden h-px w-32 bg-gray-400 sm:block" />
              <p className="text-xs font-bold tracking-[0.4em] text-gray-600">CHOOSE YOUR PATH</p>
              <div className="hidden h-px w-32 bg-gray-400 sm:block" />
            </div>
          </motion.div>

          {societies.length === 0 ? (
            <p className="py-12 text-center text-gray-500">No societies found.</p>
          ) : (
            <motion.div
              className="grid grid-cols-2 gap-4 md:grid-cols-3 md:gap-6 lg:grid-cols-4 xl:grid-cols-5"
              initial="hidden"
              animate="visible"
              variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.05 } } }}
            >
              {societies.map((society) => (
                <motion.button
                  type="button"
                  key={society.id}
                  variants={{
                    hidden: { opacity: 0, scale: 0.8, y: 20 },
                    visible: {
                      opacity: 1,
                      scale: 1,
                      y: 0,
                      transition: { type: "spring", stiffness: 100, damping: 15 },
                    },
                  }}
                  whileHover={{ scale: 1.05, y: -8, transition: { duration: 0.2 } }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => navigate(`/societies/${society.slug.toLowerCase()}`)}
                  className="group relative cursor-pointer text-left"
                  aria-label={`View ${society.name}`}
                >
                  <div className="relative overflow-hidden rounded-xl border-2 border-gray-200 bg-white shadow-lg transition-all duration-300 hover:border-ieee-blue hover:shadow-2xl">
                    <div className="absolute inset-0 z-0 bg-gradient-to-br from-ieee-blue/0 to-purple-600/0 transition-all duration-300 group-hover:from-ieee-blue/10 group-hover:to-purple-600/10" />
                    <div className="relative flex aspect-square items-center justify-center p-6">
                      <motion.div
                        className="relative flex h-full w-full items-center justify-center"
                        whileHover={{ rotate: [0, -5, 5, 0] }}
                        transition={{ duration: 0.5 }}
                      >
                        {society.logoUrl ? (
                          <img
                            src={society.logoUrl}
                            alt={`${society.name} logo`}
                            className="h-full w-full object-contain drop-shadow-lg"
                          />
                        ) : (
                          <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-gray-100">
                            <span className="text-2xl font-bold text-gray-400">{society.name.charAt(0)}</span>
                          </div>
                        )}
                      </motion.div>
                      <div className="absolute inset-0 bg-gradient-to-br from-ieee-blue/20 to-purple-600/20 opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-100" />
                    </div>
                    <div className="relative bg-gradient-to-b from-transparent to-gray-50/50 p-4 pt-2">
                      <h2 className="line-clamp-2 text-center text-xs font-bold text-gray-800 transition-colors group-hover:text-ieee-blue md:text-sm">
                        {society.name}
                      </h2>
                    </div>
                    <motion.div
                      className="absolute right-2 top-2 h-3 w-3 rounded-full bg-ieee-blue opacity-0 group-hover:opacity-100"
                      animate={{ scale: [1, 1.2, 1] }}
                      transition={{ repeat: Infinity, duration: 1.5 }}
                    />
                  </div>
                </motion.button>
              ))}
            </motion.div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
