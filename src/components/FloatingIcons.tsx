'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Monitor, Zap, Users, Bot, BarChart3 } from 'lucide-react';
import { FloatingIconProps } from '@/types';

const icons: FloatingIconProps[] = [
    { icon: <Monitor size={28} />, label: 'CS', x: '15%', y: '25%', delay: 0 },
    { icon: <Zap size={28} />, label: 'PES', x: '85%', y: '30%', delay: 1 },
    { icon: <Bot size={28} />, label: 'RAS', x: '20%', y: '75%', delay: 2 },
    { icon: <Users size={28} />, label: 'WIE', x: '80%', y: '70%', delay: 1.5 },
    { icon: <BarChart3 size={28} />, label: 'IAS', x: '50%', y: '85%', delay: 0.5 },
];

export const FloatingIcons: React.FC = () => {
    return (
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
            {icons.map((item, index) => (
                <motion.div
                    key={index}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ 
                        opacity: 0.4, 
                        scale: 1,
                        y: [0, -15, 0],
                    }}
                    transition={{
                        opacity: { duration: 1, delay: 0.5 + index * 0.2 },
                        scale: { duration: 1, delay: 0.5 + index * 0.2 },
                        y: {
                            duration: 4 + index,
                            repeat: Infinity,
                            ease: "easeInOut",
                            delay: item.delay
                        }
                    }}
                    style={{ left: item.x, top: item.y }}
                    className="absolute flex flex-col items-center text-gray-400"
                >
                    <div className="p-3 bg-white/50 backdrop-blur-sm border border-gray-200 rounded-xl shadow-sm mb-1">
                        {item.icon}
                    </div>
                    <span className="font-mono text-[10px] tracking-widest">{item.label}</span>
                </motion.div>
            ))}
        </div>
    );
};