// Tavern icon set — original artwork, shared by web (inline <svg>) and mobile (react-native-svg).
// Grid 24×24, live area 3–21. Strokes are 1.75 with square caps and mitred joins; shapes favour
// 45° chamfers and hexagons (Tavern's motif) over circles and rounded corners.
export const ICONS = {
  home: 'M4 11 12 4l8 7v9h-5.5v-6h-5v6H4z',
  discover: 'M12 2.8l8 4.6v9.2l-8 4.6-8-4.6V7.4z M14.8 9.2 13.2 13.2 9.2 14.8 10.8 10.8z',
  mic: 'M10 3h4l1 1v8l-1 1h-4l-1-1V4z M6 11v1a6 6 0 0 0 12 0v-1 M12 18v3 M9 21h6',
  'mic-off': 'M10 3h4l1 1v8l-1 1h-4l-1-1V4z M6 11v1a6 6 0 0 0 12 0v-1 M12 18v3 M9 21h6 M3.5 3.5l17 17',
  chat: 'M4 5h16v11h-9l-5 4v-4H4z M8 9.5h8 M8 12.5h5',
  orders: 'M4 6h16v14H4z M4 10h16 M8 3v4 M16 3v4 M9 15l2 2 4-4',
  schedule: 'M11 20H4V6h16v5 M4 10h16 M8 3v4 M16 3v4 M17 13a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M17 15.5V17l1.2 1.2',
  bell: 'M6 16v-6a6 6 0 0 1 12 0v6l2 2H4z M10 21h4',
  heart: 'M12 20 4 12V8l3-3h3l2 2 2-2h3l3 3v4z',
  user: 'M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M5 21v-3l3-3h8l3 3v3',
  users: 'M9 5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z M3 20v-2.5L5.5 15h7l2.5 2.5V20 M16 5.2a3.4 3.4 0 0 1 0 6.6 M18 15l3 2.5V20',
  settings: 'M12 2.8l8 4.6v9.2l-8 4.6-8-4.6V7.4z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  'shield-alert': 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z M12 8v5 M12 16v.5',
  'shield-check': 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z M8.5 12l2.5 2.5 4.5-4.5',
  verified: 'M12 2.8l8 4.6v9.2l-8 4.6-8-4.6V7.4z M8.5 12l2.5 2.5 4.5-4.5',
  search: 'M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13z M15.5 15.5 20 20',
  close: 'M6 6l12 12 M18 6 6 18',
  check: 'M5 12.5l5 5 9-10',
  chevron: 'M9 5l7 7-7 7',
  back: 'M20 12H5 M11 5l-7 7 7 7',
  plus: 'M12 5v14 M5 12h14',
  send: 'M3 11 21 3l-6 18-4-7z M11 14 21 3',
  gift: 'M4 10h16v10H4z M3 7h18v3H3z M12 7v13 M12 7 9 4H7v3 M12 7l3-3h2v3',
  coin: 'M12 2.8l8 4.6v9.2l-8 4.6-8-4.6V7.4z M12 7.5l3.9 2.25v4.5L12 16.5l-3.9-2.25v-4.5z',
  wallet: 'M4 6h13v3 M4 6v13h16V9H4 M15 13.5h2',
  star: 'M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z',
  lock: 'M6 11h12v9H6z M8.5 11V8a3.5 3.5 0 0 1 7 0v3 M12 14.5v2',
  hand: 'M8 13V6.5a1.5 1.5 0 0 1 3 0V11 M11 11V4.5a1.5 1.5 0 0 1 3 0V11 M14 11V6a1.5 1.5 0 0 1 3 0v8c0 4-2.5 7-6 7-2.5 0-4-1.5-5.5-3.5L4 14.5a1.5 1.5 0 0 1 2.5-1.8L8 14',
  more: 'M11 4h2v2h-2z M11 11h2v2h-2z M11 18h2v2h-2z',
  logout: 'M10 4H4v16h6 M15 8l4 4-4 4 M19 12H9',
  flag: 'M5 21V4 M5 4h13l-2.5 4.5L18 13H5',
  ban: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M5.6 5.6l12.8 12.8',
  trash: 'M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13 M10 11v6 M14 11v6',
  retry: 'M20 12a8 8 0 1 1-2.3-5.7 M20 4v5h-5',
  external: 'M14 4h6v6 M20 4l-9 9 M18 14v6H4V6h6',
  sliders: 'M4 7h9 M17 7h3 M4 17h3 M11 17h9 M15 4v6 M9 14v6',
  sparkle: 'M11 3l2 7 7 2-7 2-2 7-2-7-7-2 7-2z M19 3v4 M17 5h4',
  trophy: 'M8 4h8v5a4 4 0 0 1-8 0z M8 6H4v2a3 3 0 0 0 4 3 M16 6h4v2a3 3 0 0 1-4 3 M12 13v4 M8 20h8 M9.5 17h5',
  timer: 'M12 9v4l3 2 M9 2h6 M12 5a8 8 0 1 0 0 16 8 8 0 0 0 0-16z',
  gamepad: 'M6 8h12l3 4-1 6h-3l-2-3H9l-2 3H4l-1-6z M7.5 10.5v3 M6 12h3 M15 11h1.5v1.5H15z M17 13h1.5v1.5H17z',
  signal: 'M2 9a15 15 0 0 1 20 0 M5.5 12.5a10 10 0 0 1 13 0 M9 16a5 5 0 0 1 6 0 M11.25 19h1.5v1.5h-1.5z',
  'signal-off': 'M2 9a15 15 0 0 1 20 0 M5.5 12.5a10 10 0 0 1 13 0 M9 16a5 5 0 0 1 6 0 M11.25 19h1.5v1.5h-1.5z M3 3l18 18',
  alert: 'M12 3 22 20H2z M12 9v5 M12 17v.5',
  receipt: 'M5 3h14v18l-2.5-2-2.5 2-2-2-2 2-2.5-2L5 21z M9 8h6 M9 12h6 M9 16h3',
  flask: 'M9 3h6 M10 3v6l-5 9.5L6 20h12l1-1.5L14 9V3 M7.5 15h9',
  dashboard: 'M4 4h7v9H4z M13 4h7v5h-7z M13 11h7v9h-7z M4 15h7v5H4z',
  list: 'M10 6h10 M10 12h10 M10 18h10 M3.5 6l1.5 1.5L7.5 5 M3.5 12l1.5 1.5L7.5 11 M3.5 18l1.5 1.5L7.5 17',
  gauge: 'M4 18a8 8 0 1 1 16 0 M12 18l4-6 M4 18h16',
  spinner: 'M12 3a9 9 0 1 1-9 9',
  // Inner shield runs counter to the outline so filled renders keep it as a hole.
  emblem: 'M3 5.6h18l-1.5 4.3h-1.8v5.5L12 18.5l-5.7-3.1V9.9H4.5z M9.3 9.2v5.7l2.7 1.6 2.7-1.6V9.2z M12 5.6v3.6',
  image: 'M4 5h16v14H4z M4 16l5-5 4 4 2-2 5 5 M15.5 8.5h1v1h-1z',
  volume: 'M4 9h4l5-4v14l-5-4H4z M16.5 9a4 4 0 0 1 0 6 M19 6.5a7.5 7.5 0 0 1 0 11',
  'volume-off': 'M4 9h4l5-4v14l-5-4H4z M16 9.5l5 5 M21 9.5l-5 5',
  palette: 'M12 3a9 9 0 1 0 0 18c1.5 0 2-1 2-2s-1-1.5-1-2.5 1-1.5 2-1.5h3c1.5 0 3-1 3-3A9 9 0 0 0 12 3z M7.5 11h1.5v1.5H7.5z M10.5 7h1.5v1.5h-1.5z M15 8h1.5v1.5H15z',
} as const;

export type IconName = keyof typeof ICONS;
/** Icons drawn as filled shapes rather than outlines. */
export const FILLED_ICONS: ReadonlySet<IconName> = new Set<IconName>(['star', 'more']);

/** Two-stop artwork colours per game (light, deep). Used for game tokens, room art and 3D scenes. */
export const GAME_COLORS: Record<string, readonly [string, string]> = {
  mlbb: ['#3a6bff', '#8b5cf6'],
  valorant: ['#ff4655', '#f472b6'],
  dota2: ['#d24a37', '#4a1f1a'],
  'wild-rift': ['#1fa3c9', '#8b5cf6'],
  pubg: ['#f2a900', '#7a5200'],
  codm: ['#6f8a52', '#1c2a12'],
  'free-fire': ['#ff8a00', '#ff3d00'],
};
export const gameColors = (slug?: string): readonly [string, string] => (slug && GAME_COLORS[slug]) || ['#8b5cf6', '#3b2a77'];
