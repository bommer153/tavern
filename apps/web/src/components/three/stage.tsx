'use client';
import { type ReactNode, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { cn } from '../ui';
import type { Engine } from './engine';
import s from './stage.module.css';

export type SceneProps =
  | { scene: 'emblem' }
  | { scene: 'gameworld'; game?: string }
  | { scene: 'voice'; speakers: number; connected: boolean; level?: number }
  /** Room background motion layer; `level` is the loudest real speaker's audio level (0–1). */
  | { scene: 'ambient'; theme: string; level: number; parallax: boolean }
  | { scene: 'gift'; rarity: 'epic' | 'legendary'; nonce: number };

const REDUCED = '(prefers-reduced-motion: reduce)';
const subscribeReducedMotion = (cb: () => void) => {
  const mq = matchMedia(REDUCED);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
};

let webglSupport: boolean | undefined;
function hasWebGL() {
  if (webglSupport !== undefined) return webglSupport;
  try {
    const c = document.createElement('canvas');
    webglSupport = !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    webglSupport = false;
  }
  return webglSupport;
}

/**
 * Progressive-enhancement host for every 3D scene (Three.js used directly, see ./engine).
 * - Loads the engine bundle only when the host nears the viewport.
 * - Animates only while on-screen and the tab is visible; reduced motion gets one still frame.
 * - Shows `fallback` over a static backdrop while loading and whenever WebGL is unavailable or fails.
 * `bare` drops the backdrop and fills the host (used for in-dialog reveals).
 */
export function Tavern3DScene({ className, fallback, bare, ...scene }: SceneProps & { className?: string; fallback?: ReactNode; bare?: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const engine = useRef<Engine | null>(null);
  const latest = useRef(scene);
  const [near, setNear] = useState(false);
  const [onScreen, setOnScreen] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  const [status, setStatus] = useState<'idle' | 'ready' | 'failed'>('idle');
  const reduced = useSyncExternalStore(subscribeReducedMotion, () => matchMedia(REDUCED).matches, () => false);
  const key = JSON.stringify(scene);

  useEffect(() => {
    const onVis = () => setPageVisible(!document.hidden);
    document.addEventListener('visibilitychange', onVis);
    const io = new IntersectionObserver(
      ([e]) => {
        if (e!.isIntersecting) setNear(true);
        setOnScreen(e!.intersectionRatio > 0);
      },
      { rootMargin: '200px', threshold: [0, 0.01] },
    );
    if (host.current) io.observe(host.current);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      io.disconnect();
    };
  }, []);

  // Prop changes flow into the live engine without rebuilding it.
  useEffect(() => {
    latest.current = JSON.parse(key) as SceneProps;
    engine.current?.update(latest.current);
  }, [key]);

  // Create once near the viewport; always dispose on unmount (GPU memory, listeners, loop).
  useEffect(() => {
    if (!near || !hasWebGL()) return;
    let cancelled = false;
    import('./engine')
      .then(({ createEngine }) => {
        if (cancelled || !canvas.current) return;
        engine.current = createEngine(canvas.current, latest.current, () => setStatus('failed'));
        setStatus('ready');
      })
      .catch(() => !cancelled && setStatus('failed'));
    return () => {
      cancelled = true;
      engine.current?.dispose();
      engine.current = null;
    };
  }, [near]);

  // `near` only flips client-side, so hasWebGL() never runs during SSR.
  const failed = status === 'failed' || (near && !hasWebGL());
  const animate = status === 'ready' && onScreen && pageVisible && !reduced;
  useEffect(() => {
    engine.current?.setAnimating(animate);
  }, [animate]);

  return (
    <div ref={host} className={cn(s.stage, bare && s.full, className)} aria-hidden>
      {!bare && <div className={s.fallback}>{status !== 'ready' && fallback}</div>}
      {!failed && <canvas ref={canvas} className={cn(s.canvas, status === 'ready' && s.ready)} />}
    </div>
  );
}
