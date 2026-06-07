'use client'

import { useState } from 'react'

export default function LoginPage() {
  const [isLoading, setIsLoading] = useState(false)

  const handleGoogleSignIn = async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/auth/init')
      const data = await res.json()
      if (data.authURL) {
        window.location.href = data.authURL
      }
    } catch {
      setIsLoading(false)
    }
  }

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
      <main className="relative z-10 flex items-center justify-center min-h-screen px-4">
        <div className="w-full max-w-sm">
          {/* Card */}
          <div className="relative bg-white border border-gray-200 rounded-xl shadow-2xl overflow-hidden">
            {/* Top accent */}
            <div className="h-1 bg-gradient-to-r from-ieee-blue via-ieee-light-blue to-ieee-blue" />

            <div className="px-8 pt-8 pb-6 text-center">
              {/* Logo / Title */}
              <div className="mb-2">
                <h1 className="font-pixel text-lg text-gray-900 tracking-tight">
                  SIGN IN
                </h1>
              </div>

              <div className="w-10 h-0.5 bg-ieee-blue mx-auto rounded-full mb-4" />

              <p className="text-xs text-gray-500 mb-8 font-sans leading-relaxed">
                Sign in to access society management and event tools.
              </p>

              {/* Google Sign-in Button */}
              <button
                onClick={handleGoogleSignIn}
                disabled={isLoading}
                className="w-full bg-gray-950 hover:bg-ieee-blue text-white font-mono text-xs tracking-wider uppercase py-3.5 px-6 rounded-lg transition-all duration-300 flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow-md"
              >
                {isLoading ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <svg className="w-4 h-4" viewBox="0 0 24 24">
                      <path fill="#fff" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path fill="#fff" fillOpacity={0.7} d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="#fff" fillOpacity={0.5} d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                      <path fill="#fff" fillOpacity={0.8} d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                    </svg>
                    Continue with Google
                  </>
                )}
              </button>

              {/* Divider */}
              <div className="flex items-center gap-3 my-5">
                <div className="h-px flex-grow bg-gray-200" />
                <span className="font-mono text-[9px] tracking-[0.3em] text-gray-400 uppercase">IEEE Sahrdaya</span>
                <div className="h-px flex-grow bg-gray-200" />
              </div>

              {/* Privacy note */}
              <p className="text-[10px] text-gray-400 font-mono tracking-wider">
                Secured with OAuth 2.0
              </p>
            </div>
          </div>

          {/* Error message from URL */}
          {typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('error') && (
            <p className="mt-4 text-xs text-red-500 text-center font-mono">
              {new URLSearchParams(window.location.search).get('error') === 'state_mismatch'
                ? 'Session mismatch. Please try again.'
                : new URLSearchParams(window.location.search).get('error') === 'auth_failed'
                ? 'Authentication failed. Please try again.'
                : 'Invalid request. Please try again.'}
            </p>
          )}
        </div>
      </main>
    </div>
  )
}
