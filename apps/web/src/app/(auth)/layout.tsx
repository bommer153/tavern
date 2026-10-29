import { Suspense } from 'react';
import { Logo } from '@/components/shell';
import { Tavern3DScene } from '@/components/three/stage';
import s from './auth.module.css';

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className={s.gate}>
      <section className={s.world}>
        <Tavern3DScene scene="emblem" />
        <Logo />
        <div className={s.pitch}>
          <p className="tv-label">Tavern · built for Filipino gamers</p>
          <p className={s.pitchTitle}>Find your duo. Enter your world.</p>
          <p className={s.pitchSub}>Companions, coaches and live voice rooms for the games you already love.</p>
        </div>
      </section>
      <main className={s.door}>
        <div className={`tv-plate ${s.plate}`}>
          <Suspense>{children}</Suspense>
        </div>
      </main>
    </div>
  );
}
