'use client';
import { type ReactNode, useEffect, useRef } from 'react';
import s from './nexus-hero.module.css';

/**
 * Original Tavern key art: an anime-style pilot in a visor and headset, cel-shaded with violet/magenta rim light,
 * standing in a HUD rune ring. Pure SVG, split into depth layers that drift apart with scroll and (on mouse
 * devices) the pointer. Static under reduced motion. Decorative only.
 */
export function NexusHero({ className }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let px = 0;
    let py = 0;
    let raf = 0;
    // One rAF per frame at most; layers read these variables in CSS, so React never re-renders.
    const apply = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      if (r.bottom < 0 || r.top > innerHeight) return;
      const sy = Math.max(-1, Math.min(1, (r.top + r.height / 2 - innerHeight / 2) / innerHeight));
      el.style.setProperty('--px', px.toFixed(3));
      el.style.setProperty('--py', py.toFixed(3));
      el.style.setProperty('--sy', sy.toFixed(3));
    };
    const queue = () => {
      raf ||= requestAnimationFrame(apply);
    };
    const onMove = (e: PointerEvent) => {
      px = (e.clientX / innerWidth) * 2 - 1;
      py = (e.clientY / innerHeight) * 2 - 1;
      queue();
    };
    const fine = matchMedia('(pointer: fine)').matches; // touch drags would make the art jitter
    if (fine) addEventListener('pointermove', onMove, { passive: true });
    addEventListener('scroll', queue, { passive: true });
    queue();
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener('pointermove', onMove);
      removeEventListener('scroll', queue);
    };
  }, []);

  return (
    <div ref={ref} className={className ? `${s.art} ${className}` : s.art} aria-hidden>
      <Layer depth={0.15}>
        <Defs />
        <circle cx="300" cy="320" r="300" fill="url(#nxHalo)" />
        <g fill="#c4b5fd">
          {[[80, 90, 1.6], [520, 70, 1.2], [560, 300, 1.8], [40, 300, 1.1], [150, 40, 1], [470, 210, 1.3], [110, 520, 1.4]].map(([x, y, r], i) => (
            <circle key={i} cx={x} cy={y} r={r} opacity=".7" className={s.twinkle} style={{ animationDelay: `${i * 0.5}s` }} />
          ))}
        </g>
      </Layer>
      <Layer depth={0.35}>
        <g className={s.ring} stroke="#a78bfa" fill="none">
          <circle cx="300" cy="320" r="236" strokeOpacity=".35" strokeWidth="1.5" strokeDasharray="4 10" />
          <circle cx="300" cy="320" r="258" strokeOpacity=".2" strokeWidth="1" />
          <polygon points="300,72 514,196 514,444 300,568 86,444 86,196" strokeOpacity=".28" strokeWidth="2" />
        </g>
        <g className={s.ringRev} stroke="#d946ef" fill="none" strokeOpacity=".5">
          <path d="M300 54a266 266 0 0 1 230 133" strokeWidth="3" />
          <path d="M300 586a266 266 0 0 1-230-133" strokeWidth="3" />
        </g>
      </Layer>
      <Layer depth={0.6}>
        <g strokeLinecap="round" className={s.trails}>
          <path d="M-20 520L180 300" stroke="#d946ef" strokeOpacity=".55" strokeWidth="3" />
          <path d="M20 600L230 360" stroke="#22d3ee" strokeOpacity=".45" strokeWidth="2" />
          <path d="M620 180L430 380" stroke="#8b5cf6" strokeOpacity=".6" strokeWidth="3" />
          <path d="M640 260L470 450" stroke="#d946ef" strokeOpacity=".35" strokeWidth="2" />
        </g>
        <g className={s.shards}>
          <path d="M96 150l18-30 10 34z" fill="#a78bfa" fillOpacity=".7" />
          <path d="M500 120l22 8-14 20z" fill="#22d3ee" fillOpacity=".7" />
          <path d="M520 520l16-26 8 30z" fill="#d946ef" fillOpacity=".7" />
          <path d="M70 420l14 6-10 14z" fill="#f0abfc" fillOpacity=".7" />
        </g>
      </Layer>
      <Layer depth={1}>
        <Pilot />
      </Layer>
      {/* Out-of-focus shards close to the "camera": the biggest drift sells the depth. */}
      <Layer depth={1.8} className={s.front}>
        <path d="M18 640l40-70 26 80z" fill="#d946ef" fillOpacity=".55" />
        <path d="M548 600l34 14-24 34z" fill="#22d3ee" fillOpacity=".5" />
        <path d="M480 40l26-30 12 40z" fill="#a78bfa" fillOpacity=".45" />
      </Layer>
    </div>
  );
}

function Layer({ depth, className, children }: { depth: number; className?: string; children: ReactNode }) {
  return (
    <svg viewBox="0 0 600 720" preserveAspectRatio="xMidYMax meet" className={className ? `${s.layer} ${className}` : s.layer} style={{ '--d': depth } as React.CSSProperties}>
      {children}
    </svg>
  );
}

