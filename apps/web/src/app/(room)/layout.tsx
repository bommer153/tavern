import type { Viewport } from 'next';

// Immersive routes sit outside the app shell. The keyboard resizes the layout (so dvh shrinks and the
// chat input stays visible) and content may extend under notches, padded back by safe-area insets.
export const viewport: Viewport = { themeColor: '#06051a', colorScheme: 'dark', viewportFit: 'cover', interactiveWidget: 'resizes-content' };

export default function ImmersiveLayout({ children }: { children: React.ReactNode }) {
  return children;
}
