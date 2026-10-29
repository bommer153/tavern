import type { Metadata, Viewport } from 'next';
import { Chakra_Petch, Geist, Geist_Mono, Kaushan_Script } from 'next/font/google';
import { GiftEffectHost } from '@/components/gift-effect';
import { Providers } from '@/lib/session';
import './globals.css';

const geist = Geist({ variable: '--font-geist', subsets: ['latin'] });
const mono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'], weight: ['400', '500'] });
// Brush script, used only for the Home tagline.
// Squared, HUD-like display face for headlines and primary actions only; body text stays Geist.
const display = Chakra_Petch({ variable: '--font-display', subsets: ['latin'], weight: ['600', '700'] });
const script = Kaushan_Script({ variable: '--font-script', subsets: ['latin'], weight: '400' });

export const metadata: Metadata = {
  title: { default: 'Tavern — Find your duo. Enter your world.', template: '%s · Tavern' },
  description: 'Hire gaming companions, find teammates, book coaching and hang out in live voice rooms. Built for Filipino gamers.',
};
export const viewport: Viewport = { themeColor: '#0a0a18', colorScheme: 'dark' };

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${geist.variable} ${mono.variable} ${script.variable} ${display.variable}`}>
      <body>
        <Providers>
          {children}
          <GiftEffectHost />
        </Providers>
      </body>
    </html>
  );
}
