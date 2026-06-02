import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '404 — Page Not Found',
};

export default function NotFound() {
  return (
    <div className="relative min-h-screen bg-white text-gray-900 font-sans selection:bg-ieee-blue/20 overflow-hidden">
      {/* Background Grid */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#e5e7eb_1px,transparent_1px),linear-gradient(to_bottom,#e5e7eb_1px,transparent_1px)] bg-[size:40px_40px]" />
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none bg-repeat"
          style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }}
        />
      </div>

      {/* Content */}
      <main className="relative z-10 flex flex-col items-center justify-center min-h-screen px-6 text-center">
        <span
          className="text-[12rem] sm:text-[16rem] font-bold leading-none select-none"
          style={{
            background: 'linear-gradient(135deg, #00629B 0%, #004276 50%, #002D52 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
          role="presentation"
          aria-hidden="true"
        >
          404
        </span>
        <h1 className="text-2xl sm:text-3xl font-semibold text-gray-800 -mt-4 mb-3">
          Page Not Found
        </h1>
        <p className="text-gray-500 max-w-md mb-10 text-base sm:text-lg">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-lg bg-[#00629B] hover:bg-[#004D7A] active:bg-[#003D63] text-white px-8 py-3.5 text-base font-semibold transition-all duration-200 shadow-lg hover:shadow-xl hover:-translate-y-0.5"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M19 12H5m7-7-7 7 7 7"/>
          </svg>
          Back to Home
        </Link>
      </main>
    </div>
  );
}
