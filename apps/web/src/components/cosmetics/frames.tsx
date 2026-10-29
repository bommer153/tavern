'use client';
import type { CSSProperties, ReactNode } from 'react';
import { useId } from 'react';
import { Icon } from '../icon';
import { Avatar, cn } from '../ui';
import s from './frames.module.css';

/**
 * Real voice state only: `speaking` comes from LiveKit active speakers, `muted` from the participant's
 * mic track, `offline` when a stage member isn't connected to audio. `idle` covers everything else.
 */
export type SeatState = 'idle' | 'speaking' | 'muted' | 'offline';

const polar = (deg: number, r: number) => [Math.sin((deg * Math.PI) / 180) * r, -Math.cos((deg * Math.PI) / 180) * r] as const;
const hex = (r: number) => Array.from({ length: 6 }, (_, i) => polar(i * 60, r).join(',')).join(' ');

/** Each frame is its own drawing in a 100-unit box centred on 0,0; the face sits inside r=38. */
const ART: Record<string, (id: string) => ReactNode> = {
  'pilot-light': () => (
    <>
      <circle r="41.5" className={s.pilotRing} />
      <circle r="41.5" fill="none" stroke="#fff" strokeOpacity=".55" strokeWidth=".6" />
      <path d="M0-47l1.8 3L0-41l-1.8-3z" fill="#fff" className={s.pilotSpark} />
    </>
  ),
  'neon-hex': (id) => (
    <>
      <defs>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f472b6" />
          <stop offset="1" stopColor="#7c4dff" />
        </linearGradient>
      </defs>
      <polygon points={hex(46)} fill="none" stroke={`url(#${id}g)`} strokeWidth="2.6" strokeLinejoin="round" className={s.neonHex} />
      <polygon points={hex(42.4)} fill="none" stroke="#f9a8d4" strokeOpacity=".4" strokeWidth=".7" />
    </>
  ),
  circuit: () => (
    <>
      <circle r="41" fill="none" stroke="#22d3ee" strokeOpacity=".35" strokeWidth=".7" strokeDasharray="2 3" />
      <path d="M-46-30v-16h16M30-46h16v16M46 30v16H30M-30 46h-16V30" fill="none" stroke="#22d3ee" strokeWidth="2.6" className={s.brackets} />
      <path d="M-41 0h-7M41 0h7M0 41v7M0-41v-7" stroke="#22d3ee" strokeOpacity=".6" strokeWidth=".9" />
      {[[-49.5, -1.5], [46.5, -1.5], [-1.5, 46.5], [-1.5, -49.5]].map(([x, y], i) => (
        <rect key={i} x={x} y={y} width="3" height="3" fill="#a5f3fc" className={s.node} style={{ animationDelay: `${i * 0.35}s` }} />
      ))}
    </>
  ),
  obsidian: () => (
    <>
      <circle r="40" fill="none" stroke="#06051a" strokeWidth="3.2" />
      <circle r="41.8" fill="none" stroke="#f5c76a" strokeWidth="1" className={s.goldInner} />
      <circle r="46" fill="none" stroke="#f5c76a" strokeOpacity=".45" strokeWidth=".6" strokeDasharray="68 4.3" transform="rotate(-8)" />
      <path d="M0 42l3.4 3.4L0 48.8l-3.4-3.4z" fill="#f5c76a" />
      <path d="M0-48.5l1.8 1.8L0-44.9l-1.8-1.8z" fill="#f5c76a" opacity=".75" />
    </>
  ),
  starfall: () => (
    <>
      <circle r="42" fill="none" stroke="#a98bff" strokeOpacity=".35" strokeWidth=".7" />
      {Array.from({ length: 12 }, (_, i) => {
        const [x, y] = polar(i * 30 + 15, i % 2 ? 44 : 47);
        const k = [1.4, 0.9, 1.2, 0.8][i % 4]!;
        return <path key={i} d="M0-3L.7-.7 3 0 .7.7 0 3-.7.7-3 0-.7-.7z" fill="#fde68a" transform={`translate(${x} ${y}) scale(${k})`} className={s.star} style={{ animationDelay: `${(i % 5) * 0.4}s` }} />;
      })}
      <g className={s.orbit}>
        <circle cx="0" cy="-46" r="3.6" fill="#fde68a" />
        <circle cx="1.5" cy="-47" r="3" fill="#17143a" />
      </g>
    </>
  ),
  'pulse-orbit': () => (
    <>
      <circle r="43" fill="none" stroke="#7c4dff" strokeOpacity=".55" strokeWidth="1" strokeDasharray="1.5 3.5" />
      <g className={s.spin}>
        <path d="M0-43A43 43 0 0 0-18.2-39" fill="none" stroke="#22d3ee" strokeOpacity=".6" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="0" cy="-43" r="2.8" fill="#a5f3fc" />
        <path d="M0 43A43 43 0 0 0 18.2 39" fill="none" stroke="#f472b6" strokeOpacity=".6" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="0" cy="43" r="2.8" fill="#fbcfe8" />
      </g>
    </>
  ),
  'ember-crown': (id) => (
    <>
      <defs>
        <linearGradient id={`${id}f`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#f472b6" />
          <stop offset=".55" stopColor="#fb923c" />
          <stop offset="1" stopColor="#fde68a" />
        </linearGradient>
      </defs>
      <circle r="40" fill="none" stroke="#fb923c" strokeWidth="1.4" />
      {Array.from({ length: 11 }, (_, i) => {
        const deg = -100 + i * 20;
        const [x, y] = polar(deg, 39.5);
        const k = 0.7 + 0.5 * Math.cos((deg * Math.PI) / 180) ** 2 * (Math.abs(deg) < 90 ? 1 : 0.3);
        return (
          <g key={i} transform={`translate(${x} ${y}) rotate(${deg}) scale(${k})`}>
            <path d="M0 0C-3.4-3-3.8-7.5 0-13 3.8-7.5 3.4-3 0 0z" fill={`url(#${id}f)`} className={s.flame} style={{ animationDelay: `${(i % 4) * 0.18}s` }} />
          </g>
        );
      })}
    </>
  ),
  frostbite: (id) => (
    <>
      <defs>
        <linearGradient id={`${id}i`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#67e8f9" />
          <stop offset="1" stopColor="#ffffff" />
        </linearGradient>
      </defs>
      <circle r="40.5" fill="none" stroke="#a5f3fc" strokeWidth="1.8" className={s.frost} />
      {Array.from({ length: 10 }, (_, i) => {
        const deg = i * 36 + 8;
        const [x, y] = polar(deg, 40);
        return <path key={i} d={`M-2.3 0L0-${[9, 6, 8, 5, 7][i % 5]} 2.3 0z`} fill={`url(#${id}i)`} transform={`translate(${x} ${y}) rotate(${deg})`} />;
      })}
    </>
  ),
  sovereign: (id) => (
    <>
      <defs>
        <linearGradient id={`${id}s`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fde68a" />
          <stop offset="1" stopColor="#f59e0b" />
        </linearGradient>
      </defs>
      <circle r="40.5" fill="none" stroke={`url(#${id}s)`} strokeWidth="1.6" />
      {/* Tavern sigil crown: the emblem's two halves in gold. */}
      <g transform="translate(0 -46) scale(.42) translate(-16 -16)" fill={`url(#${id}s)`} stroke="#06051a" strokeWidth="1">
        <path d="M2 6h13.2v5.7h-3.4v8.8l3.4 2v3.2l-8-4.4v-8.6H4.3z" />
        <path d="M30 6H16.8v5.7h3.4v8.8l-3.4 2v3.2l8-4.4v-8.6h2.9z" />
      </g>
      {[-1, 1].map((d) => (
        <path key={d} d="M0-3.4L3.4 0 0 3.4-3.4 0z" fill="#f472b6" transform={`translate(${d * 44} 4)`} />
      ))}
    </>
  ),
};

export const FRAME_KEYS = Object.keys(ART);

/**
 * Avatar seat with an optional cosmetic frame. `size` is the whole seat box; the face is 76% of it, so frames
 * never push the layout. Speaking, muted and offline each get a shape/icon cue, not just colour.
 */
export function SeatFrame({
  frame,
  name,
  src,
  size,
  state = 'idle',
  level = 0,
  className,
}: {
  frame?: string | null;
  name: string;
  src?: string;
  size: number;
  state?: SeatState;
  level?: number;
  className?: string;
}) {
  const id = useId().replace(/:/g, '');
  const art = frame ? ART[frame] : undefined;
  const lvl = state === 'speaking' ? Math.min(1, Math.max(0.15, level)) : 0;
  return (
    <span className={cn(s.seat, frame && s[`f-${frame}`], s[state], className)} style={{ '--s': `${size}px`, '--lvl': lvl } as CSSProperties} aria-hidden>
      {state === 'speaking' && <span className={s.speakRing} />}
      {frame === 'sovereign' && <span className={s.aurora} />}
      <span className={s.face}>
        <Avatar name={name} src={src} size={Math.round(size * 0.76)} />
      </span>
      {art && (
        <svg viewBox="-50 -50 100 100" className={s.art}>
          {art(id)}
        </svg>
      )}
      {state === 'speaking' && (
        <span className={cn(s.badge, s.badgeSpeak)}>
          <i />
          <i />
          <i />
        </span>
      )}
      {state === 'muted' && (
        <span className={cn(s.badge, s.badgeMuted)}>
          <Icon name="mic-off" size={Math.max(10, Math.round(size * 0.14))} />
        </span>
      )}
      {state === 'offline' && (
        <span className={cn(s.badge, s.badgeOff)}>
          <Icon name="signal-off" size={Math.max(10, Math.round(size * 0.14))} />
        </span>
      )}
    </span>
  );
}

export const SEAT_STATE_LABEL: Record<SeatState, string> = { idle: '', speaking: 'speaking', muted: 'muted', offline: 'not connected to audio' };
