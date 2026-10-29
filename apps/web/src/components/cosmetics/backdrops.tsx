'use client';
import { DEFAULT_BACKGROUND } from '@tavern/shared';
import { type CSSProperties, type ReactNode, useSyncExternalStore } from 'react';
import { Tavern3DScene } from '../three/stage';
import { cn } from '../ui';
import s from './backdrops.module.css';

// Deterministic scatter so server and client draw the same stars/windows.
const rand = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

/** Perspective floor grid towards a vanishing point at (600, horizon). */
function Floor({ horizon, color, opacity }: { horizon: number; color: string; opacity: number }) {
  const lines: ReactNode[] = [];
  for (let x = -1800; x <= 3000; x += 150) lines.push(<path key={`v${x}`} d={`M600 ${horizon}L${x} 800`} />);
  for (let k = 1; k <= 12; k++) {
    const y = horizon + (800 - horizon) * (k / 12) ** 2;
    lines.push(<path key={`h${k}`} d={`M0 ${y}H1200`} />);
  }
  return (
    <g stroke={color} strokeOpacity={opacity} strokeWidth="1.2">
      {lines}
    </g>
  );
}

const arch = (x: number, y: number, w: number, h: number) => `M${x - w / 2} ${y + h}V${y + w / 2}A${w / 2} ${w / 2} 0 0 1 ${x + w / 2} ${y + w / 2}V${y + h}Z`;

function Lantern({ x, len }: { x: number; len: number }) {
  return (
    <g>
      <ellipse cx={x} cy={len + 26} rx="90" ry="90" fill="url(#hearthLamp)" />
      <path d={`M${x} 0V${len}`} stroke="#3b2a6e" strokeWidth="2" />
      <path d={`M${x - 14} ${len + 6}h28l6 10v26l-6 10h-28l-6-10V${len + 16}z`} fill="#fbbf24" fillOpacity=".85" stroke="#2a1a4a" strokeWidth="3" />
      <path d={`M${x} ${len + 8}v44M${x - 20} ${len + 30}h40`} stroke="#7c2d12" strokeOpacity=".6" strokeWidth="2" />
    </g>
  );
}

function Banner({ x }: { x: number }) {
  return (
    <g>
      <path d={`M${x - 34} 120h68v220l-34-26-34 26z`} fill="#3b1d8f" stroke="#5b2ee0" strokeWidth="2" />
      <path d={`M${x - 14} 190h12v10h-4v16l4 3v6l-8-5v-14h-4zM${x + 14} 190h-12v10h4v16l-4 3v6l8-5v-14h4z`} fill="#f5c76a" opacity=".85" />
    </g>
  );
}