/** Shared paint servers; later layers reference these ids from the first layer. */
function Defs() {
  return (
    <defs>
      <linearGradient id="nxHair" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#3b1d8f" />
        <stop offset=".55" stopColor="#5b2ee0" />
        <stop offset="1" stopColor="#c026d3" />
      </linearGradient>
      <linearGradient id="nxHairHi" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#f0abfc" stopOpacity=".9" />
        <stop offset="1" stopColor="#f0abfc" stopOpacity="0" />
      </linearGradient>
      <linearGradient id="nxSkin" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#fde7e4" />
        <stop offset=".62" stopColor="#f3cfd2" />
        <stop offset="1" stopColor="#c9a0c8" />
      </linearGradient>
      <linearGradient id="nxVisor" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#22d3ee" />
        <stop offset=".5" stopColor="#a5f3fc" />
        <stop offset="1" stopColor="#8b5cf6" />
      </linearGradient>
      <linearGradient id="nxCoat" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#2a2160" />
        <stop offset="1" stopColor="#0d0b22" />
      </linearGradient>
      <radialGradient id="nxHalo">
        <stop offset="0" stopColor="#8b5cf6" stopOpacity=".55" />
        <stop offset=".6" stopColor="#d946ef" stopOpacity=".12" />
        <stop offset="1" stopColor="#d946ef" stopOpacity="0" />
      </radialGradient>
      <filter id="nxGlow" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="6" result="b" />
        <feMerge>
          <feMergeNode in="b" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
  );
}

function Pilot() {
  return (
    <>
      {/* Back hair */}
      <path d="M168 360C140 250 190 130 300 118c118-4 170 110 146 238l26 92-52-40 6 96-50-74-20 60-30-90H230l-22 84-26-70-46 52z" fill="url(#nxHair)" />

      {/* Coat & shoulders */}
      <path d="M58 720c18-110 92-160 160-182l82 70 82-70c68 22 142 72 160 182z" fill="url(#nxCoat)" />
      <path d="M58 720c18-110 92-160 160-182" fill="none" stroke="#a78bfa" strokeOpacity=".8" strokeWidth="3" />
      <path d="M542 720c-18-110-92-160-160-182" fill="none" stroke="#d946ef" strokeOpacity=".9" strokeWidth="3" />
      <path d="M118 600l70-46 30 40-62 54z" fill="#231c52" stroke="#8b5cf6" strokeWidth="2" />
      <path d="M482 600l-70-46-30 40 62 54z" fill="#231c52" stroke="#d946ef" strokeWidth="2" />
      <path d="M214 548l38-84 48 58 48-58 38 84-86 76z" fill="#1b1544" stroke="#3b2d86" strokeWidth="2" />
      <path d="M252 464l48 58 48-58" fill="none" stroke="#22d3ee" strokeOpacity=".7" strokeWidth="2" />
      {/* Chest sigil: the Tavern emblem halves */}
      <g transform="translate(300 660) scale(1.6) translate(-16 -16)" filter="url(#nxGlow)">
        <path d="M2 6h13.2v5.7h-3.4v8.8l3.4 2v3.2l-8-4.4v-8.6H4.3z" fill="#b65cff" />
        <path d="M30 6H16.8v5.7h3.4v8.8l-3.4 2v3.2l8-4.4v-8.6h2.9z" fill="#f0abfc" />
      </g>

      {/* Neck & face */}
      <path d="M266 420v76l34 30 34-30v-76z" fill="#d6aec0" />
      <path d="M220 296c0-74 160-74 160 0v62c0 44-40 84-80 96-40-12-80-52-80-96z" fill="url(#nxSkin)" />
      <path d="M380 300v58c0 44-40 84-80 96 30-20 52-56 56-98z" fill="#b48ab9" fillOpacity=".55" />
      <path d="M220 330c-2 30 6 60 30 86" fill="none" stroke="#a78bfa" strokeOpacity=".9" strokeWidth="3" />
      <path d="M290 414q10 5 20 0" fill="none" stroke="#a5527a" strokeWidth="3" strokeLinecap="round" />

      {/* Visor */}
      <path d="M206 318h188l8 36-102 16-102-16z" fill="url(#nxVisor)" filter="url(#nxGlow)" className={s.visor} />
      <path d="M218 326h164" stroke="#fff" strokeOpacity=".75" strokeWidth="2" />
      <path d="M232 344l40 6M330 350l38-6" stroke="#0e7490" strokeOpacity=".6" strokeWidth="3" strokeLinecap="round" />

      {/* Front hair: sharp anime bangs */}
      <path d="M210 312l14-112 34 96 22-118 26 112 32-104 16 108 30-78 10 98c18-112-28-182-96-184-86-2-128 86-88 182z" fill="url(#nxHair)" />
      <path d="M258 296l22-118M306 290l32-104M224 200l34 96" fill="none" stroke="url(#nxHairHi)" strokeWidth="5" strokeLinecap="round" />
      <path d="M392 314l10-98" fill="none" stroke="#f0abfc" strokeOpacity=".7" strokeWidth="3" />

      {/* Headset */}
      <path d="M210 318c2-168 178-168 180 0" fill="none" stroke="#1e1846" strokeWidth="14" strokeLinecap="round" />
      <path d="M210 318c2-168 178-168 180 0" fill="none" stroke="#8b5cf6" strokeOpacity=".7" strokeWidth="2" />
      <circle cx="206" cy="352" r="34" fill="#1a1540" stroke="#22d3ee" strokeWidth="4" />
      <circle cx="394" cy="352" r="34" fill="#1a1540" stroke="#d946ef" strokeWidth="4" />
      <circle cx="206" cy="352" r="12" fill="#22d3ee" className={s.pulse} filter="url(#nxGlow)" />
      <circle cx="394" cy="352" r="12" fill="#d946ef" className={s.pulse} filter="url(#nxGlow)" />
      <path d="M196 380c4 46 40 62 82 54" fill="none" stroke="#1e1846" strokeWidth="7" strokeLinecap="round" />
      <circle cx="282" cy="433" r="7" fill="#22d3ee" filter="url(#nxGlow)" />
    </>
  );
}
