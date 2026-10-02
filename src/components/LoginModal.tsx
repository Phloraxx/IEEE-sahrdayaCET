import { useRef } from 'react';
import { Dialog } from 'radix-ui';
import { X } from 'lucide-react';
import GoogleLoginButton from './GoogleLoginButton';
import { MASCOT_BODY_PEEK, MASCOT_HEAD, PixelGrid } from './mascot';
interface LoginModalProps { isOpen: boolean; onClose: () => void; message?: string; }
export default function LoginModal({ isOpen, onClose, message }: LoginModalProps) {
  const opener = useRef<HTMLElement | null>(null);
  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[130] bg-black/50 backdrop-blur-xs" />
        <Dialog.Content
          onOpenAutoFocus={() => { opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; }}
          onCloseAutoFocus={(event) => { if (opener.current?.isConnected) { event.preventDefault(); opener.current.focus(); } }}
          className="fixed left-1/2 top-1/2 z-[131] max-h-[calc(100dvh-2rem-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px))] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-2xl focus:outline-none"
        >
          <div className="h-1 bg-linear-to-r from-ieee-blue via-ieee-light-blue to-ieee-blue" />
          <Dialog.Close aria-label="Close sign in dialog" className="absolute right-3 top-3 grid h-11 w-11 place-items-center rounded-full text-gray-500 hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-ieee-blue"><X size={18} aria-hidden="true" /></Dialog.Close>
          <div className="relative px-6 pb-7 pt-8 text-center sm:px-8">
            <div aria-hidden="true" className="absolute left-6 top-0" style={{ imageRendering: 'pixelated' }}><PixelGrid grid={MASCOT_HEAD} size={5} /><PixelGrid grid={MASCOT_BODY_PEEK} size={5} /></div>
            <Dialog.Title className="mb-4 mt-12 font-pixel text-lg tracking-tight text-gray-900">SIGN IN</Dialog.Title>
            <Dialog.Description className="mb-7 text-sm leading-relaxed text-gray-600">{message || 'Sign in to register, view tickets and manage your events.'}</Dialog.Description>
            <GoogleLoginButton variant="full-width" />
            <p className="mt-5 text-xs leading-5 text-gray-500">Continue securely with your Google account.</p>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
