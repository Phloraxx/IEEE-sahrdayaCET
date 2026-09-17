import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import GoogleLoginButton from './GoogleLoginButton';
import { MASCOT_BODY_PEEK, MASCOT_HEAD, PixelGrid } from './mascot';


interface LoginModalProps {
    isOpen: boolean;
    onClose: () => void;
    message?: string;
}

const PIXEL = 5;

export default function LoginModal({ isOpen, onClose, message }: LoginModalProps) {
    const dialogRef = useRef<HTMLDivElement>(null);

    // Focus trap and scroll lock
    useEffect(() => {
      if (!isOpen) return;
      const dialog = dialogRef.current;
      const focusFirst = () => {
        const activeDialog = dialogRef.current;
        if (!activeDialog) return;
        const focusable = activeDialog.querySelector<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable) {
          focusable.focus();
        } else {
          activeDialog.focus();
        }
      };

      const previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      focusFirst();

      const handleFocusIn = (event: FocusEvent) => {
        if (dialog && !dialog.contains(event.target as Node)) focusFirst();
      };
      document.addEventListener('focusin', handleFocusIn);

      return () => {
        document.body.style.overflow = previousOverflow;
        document.removeEventListener('focusin', handleFocusIn);
      };
    }, [isOpen]);

    if (!isOpen) return null;

    return (
        <div
            ref={dialogRef}
            className="fixed inset-0 z-[130] flex items-center justify-center bg-black/50 px-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] pt-[calc(1rem+env(safe-area-inset-top,0px))] backdrop-blur-xs"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
            aria-label="Sign in"
            onKeyDown={(e) => {
                if (e.key === 'Escape') onClose();
                if (e.key === 'Tab') {
                    const dialog = dialogRef.current;
                    if (!dialog) return;
                    const focusable = dialog.querySelectorAll<HTMLElement>(
                        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
                    );
                    const first = focusable[0] ?? null;
                    const last = focusable[focusable.length - 1] ?? null;
                    if (!first || !last) return;
                    if (e.shiftKey) {
                        if (document.activeElement === first) {
                            e.preventDefault();
                            last.focus();
                        }
                    } else {
                        if (document.activeElement === last) {
                            e.preventDefault();
                            first.focus();
                        }
                    }
                }
            }}
            tabIndex={-1}
        >
            <div
                className="relative max-h-[calc(100dvh-2rem-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px))] w-full max-w-sm overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Top accent */}
                <div className="h-1 bg-linear-to-r from-ieee-blue via-ieee-light-blue to-ieee-blue" />

                {/* Close button */}
                <button
                    onClick={onClose}
                    aria-label="Close sign in dialog"
                    className="absolute right-4 top-4 z-10 grid h-11 w-11 place-items-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-900"
                >
                    <X size={18} />
                </button>

                {/* Content */}
                <div className="px-8 pt-8 pb-6 text-center relative">
                    {/* Mascot peeking from the top-left */}
                    <div
                        className="absolute -top-1 left-6"
                        style={{ imageRendering: 'pixelated', filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.1))' }}
                    >
                        <PixelGrid grid={MASCOT_HEAD} size={PIXEL} />
                        <PixelGrid grid={MASCOT_BODY_PEEK} size={PIXEL} />
                    </div>

                    {/* Header */}
                    <div className="mt-12 mb-2">
                        <h2 className="font-pixel text-lg text-gray-900 tracking-tight">
                            SIGN IN
                        </h2>
                    </div>

                    <div className="w-10 h-0.5 bg-ieee-blue mx-auto rounded-full mb-4" />

                    {/* Message */}
                    <p className="text-xs text-gray-500 mb-8 font-sans leading-relaxed">
                        {message || 'Sign in to access society management and event tools.'}
                    </p>

                    {/* Google Sign-in Button */}
                    <GoogleLoginButton variant="full-width" />

                    {/* Divider */}
                    <div className="flex items-center gap-3 my-5">
                        <div className="h-px grow bg-gray-200" />
                        <span className="font-mono text-[9px] tracking-[0.3em] text-gray-400 uppercase">IEEE Sahrdaya</span>
                        <div className="h-px grow bg-gray-200" />
                    </div>

                    {/* Privacy note */}
                    <p className="text-[10px] text-gray-400 font-mono tracking-wider">
                        Secured with OAuth 2.0
                    </p>
                </div>
            </div>
        </div>
    );
}
