import Link from 'next/link';
import { Suspense } from 'react';
import { NexusHero } from '@/components/art/nexus-hero';
import { Icon, type IconName } from '@/components/icon';
import { Logo } from '@/components/shell';
import { Button, Skeleton } from '@/components/ui';
import { LandingCompanions, LandingGames, LandingGifts, LandingRooms } from './landing-live';
import s from './landing.module.css';

const STEPS: [IconName, string, string][] = [
  ['search', 'Discover', 'Filter by game, rank, role, language and price. See who’s online right now.'],
  ['gamepad', 'Order & play', 'One tap orders an online companion. Pay with coins, chat in your private order thread, play a server-timed session.'],
  ['trophy', 'Review & return', 'Rate your session, follow favorites, and send gifts to companions you love.'],
];
const SAFETY: [IconName, string, string][] = [
  ['shield-check', 'Protected payments', 'Coins are held by Tavern and refunded automatically if an order is declined or expires.'],
  ['verified', 'Approved companions', 'Every companion is reviewed before they can offer paid services. Non-romantic, gaming-first.'],
  ['mic', 'Moderated rooms', 'Hosts and moderators control who speaks. Report and block anyone, anytime.'],
];

export default function Landing() {
  return (
    <div className={s.page}>
      <header className={s.bar}>
        <div className={`${s.wrap} ${s.barInner}`}>
          <Logo />
          <nav className={s.links} aria-label="Explore">
            <Link href="/discover">Discover</Link>
            <Link href="/rooms">Voice rooms</Link>
            <Link href="/games">Games</Link>
            <Link href="/become-companion">Become a companion</Link>
          </nav>
          <div className={s.barActions}>
            <Button variant="ghost" size="sm" href="/login">Sign in</Button>
            <Button size="sm" href="/register">Join Tavern</Button>
          </div>
        </div>
      </header>

      <section className={`${s.wrap} ${s.hero}`}>
        <div className={s.heroArt} aria-hidden>
          <NexusHero />
        </div>
        <div className={s.heroCopy}>
          <p className="tv-label">Built for Filipino gamers</p>
          <h1 className={s.title}>
            Your next duo is waiting at the <span className={s.accent}>Tavern.</span>
          </h1>
          <p className={s.lede}>Hire skilled gaming companions, book coaching, and hang out in live voice rooms — Mobile Legends, Valorant, Dota 2, Wild Rift and more.</p>
          <div className={s.ctas}>
            <Button size="lg" href="/discover" icon="search">Find a companion</Button>
            <Button size="lg" variant="secondary" href="/become-companion" icon="coin">Become a companion</Button>
          </div>
          <dl className={s.facts}>
            <div><dt className="tv-label">Pay with</dt><dd>GCash · Maya · Cards</dd></div>
            <div><dt className="tv-label">Prices in</dt><dd>Philippine pesos</dd></div>
            <div><dt className="tv-label">Community</dt><dd>18+ verified</dd></div>
          </dl>
        </div>
        <Suspense fallback={<Skeleton style={{ height: 360 }} />}>
          <LandingCompanions />
        </Suspense>
      </section>

      <Section kicker="Pick your battlefield" title="Popular games">
        <Suspense fallback={<Skeleton style={{ height: 120 }} />}><LandingGames /></Suspense>
      </Section>

      <Section kicker="Three steps to your next win" title="How it works">
        <ol className={s.steps}>
          {STEPS.map(([icon, h, b], i) => (
            <li key={h} className={s.step}>
              <span className={s.stepMark}><Icon name={icon} size={24} /></span>
              <p className={`tv-label ${s.stepNum}`}>Step {String(i + 1).padStart(2, '0')}</p>
              <h3 className={s.stepTitle}>{h}</h3>
              <p className={s.stepBody}>{b}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section kicker="Voice rooms" title="Live right now">
        <Suspense fallback={<Skeleton style={{ height: 180 }} />}><LandingRooms /></Suspense>
      </Section>

      <Section kicker="Virtual gifts" title="Send something legendary">
        <Suspense fallback={<Skeleton style={{ height: 130 }} />}><LandingGifts /></Suspense>
      </Section>

      <section className={`${s.wrap} ${s.section}`}>
        <div className={`tv-plate ${s.pitch}`}>
          <p className="tv-label" style={{ color: 'var(--tv-gold)' }}>For skilled players</p>
          <h2 className={s.pitchTitle}>Turn your rank into income.</h2>
          <p className={s.pitchBody}>Set your own prices, go online when you want, get paid for ranked duos, coaching and party sessions, and receive a share of gifts from your fans. Payouts to GCash, Maya or bank.</p>
          <div style={{ marginTop: 24 }}>
            <Button variant="gold" size="lg" href="/become-companion">Apply as a companion</Button>
          </div>
        </div>
      </section>

      <Section kicker="Community & safety" title="Safe by design">
        <div className={s.safety}>
          {SAFETY.map(([icon, h, b]) => (
            <div key={h} className={s.safe}>
              <Icon name={icon} size={22} />
              <p className={s.safeTitle}>{h}</p>
              <p className={s.safeBody}>{b}</p>
            </div>
          ))}
        </div>
      </Section>

      <footer className={s.footer}>
        <div className={`${s.wrap} ${s.footGrid}`}>
          <div className={s.footBrand}>
            <Logo />
            <p className={s.safeBody} style={{ marginTop: 12, maxWidth: 260 }}>Find your duo. Enter your world.</p>
          </div>
          {(
            [
              ['Product', [['Discover', '/discover'], ['Voice rooms', '/rooms'], ['Games', '/games'], ['Wallet', '/wallet']]],
              ['Community', [['Become a companion', '/become-companion'], ['Guidelines', '/legal/guidelines']]],
              ['Legal', [['Terms', '/legal/terms'], ['Privacy', '/legal/privacy']]],
            ] as const
          ).map(([h, links]) => (
            <div key={h}>
              <p className={s.footHead}>{h}</p>
              <ul className={s.footLinks}>
                {links.map(([label, href]) => <li key={href}><Link href={href}>{label}</Link></li>)}
              </ul>
            </div>
          ))}
        </div>
        <p className={s.copy}>© 2026 Tavern. 18+ only. Not affiliated with any game publisher.</p>
      </footer>
    </div>
  );
}

function Section({ title, kicker, children }: { title: string; kicker: string; children: React.ReactNode }) {
  return (
    <section className={`${s.wrap} ${s.section}`}>
      <p className={`tv-label ${s.kicker}`}>{kicker}</p>
      <h2 className={s.h2}>{title}</h2>
      {children}
    </section>
  );
}
