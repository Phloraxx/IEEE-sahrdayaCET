'use client';

/**
 * PageTransitionOverlay
 *
 * Full-screen curtain animated smoothly with GSAP.
 *
 * Implements Top-Left and Bottom-Right converging diagonal layer-by-layer
 * wave animations. The SVG paths are mirrored horizontally to achieve 
 * the diagonal match. The background fades organically underneath.
 */

import React, { useRef, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import gsap from 'gsap';
import { getTransitionConfig } from './transitionConfig';

type LeaveDetail = { href: string; done: () => void };

export default function PageTransitionOverlay() {
  const pathname   = usePathname();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const bgRef      = useRef<HTMLDivElement>(null);
  const pathRefs   = useRef<(SVGPathElement | null)[]>([]);
  
  const prevPath = useRef(pathname);
  const ready    = useRef(false);
  const [isMobile, setIsMobile] = useState(false);

  // ── 0. Determine viewport size ──────────────────────────────────────────
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile(); // Check on mount
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // ── 1. Init: Hide curtain initially ─────────────────────────────────────
  useEffect(() => {
    gsap.set(wrapperRef.current, { autoAlpha: 0 });
    ready.current = true;
  }, []);

  // ── 2. Listen for transition-leave events ───────────────────────────────
  useEffect(() => {
    const handler = (e: Event) => {
      const { href, done } = (e as CustomEvent<LeaveDetail>).detail;
      
      const config = getTransitionConfig(href);
      const cbg = config.colors[0];
      const c1  = config.colors[1] ?? config.colors[0];
      const c2  = config.colors[2] ?? config.colors[0];
      const c3  = config.colors[4] ?? config.colors[0];

      if (bgRef.current) bgRef.current.style.backgroundColor = cbg;
      
      [0, 3].forEach(offset => {
        if (pathRefs.current[offset + 0]) pathRefs.current[offset + 0]?.setAttribute('fill', c1);
        if (pathRefs.current[offset + 1]) pathRefs.current[offset + 1]?.setAttribute('fill', c2);
        if (pathRefs.current[offset + 2]) pathRefs.current[offset + 2]?.setAttribute('fill', c3);
      });

      gsap.set(wrapperRef.current, { yPercent: 0, autoAlpha: 1 });

      const tl = gsap.timeline({
        onComplete: () => done(),
      });

      tl.fromTo(bgRef.current, { opacity: 0 }, { opacity: 1, duration: 0.8, ease: 'power2.inOut' }, 0);

      // We animate based on the current layout (mobile or desktop bounding boxes)
      const mobileOffset = window.innerWidth < 768;

      // Top-Left Waves fly in
      tl.fromTo(
        pathRefs.current.slice(0, 3),
        { x: mobileOffset ? 300 : 600, y: mobileOffset ? -500 : -600 },
        { x: 0, y: 0, stagger: 0.1, duration: 0.8, ease: 'power3.inOut' },
        0
      );

      // Bottom-Right Waves fly in
      tl.fromTo(
        pathRefs.current.slice(3, 6),
        { x: mobileOffset ? -300 : -600, y: mobileOffset ? 500 : 600 },
        { x: 0, y: 0, stagger: 0.1, duration: 0.8, ease: 'power3.inOut' },
        0
      );
    };

    window.addEventListener('page-transition-leave', handler);
    return () => window.removeEventListener('page-transition-leave', handler);
  }, []);

  // ── 3. Open curtain after a Next.js route change ────────────────────────
  useEffect(() => {
    if (!ready.current) return;
    if (prevPath.current === pathname) return;
    prevPath.current = pathname;

    const tid = setTimeout(() => {
      const tl = gsap.timeline({
        onComplete: () => { gsap.set(wrapperRef.current, { autoAlpha: 0 }); }
      });

      tl.fromTo(bgRef.current, { opacity: 1 }, { opacity: 0, duration: 0.8, ease: 'power2.inOut' }, 0);

      const mobileOffset = window.innerWidth < 768;

      tl.fromTo(
        pathRefs.current.slice(0, 3),
        { x: 0, y: 0 },
        { x: mobileOffset ? 300 : 600, y: mobileOffset ? -500 : -600, stagger: 0.1, duration: 0.8, ease: 'power3.inOut' },
        0
      );

      tl.fromTo(
        pathRefs.current.slice(3, 6),
        { x: 0, y: 0 },
        { x: mobileOffset ? -300 : -600, y: mobileOffset ? 500 : 600, stagger: 0.1, duration: 0.8, ease: 'power3.inOut' },
        0
      );
    }, 50);

    return () => clearTimeout(tid);
  }, [pathname]);

  const initConfig = getTransitionConfig(pathname);
  const cbgInit    = initConfig.colors[0];
  const c1Init     = initConfig.colors[1] ?? cbgInit;
  const c2Init     = initConfig.colors[2] ?? cbgInit;
  const c3Init     = initConfig.colors[4] ?? cbgInit;

  return (
    <div
      ref={wrapperRef}
      aria-hidden="true"
      className="fixed inset-0 w-full h-full pointer-events-none z-[9999] invisible"
    >
      <div 
        ref={bgRef}
        className="absolute inset-0 w-full h-full" 
        style={{ backgroundColor: cbgInit }}
      />
      {/* Conditionally render Desktop or Mobile SVG to maintain proportions without distortion */}
      {isMobile ? (
        <svg 
          className="absolute inset-0"
          viewBox="0 0 540 960" 
          width="100%" 
          height="100%" 
          preserveAspectRatio="none" 
          xmlns="http://www.w3.org/2000/svg"
          style={{ transform: 'scaleX(-1)' }}
        >
          <g transform="translate(540, 0)">
            <path ref={el => { pathRefs.current[0] = el; }} d="M0 540C-57.6 499 -115.3 458.1 -180.6 436.1C-246 414.1 -319.1 411 -376.2 376.2C-433.2 341.3 -474.3 274.6 -498.9 206.6C-523.5 138.6 -531.8 69.3 -540 0L0 0Z" fill={c1Init}></path>
            <path ref={el => { pathRefs.current[1] = el; }} d="M0 360C-38.4 332.7 -76.8 305.4 -120.4 290.7C-164 276 -212.7 274 -250.8 250.8C-288.8 227.6 -316.2 183.1 -332.6 137.8C-349 92.4 -354.5 46.2 -360 0L0 0Z" fill={c2Init}></path>
            <path ref={el => { pathRefs.current[2] = el; }} d="M0 180C-19.2 166.3 -38.4 152.7 -60.2 145.4C-82 138 -106.4 137 -125.4 125.4C-144.4 113.8 -158.1 91.5 -166.3 68.9C-174.5 46.2 -177.3 23.1 -180 0L0 0Z" fill={c3Init}></path>
          </g>
          <g transform="translate(0, 960)">
            <path ref={el => { pathRefs.current[3] = el; }} d="M0 -540C70.3 -527.1 140.6 -514.2 200.9 -485C261.2 -455.9 311.5 -410.5 363.5 -363.5C415.4 -316.4 469.2 -267.5 498.9 -206.6C528.6 -145.8 534.3 -72.9 540 0L0 0Z" fill={c1Init}></path>
            <path ref={el => { pathRefs.current[4] = el; }} d="M0 -360C46.9 -351.4 93.7 -342.8 133.9 -323.4C174.1 -303.9 207.6 -273.7 242.3 -242.3C277 -210.9 312.8 -178.3 332.6 -137.8C352.4 -97.2 356.2 -48.6 360 0L0 0Z" fill={c2Init}></path>
            <path ref={el => { pathRefs.current[5] = el; }} d="M0 -180C23.4 -175.7 46.9 -171.4 67 -161.7C87.1 -152 103.8 -136.8 121.2 -121.2C138.5 -105.5 156.4 -89.2 166.3 -68.9C176.2 -48.6 178.1 -24.3 180 0L0 0Z" fill={c3Init}></path>
          </g>
        </svg>
      ) : (
        <svg 
          className="absolute inset-0"
          viewBox="0 0 960 540" 
          width="100%" 
          height="100%" 
          preserveAspectRatio="none" 
          xmlns="http://www.w3.org/2000/svg"
          style={{ transform: 'scaleX(-1)' }}
        >
          <g transform="translate(960, 0)">
            <path ref={el => { pathRefs.current[0] = el; }} d="M0 486C-69 477.6 -137.9 469.2 -177.6 428.7C-217.2 388.2 -227.5 315.5 -275.1 275.1C-322.7 234.6 -407.6 226.5 -449 186C-490.4 145.5 -488.2 72.8 -486 0L0 0Z" fill={c1Init}></path>
            <path ref={el => { pathRefs.current[1] = el; }} d="M0 324C-46 318.4 -92 312.8 -118.4 285.8C-144.8 258.8 -151.6 210.3 -183.4 183.4C-215.1 156.4 -271.8 151 -299.3 124C-326.9 97 -325.5 48.5 -324 0L0 0Z" fill={c2Init}></path>
            <path ref={el => { pathRefs.current[2] = el; }} d="M0 162C-23 159.2 -46 156.4 -59.2 142.9C-72.4 129.4 -75.8 105.2 -91.7 91.7C-107.6 78.2 -135.9 75.5 -149.7 62C-163.5 48.5 -162.7 24.3 -162 0L0 0Z" fill={c3Init}></path>
          </g>
          <g transform="translate(0, 540)">
            <path ref={el => { pathRefs.current[3] = el; }} d="M0 -486C71.3 -486.4 142.7 -486.7 186 -449C229.3 -411.3 244.6 -335.5 289.9 -289.9C335.2 -244.3 410.4 -228.9 448.1 -185.6C485.8 -142.3 485.9 -71.2 486 0L0 0Z" fill={c1Init}></path>
            <path ref={el => { pathRefs.current[4] = el; }} d="M0 -324C47.6 -324.2 95.1 -324.5 124 -299.3C152.9 -274.2 163.1 -223.7 193.3 -193.3C223.5 -162.9 273.6 -152.6 298.7 -123.7C323.8 -94.9 323.9 -47.4 324 0L0 0Z" fill={c2Init}></path>
            <path ref={el => { pathRefs.current[5] = el; }} d="M0 -162C23.8 -162.1 47.6 -162.2 62 -149.7C76.4 -137.1 81.5 -111.8 96.6 -96.6C111.7 -81.4 136.8 -76.3 149.4 -61.9C161.9 -47.4 162 -23.7 162 0L0 0Z" fill={c3Init}></path>
          </g>
        </svg>
      )}
    </div>
  );
}