const ART: Record<string, () => ReactNode> = {
  /** Tavern Hearth — the house default: a lantern-lit hall with arched windows and a hex-tiled floor. */
  hearth: () => (
    <>
      <defs>
        <linearGradient id="hearthPane" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4c3aa8" stopOpacity=".75" />
          <stop offset="1" stopColor="#1b1450" stopOpacity=".55" />
        </linearGradient>
        <radialGradient id="hearthLamp">
          <stop offset="0" stopColor="#fbbf24" stopOpacity=".35" />
          <stop offset="1" stopColor="#fbbf24" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="hearthFire" cx=".5" cy="1" r=".6">
          <stop offset="0" stopColor="#f97316" stopOpacity=".45" />
          <stop offset=".6" stopColor="#7c2d12" stopOpacity=".15" />
          <stop offset="1" stopColor="#7c2d12" stopOpacity="0" />
        </radialGradient>
      </defs>
      <path d="M0 0H1200V560H0z" fill="#120d2e" />
      {[[600, 140, 160, 330], [430, 210, 110, 250], [770, 210, 110, 250], [250, 230, 100, 230], [950, 230, 100, 230]].map(([x, y, w, h], i) => (
        <g key={i}>
          <path d={arch(x!, y!, w!, h!)} fill="url(#hearthPane)" stroke="#a98bff" strokeOpacity=".3" strokeWidth="2" />
          <path d={`M${x} ${y! + 8}V${y! + h!}M${x! - w! / 2} ${y! + h! * 0.55}H${x! + w! / 2}`} stroke="#0b0a22" strokeWidth="5" />
        </g>
      ))}
      <Banner x={340} />
      <Banner x={860} />
      <path d="M0 560H1200V800H0z" fill="#0d0a24" />
      <path d="M0 560H1200" stroke="#a98bff" strokeOpacity=".25" strokeWidth="2" />
      <Floor horizon={560} color="#a98bff" opacity={0.14} />
      <ellipse cx="600" cy="800" rx="520" ry="240" fill="url(#hearthFire)" />
      <Lantern x={480} len={110} />
      <Lantern x={720} len={80} />
    </>
  ),
  studio: () => (
    <>
      <defs>
        <linearGradient id="studioCone" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".1" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d="M560 0h80l200 800H360z" fill="url(#studioCone)" />
      <path d="M0 620H1200" stroke="#fff" strokeOpacity=".06" />
      <ellipse cx="600" cy="740" rx="300" ry="36" fill="#fff" fillOpacity=".05" />
    </>
  ),
  'cyber-grid': () => {
    const r = rand(7);
    return (
      <>
        <ellipse cx="600" cy="470" rx="700" ry="90" fill="#22d3ee" fillOpacity=".12" />
        <Floor horizon={470} color="#22d3ee" opacity={0.35} />
        {Array.from({ length: 7 }, (_, i) => {
          const x = 120 + i * 160 + r() * 60;
          const y = 80 + r() * 260;
          const k = 18 + r() * 30;
          return <polygon key={i} points={Array.from({ length: 6 }, (_, j) => `${x + Math.sin((j * Math.PI) / 3) * k},${y - Math.cos((j * Math.PI) / 3) * k}`).join(' ')} fill="none" stroke="#22d3ee" strokeOpacity=".22" strokeWidth="1.5" />;
        })}
      </>
    );
  },
  dream: () => (
    <>
      <defs>
        <filter id="dreamBlur" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="40" />
        </filter>
      </defs>
      <g filter="url(#dreamBlur)">
        <ellipse cx="300" cy="620" rx="380" ry="120" fill="#f9a8d4" fillOpacity=".35" />
        <ellipse cx="900" cy="660" rx="420" ry="140" fill="#a78bfa" fillOpacity=".4" />
        <ellipse cx="600" cy="760" rx="600" ry="120" fill="#c4b5fd" fillOpacity=".35" />
        <ellipse cx="760" cy="200" rx="220" ry="80" fill="#f9a8d4" fillOpacity=".2" />
      </g>
    </>
  ),
  nebula: () => {
    const r = rand(11);
    return (
      <>
        <defs>
          <radialGradient id="nebCore">
            <stop offset="0" stopColor="#fff" stopOpacity=".9" />
            <stop offset=".2" stopColor="#f9a8d4" stopOpacity=".5" />
            <stop offset="1" stopColor="#7c4dff" stopOpacity="0" />
          </radialGradient>
        </defs>
        {Array.from({ length: 90 }, (_, i) => (
          <circle key={i} cx={r() * 1200} cy={r() * 800} r={0.6 + r() * 1.4} fill="#fff" fillOpacity={0.3 + r() * 0.6} />
        ))}
        <ellipse cx="640" cy="330" rx="260" ry="70" fill="url(#nebCore)" transform="rotate(-18 640 330)" />
      </>
    );
  },
  grove: () => (
    <>
      <defs>
        <radialGradient id="groveGlow">
          <stop offset="0" stopColor="#fde68a" stopOpacity=".55" />
          <stop offset="1" stopColor="#fde68a" stopOpacity="0" />
        </radialGradient>
      </defs>
      {[[90, 40], [260, 55], [520, 30], [700, 50], [940, 45], [1110, 35]].map(([x, w], i) => (
        <path key={`b${i}`} d={`M${x} 800C${x! - 10} 500 ${x! + 14} 260 ${x! - 4} 0h${w}c-14 260 8 500 0 800z`} fill="#0f2a33" opacity=".7" />
      ))}
      {[[170, 70], [420, 90], [800, 80], [1040, 95]].map(([x, w], i) => (
        <g key={`f${i}`} fill="#050d14">
          <path d={`M${x} 800C${x! - 16} 520 ${x! + 22} 240 ${x! - 6} 0h${w}c-20 240 12 520 0 800z`} />
          <path d={`M${x! + w! / 2} 300C${x! + w! + 60} 260 ${x! + w! + 110} 240 ${x! + w! + 160} 200`} stroke="#050d14" strokeWidth="14" fill="none" />
        </g>
      ))}
      {[[640, 260], [290, 330], [920, 380]].map(([x, y], i) => (
        <g key={`l${i}`}>
          <circle cx={x} cy={y} r="60" fill="url(#groveGlow)" />
          <circle cx={x} cy={y} r="7" fill="#fde68a" />
        </g>
      ))}
      <path d="M0 740C200 700 300 760 450 720S800 700 900 740 1100 700 1200 730V800H0z" fill="#050d14" />
    </>
  ),
  'sakura-dusk': () => (
    <>
      <defs>
        <radialGradient id="moonGlow">
          <stop offset=".55" stopColor="#ffe4ec" stopOpacity=".5" />
          <stop offset="1" stopColor="#ffe4ec" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="640" cy="300" r="260" fill="url(#moonGlow)" />
      <circle cx="640" cy="300" r="160" fill="#fff1f5" fillOpacity=".92" />
      <path d="M0 600L180 470 330 560 520 420 700 560 880 450 1060 540 1200 480V800H0z" fill="#3a2560" />
      <path d="M0 680L220 590 420 660 640 580 860 670 1060 600 1200 650V800H0z" fill="#241640" />
      <path d="M0 120C140 150 260 210 380 300M150 140C170 190 210 230 260 250M300 230C330 210 350 180 360 150" stroke="#1a0f2e" strokeWidth="12" fill="none" strokeLinecap="round" />
      {[[380, 300], [260, 250], [360, 150], [220, 180], [320, 260], [120, 135]].map(([x, y], i) => (
        <g key={i} fill="#f9a8d4">
          <circle cx={x} cy={y} r="18" fillOpacity=".75" />
          <circle cx={x! + 16} cy={y! - 10} r="12" fillOpacity=".6" />
          <circle cx={x! - 14} cy={y! + 10} r="10" fillOpacity=".5" />
        </g>
      ))}
    </>
  ),
  'neon-city': () => {
    const r = rand(23);
    const back = Array.from({ length: 16 }, (_, i) => ({ x: i * 80 - 20, w: 70 + r() * 30, h: 220 + r() * 260 }));
    const front = Array.from({ length: 11 }, (_, i) => ({ x: i * 115 - 30, w: 90 + r() * 40, h: 300 + r() * 300 }));
    return (
      <>
        {back.map((b, i) => <rect key={`b${i}`} x={b.x} y={800 - b.h} width={b.w} height={b.h} fill="#1d0e45" />)}
        {front.map((b, i) => (
          <g key={`f${i}`}>
            <rect x={b.x} y={800 - b.h} width={b.w} height={b.h} fill="#0b0520" />
            {Array.from({ length: Math.floor(b.h / 26) }, (_, row) =>
              Array.from({ length: Math.floor(b.w / 18) }, (_, col) =>
                r() > 0.72 ? <rect key={`${row}-${col}`} x={b.x + 6 + col * 18} y={800 - b.h + 14 + row * 26} width="8" height="12" fill={r() > 0.5 ? '#fde68a' : '#67e8f9'} fillOpacity={0.35 + r() * 0.4} /> : null,
              ),
            )}
          </g>
        ))}
        <rect x="410" y="300" width="10" height="160" fill="#f472b6" className={s.neon} />
        <rect x="780" y="250" width="10" height="200" fill="#22d3ee" className={s.neon} />
        <rect x="560" y="380" width="120" height="10" fill="#f472b6" className={s.neon} />
      </>
    );
  },
  arcade: () => (
    <>
      <defs>
        <linearGradient id="arcSun" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fde68a" />
          <stop offset="1" stopColor="#f472b6" />
        </linearGradient>
        <clipPath id="arcSunClip">
          <path d="M0 0H1200V330H0zM0 345H1200V365H0zM0 382H1200V398H0zM0 416H1200V428H0zM0 447H1200V456H0z" />
        </clipPath>
      </defs>
      <circle cx="600" cy="330" r="170" fill="url(#arcSun)" clipPath="url(#arcSunClip)" />
      <path d="M0 470L160 330 300 420 460 300 600 470M600 470L760 320 900 420 1040 330 1200 470" fill="#12051f" stroke="#f472b6" strokeOpacity=".7" strokeWidth="2" />
      <path d="M0 470H1200V800H0z" fill="#12051f" />
      <Floor horizon={470} color="#f472b6" opacity={0.45} />
    </>
  ),
  arena: () => {
    const r = rand(5);
    return (
      <>
        {[230, 330, 430].map((y, i) => (
          <g key={i}>
            <path d={`M0 ${y + 80}Q600 ${y - 40} 1200 ${y + 80}V${y + 160}Q600 ${y + 40} 0 ${y + 160}z`} fill={['#0e0a2a', '#120d33', '#17113d'][i]} />
            {Array.from({ length: 40 }, (_, j) => {
              const x = r() * 1200;
              const t = (x - 600) / 600;
              return <circle key={j} cx={x} cy={y + 60 + 40 * t * t + r() * 40} r="1.6" fill={r() > 0.7 ? '#f5c76a' : '#c4b5fd'} fillOpacity={0.4 + r() * 0.5} />;
            })}
          </g>
        ))}
        <ellipse cx="600" cy="700" rx="330" ry="70" fill="#7c4dff" fillOpacity=".18" stroke="#a98bff" strokeOpacity=".6" strokeWidth="3" />
        <ellipse cx="600" cy="700" rx="250" ry="48" fill="none" stroke="#22d3ee" strokeOpacity=".5" strokeWidth="2" />
      </>
    );
  },
  'winter-lights': () => (
    <>
      <path d="M0 620C200 560 360 600 520 570S860 560 1000 590 1200 570 1200 570V800H0z" fill="#dbeafe" fillOpacity=".55" />
      <path d="M0 690C180 650 380 700 600 660S1000 680 1200 650V800H0z" fill="#eff6ff" fillOpacity=".85" />
      {[[140, 610], [220, 600], [880, 590], [980, 600], [1060, 610]].map(([x, y], i) => (
        <path key={i} d={`M${x} ${y! - 90}l26 50h-14l22 40H${x! - 22}l22-40h-14z`} fill="#0b1d3a" />
      ))}
    </>
  ),
};

