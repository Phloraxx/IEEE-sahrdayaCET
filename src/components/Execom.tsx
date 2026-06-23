import React from "react";
import { motion } from "framer-motion";
import { Users } from "lucide-react";
export const Execom: React.FC = () => {
  return (
    <section
      className="bg-white py-20 md:py-32 relative overflow-hidden"
      id="execom"
    >
      <div className="absolute top-0 left-0 w-full h-px bg-gray-200" />
      <div className="absolute -top-20 -right-20 w-64 h-64 bg-ieee-blue/5 rounded-full blur-3xl" />
      <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-ieee-blue/5 rounded-full blur-3xl" />

      <div className="container mx-auto px-4 relative z-10">
        <div className="mb-16 md:mb-20">
          <div className="flex items-center space-x-2 mb-6">
            <Users className="w-5 h-5 text-ieee-blue" />
            <h3 className="font-pixel text-lg md:text-xl text-gray-800">
              THE EXECOM
            </h3>
            <div className="h-px grow bg-gray-300 ml-4" />
          </div>

          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8 }}
            >
              <h2 className="text-3xl md:text-5xl lg:text-6xl font-bold text-gray-900 tracking-tight leading-[1.1]">
                Meet the people
                <br />
                <span className="text-ieee-blue">behind the vision.</span>
              </h2>
            </motion.div>

            <motion.p
              className="text-sm md:text-base text-gray-500 max-w-sm font-mono"
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.3, duration: 0.8 }}
            >
              The executive committee driving innovation, collaboration, and
              excellence at IEEE Sahrdaya SB.
            </motion.p>
          </div>
        </div>
      </div>
    </section>
  );
};
