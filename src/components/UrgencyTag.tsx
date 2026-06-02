'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Zap, Clock, Flame } from 'lucide-react';

type UrgencyType = 'early-bird' | 'last-chance' | 'hot-event';

interface UrgencyTagProps {
  type: UrgencyType;
}

export function UrgencyTag({ type }: UrgencyTagProps) {
  const config: Record<UrgencyType, { label: string; Icon: React.ReactNode; colors: string }> = {
    'early-bird': {
      label: 'Early Bird',
      Icon: <Clock className="w-3 h-3" />,
      colors: 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white',
    },
    'last-chance': {
      label: 'Last Chance',
      Icon: <Zap className="w-3 h-3" />,
      colors: 'bg-gradient-to-r from-red-500 to-orange-500 text-white',
    },
    'hot-event': {
      label: 'Hot Event',
      Icon: <Flame className="w-3 h-3" />,
      colors: 'bg-gradient-to-r from-pink-500 to-rose-500 text-white',
    },
  };

  const { label, Icon, colors } = config[type];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold ${colors} shadow-lg -rotate-3`}
    >
      {Icon}
      <span>{label}</span>
      <motion.div
        animate={{ opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 2, repeat: Infinity }}
        className="ml-1 w-1.5 h-1.5 rounded-full bg-white/60"
      />
    </motion.div>
  );
}
