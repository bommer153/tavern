// Mirrors apps/web/src/styles/tokens.css ("Night Realm").
export const c = {
  void: '#06051A',
  bg: '#0B0A22',
  bg2: '#110F2C',
  surface: '#17143A',
  surface2: '#201B4A',
  line: '#252052',
  lineHi: '#A082FF73',
  glass: '#16123899',
  ink: '#F3F1FF',
  muted: '#B4ADDB',
  faint: '#7C74AD',
  purple: '#7C4DFF',
  purpleHi: '#A98BFF',
  cyan: '#22D3EE',
  pink: '#F472B6',
  live: '#F43F5E',
  gold: '#F5C76A',
  success: '#34D399',
  warning: '#FBBF24',
  danger: '#F87171',
};
export const radius = { card: 18, input: 14, pill: 999 };
export const space = (n: number) => n * 4;

/** Two-stop artwork colors per game; mirrors GAME_COLORS in @tavern/shared. */
const gameColors: Record<string, [string, string]> = {
  mlbb: ['#3A6BFF', '#8B5CF6'],
  valorant: ['#FF4655', '#F472B6'],
  dota2: ['#B33A2B', '#4A1F1A'],
  'wild-rift': ['#1FA3C9', '#8B5CF6'],
  pubg: ['#F2A900', '#7A5200'],
  codm: ['#4B5D3A', '#1C2A12'],
  'free-fire': ['#FF8A00', '#FF3D00'],
};
export const gameColor = (slug?: string): [string, string] => (slug && gameColors[slug]) || ['#7C4DFF', '#3B2A77'];

const avatarBg = ['c4b5fd', 'f9a8d4', 'fde68a', 'a7f3d0', 'a5f3fc', 'fdba74'];
/** Illustrated stand-in for people without a photo (same seed and colours as the web). */
export const placeholderAvatar = (name: string) =>
  `https://api.dicebear.com/9.x/adventurer/svg?seed=${encodeURIComponent(name)}&backgroundColor=${avatarBg[[...name].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7) % avatarBg.length]}`;
