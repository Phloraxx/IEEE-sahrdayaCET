'use client';

import React from 'react';
import { motion } from 'framer-motion';
import type { RegistrationStep } from '@/types/registration';
import GoogleLoginButton from './GoogleLoginButton';

export const StepIndicator: React.FC<{
  currentStep: RegistrationStep;
  isPaidEvent: boolean;
}> = ({ currentStep, isPaidEvent }) => {
  const steps: { id: RegistrationStep; label: string }[] = [
    { id: 'auth', label: 'Login' },
    { id: 'form', label: 'Details' },
    ...(isPaidEvent ? [{ id: 'payment' as RegistrationStep, label: 'Payment' }] : []),
    { id: 'success', label: 'Ticket' },
  ];

  const getCurrentIndex = () => steps.findIndex(s => s.id === currentStep);
  const currentIndex = getCurrentIndex();

  return (
    <div className="flex items-center justify-between px-8 sm:px-12 pt-6 pb-8 bg-white/70 backdrop-blur-xl border-b border-gray-100/50 relative">
      <div className="absolute top-[40px] left-[60px] right-[60px] h-[3px] bg-gray-100/80 rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-ieee-blue/90 w-full origin-left relative"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: currentIndex / (steps.length - 1) }}
          transition={{ type: "spring", stiffness: 120, damping: 20 }}
        >
          <motion.div
            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent"
            animate={{ x: ['-100%', '200%'] }}
            transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
          />
        </motion.div>
      </div>

      {steps.map((step, index) => {
        const isActive = step.id === currentStep;
        const isPast = currentIndex > index;

        return (
          <div key={step.id} className="relative z-10 flex flex-col items-center">
            <motion.div
              initial={false}
              animate={{
                backgroundColor: isActive || isPast ? '#00629B' : '#ffffff',
                borderColor: isActive || isPast ? '#00629B' : '#E5E7EB',
                scale: isActive ? 1.2 : 1,
                color: isActive || isPast ? '#ffffff' : '#9CA3AF'
              }}
              className="w-[32px] h-[32px] rounded-full border-[2px] flex items-center justify-center text-[12px] font-semibold shadow-sm transition-all duration-300 z-10"
            >
              {isPast ? (
                <motion.svg
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={3}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </motion.svg>
              ) : (
                <span>{index + 1}</span>
              )}
            </motion.div>
            <motion.span
              animate={{
                y: isActive ? 0 : -2,
                opacity: isActive ? 1 : 0.6
              }}
              className={`absolute -bottom-7 text-[11px] sm:text-[12px] font-medium tracking-wide transition-colors duration-300 whitespace-nowrap ${isActive ? 'text-ieee-blue' : 'text-gray-500'}`}
            >
              {step.label}
            </motion.span>
          </div>
        );
      })}
    </div>
  );
};

export const AuthStep: React.FC<{
  onLogin: () => void;
  isLoading: boolean;
}> = ({ onLogin, isLoading }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 15, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ type: "spring", stiffness: 350, damping: 25 }}
      className="flex flex-col items-center justify-center py-20 px-6 text-center"
    >
      <div className="relative w-32 h-32 mb-10 group cursor-default">
        <motion.div
          animate={{ scale: [1, 1.05, 1], opacity: [0.3, 0.5, 0.3] }}
          transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
          className="absolute inset-0 bg-ieee-blue/10 rounded-[40px] blur-xl"
        />
        <div className="absolute inset-0 bg-gradient-to-tr from-ieee-blue/20 to-ieee-light-blue/20 rounded-[36px] rotate-6 group-hover:rotate-12 transition-all duration-700 ease-out backdrop-blur-3xl" />
        <div className="absolute inset-0 bg-white shadow-[0_8px_30px_rgb(0,0,0,0.08)] rounded-[32px] border border-white/60 flex items-center justify-center rotate-0 group-hover:-rotate-6 transition-all duration-700 ease-out z-10 overflow-hidden backdrop-blur-xl">
          <div className="absolute inset-0 bg-gradient-to-br from-white/90 to-white/40 z-0" />
          <svg className="w-14 h-14 text-ieee-blue z-10 relative drop-shadow-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
          </svg>
        </div>
      </div>

      <h3 className="text-[26px] font-semibold tracking-[-0.015em] text-gray-900 mb-3">
        Join the Action
      </h3>
      <p className="text-[15px] text-gray-500 mb-10 max-w-[280px] leading-relaxed font-normal">
        Sign in with your Google account to secure your spot for this event.
      </p>

      <GoogleLoginButton
        variant="full-width"
        className="max-w-[320px]"
        onLogin={onLogin}
      />
      <p className="mt-8 text-[12px] text-gray-400 font-medium tracking-wide">
        Secured by IEEE Student Branch
      </p>
    </motion.div>
  );
};