export const BACKDROP_KEYS = Object.keys(ART);
const ANIMATED_3D = new Set(BACKDROP_KEYS.filter((k) => k !== 'studio'));

const REDUCED = '(prefers-reduced-motion: reduce)';
const sub = (cb: () => void) => {
  const mq = matchMedia(REDUCED);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
};
/** Constrained devices (data saver, few cores on touch) get the static artwork only. */
const lite = () => {
  const n = navigator as Navigator & { connection?: { saveData?: boolean } };
  return !!n.connection?.saveData || (matchMedia('(pointer: coarse)').matches && (n.hardwareConcurrency ?? 8) < 4);
};
export function useMotionOk() {
  return useSyncExternalStore(sub, () => !matchMedia(REDUCED).matches && !lite(), () => false);
}

/**
 * Room environment: static SVG art (always) + optional Three.js life (`animated`, motion allowed, capable device).
 * A scrim keeps names and controls readable at any `intensity`.
 */
export function RoomBackdrop({
  theme,
  level = 0,
  animated = true,
  intensity = 70,
  parallax = true,
  className,
}: {
  theme?: string | null;
  level?: number;
  animated?: boolean;
  intensity?: number;
  parallax?: boolean;
  className?: string;
}) {
  const key = theme && ART[theme] ? theme : DEFAULT_BACKGROUND;
  const motion = useMotionOk() && animated;
  return (
    <div className={cn(s.bd, s[`t-${key}`], motion && s.live, className)} style={{ '--scrim': (0.2 + (1 - intensity / 100) * 0.65).toFixed(2) } as CSSProperties} aria-hidden>
      {key === 'arena' && (
        <>
          <span className={cn(s.beam, s.beamL)} />
          <span className={cn(s.beam, s.beamR)} />
        </>
      )}
      {key === 'winter-lights' && (
        <>
          <span className={cn(s.aurora, s.a1)} />
          <span className={cn(s.aurora, s.a2)} />
        </>
      )}
      <svg className={s.art} viewBox="0 0 1200 800" preserveAspectRatio="xMidYMax slice">
        {ART[key]!()}
      </svg>
      {motion && ANIMATED_3D.has(key) && <Tavern3DScene scene="ambient" theme={key} level={level} parallax={parallax} bare className={s.fx} />}
      <div className={s.scrim} />
    </div>
  );
}
