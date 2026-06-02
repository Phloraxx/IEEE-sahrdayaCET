'use client';

/**
 * TransitionLink
 *
 * Drop-in for Next.js <Link>.  On click:
 *  1. Dispatches 'page-transition-leave' with { href, done } payload
 *  2. PageTransitionOverlay hears it, runs close animation, then calls done()
 *  3. done() calls router.push(href) to navigate
 *
 * Anchor links (/#section) on the same page smooth-scroll without animation.
 * Same-page clicks are ignored.
 */

import React from 'react';
import { useRouter, usePathname } from 'next/navigation';

interface TransitionLinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  children: React.ReactNode;
}

export default function TransitionLink({ href, children, className, ...rest }: TransitionLinkProps) {
  const router   = useRouter();
  const pathname = usePathname();

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();

    // ── Same-page anchor (/#section) ────────────────────────────────────
    if (href.startsWith('/#')) {
      if (pathname === '/') {
        const id = href.replace('/#', '');
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
      } else {
        navigate('/');  // go home, hash will scroll after load
      }
      return;
    }

    // ── Already on this page ─────────────────────────────────────────────
    if (href === pathname) return;

    navigate(href);
  };

  function navigate(dest: string) {
    let fired = false;
    const done = () => {
      if (fired) return;
      fired = true;
      router.push(dest);
    };

    // Failsafe: if animation hangs or event fails, navigate anyway
    setTimeout(done, 1000);

    // Dispatch leave event; overlay runs animation then calls done()
    window.dispatchEvent(
      new CustomEvent('page-transition-leave', {
        detail: { href: dest, done },
      })
    );
  }

  return (
    <a href={href} className={className} onClick={handleClick} {...rest}>
      {children}
    </a>
  );
}
