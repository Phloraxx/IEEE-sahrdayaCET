'use client';

import { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';

interface PaymentTimerProps {
  expiresAt: number;
  onExpire: () => void;
}

export function PaymentTimer({ expiresAt, onExpire }: PaymentTimerProps) {
  const [timeLeft, setTimeLeft] = useState<number>(0);

  useEffect(() => {
    const updateTimer = () => {
      const now = Date.now();
      const remaining = Math.max(0, Math.floor((expiresAt - now) / 1000));
      setTimeLeft(remaining);

      if (remaining <= 0) {
        onExpire();
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);

    return () => clearInterval(interval);
  }, [expiresAt, onExpire]);

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const isWarning = timeLeft <= 60;

  return (
    <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[13px] font-bold tracking-wide border ${
      isWarning
        ? 'bg-red-500/10 text-red-200 border-red-500/20'
        : 'bg-white/10 text-white border-white/20'
    }`}>
      <Clock className={`w-3.5 h-3.5 ${isWarning ? 'animate-pulse text-red-400' : 'text-white/80'}`} />
      <span className="font-mono tabular-nums leading-none mt-0.5">
        {minutes.toString().padStart(2, '0')}:{seconds.toString().padStart(2, '0')}
      </span>
    </div>
  );
}
