// Pure helpers (no React Native imports) so they can be unit-tested in plain Node.
/** Maps web-style links from notifications to app routes. */
export function toAppRoute(link: string) {
  const m = /^\/(orders|messages|rooms|c)\/([\w-]+)/.exec(link);
  if (!m) return link.startsWith('/wallet') ? '/wallet' : '/notifications';
  return { orders: `/order/${m[2]}`, messages: `/chat/${m[2]}`, rooms: `/room/${m[2]}`, c: `/c/${m[2]}` }[m[1] as 'orders'];
}
