'use client';
import type { GiftRarity } from '@tavern/shared';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Tavern3DScene } from './three/stage';
import { GiftGlyph } from './ui';
import s from './gift-effect.module.css';

export type GiftEffectInput = { id: string; image: string; animation?: string; rarity: GiftRarity; quantity: number };

// One full-screen player for the whole app; gifts queue so a burst of sends plays one after another.
let queue: GiftEffectInput[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Plays a gift full-screen. Call only after the server confirmed the transaction. */
export function playGiftEffect(e: GiftEffectInput) {
  if (queue.some((q) => q.id === e.id)) return;
  queue = [...queue, e].slice(-5); // a flood of gifts drops the oldest instead of playing for minutes
  emit();
}

const HOLD_MS: Record<GiftRarity, number> = { common: 1800, rare: 2400, epic: 3200, legendary: 4200 };
const isVideo = (url: string) => /\.(mp4|webm|mov)(\?|#|$)/i.test(url);

export function GiftEffectHost() {
  const current = useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => queue[0],
    () => undefined,
  );
  return current ? <Effect key={current.id} e={current} /> : null;
}

function Effect({ e }: { e: GiftEffectInput }) {
  const [leaving, setLeaving] = useState(false);
  const [nonce] = useState(Date.now); // stable per gift so re-renders don't restart the 3D reveal
  const video = !!e.animation && isVideo(e.animation);

  const finish = () => setLeaving(true);
  useEffect(() => {
    // Videos end themselves (with a cap); images and the built-in effect hold for a time scaled by rarity.
    const t = setTimeout(finish, video ? 12_000 : HOLD_MS[e.rarity]);
    return () => clearTimeout(t);
  }, [video, e.rarity]);
  useEffect(() => {
    if (!leaving) return;
    const t = setTimeout(() => {
      queue = queue.filter((q) => q.id !== e.id);
      emit();
    }, 350);
    return () => clearTimeout(t);
  }, [leaving, e.id]);

  const big = e.rarity === 'epic' || e.rarity === 'legendary';
  return (
    <div className={`${s.stage} ${s[e.rarity]} ${video ? s.cinema : ''} ${leaving ? s.leaving : ''}`} aria-live="polite">
      <span className="tv-sr-only">Gift sent</span>
      <div className={s.flash} aria-hidden />
      {e.animation ? (
        video ? (
          <video className={`${s.media} ${s.screen}`} src={e.animation} autoPlay muted playsInline onEnded={finish} onError={finish} aria-hidden />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- animated WebP/GIF must not be re-encoded by next/image
          <img className={s.media} src={e.animation} alt="" onError={finish} />
        )
      ) : (
        <>
          {big && <Tavern3DScene scene="gift" rarity={e.rarity as 'epic' | 'legendary'} nonce={nonce} bare className={s.scene} />}
          <div className={s.rays} aria-hidden />
          <span className={s.glyph}>
            <GiftGlyph image={e.image} size={big ? 220 : 170} />
          </span>
        </>
      )}
      {e.quantity > 1 && <span className={s.combo}>×{e.quantity}</span>}
    </div>
  );
}
