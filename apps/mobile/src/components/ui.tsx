import type { CompanionCard as CardT, VoiceRoom } from '@tavern/shared';
import { router } from 'expo-router';
import { type ComponentProps, type ReactNode, useEffect } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  type TextStyle,
  View,
  type ViewStyle,
} from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image as ExpoImage } from 'expo-image';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { ChamferBg, Icon, type IconName } from './icon';
import { formatPhp, WEB_URL } from '@/lib/api';
import { c, gameColor, placeholderAvatar, radius } from '@/theme';

export const T = ({ style, muted, size = 15, weight, children, ...p }: ComponentProps<typeof Text> & { muted?: boolean; size?: number; weight?: TextStyle['fontWeight'] }) => (
  <Text style={[{ color: muted ? c.muted : c.ink, fontSize: size, fontWeight: weight }, style]} {...p}>
    {children}
  </Text>
);
export const H = ({ children, style }: { children: ReactNode; style?: TextStyle }) => <T size={24} weight="700" style={[{ letterSpacing: -0.4 }, style]}>{children}</T>;

/** Scrollable screen with safe areas and pull-to-refresh. */
export function Screen({ children, refreshing, onRefresh, edges = ['top'], scroll = true, style, glow }: { children: ReactNode; refreshing?: boolean; onRefresh?: () => void; edges?: ('top' | 'bottom')[]; scroll?: boolean; style?: ViewStyle; glow?: boolean }) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={edges}>
      {glow && <Glow />}
      {scroll ? (
        <ScrollView
          contentContainerStyle={[{ padding: 20, gap: 20, paddingBottom: 40 }, style]}
          keyboardShouldPersistTaps="handled"
          refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={c.purple} /> : undefined}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, style]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

type BtnVariant = 'primary' | 'secondary' | 'danger' | 'gold' | 'ghost';
export function Button({ title, onPress, variant = 'primary', loading, disabled, icon, style }: { title: string; onPress?: () => void; variant?: BtnVariant; loading?: boolean; disabled?: boolean; icon?: IconName; style?: ViewStyle }) {
  const bg = { primary: c.purple, secondary: c.glass, danger: '#3a1d33', gold: c.gold, ghost: 'transparent' }[variant];
  const fg = { primary: '#fff', secondary: c.ink, danger: c.danger, gold: c.bg, ghost: c.muted }[variant];
  const off = disabled || loading;
  return (
    <Pressable
      onPress={off ? undefined : onPress}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      style={({ pressed }) => [s.btn, variant === 'primary' && s.glow, { opacity: off ? 0.5 : 1, transform: [{ scale: pressed && !off ? 0.97 : 1 }] }, style]}
    >
      {variant !== 'ghost' && <ChamferBg fill={bg} stroke={variant === 'secondary' ? c.line : undefined} cut={10} />}
      {loading ? <ActivityIndicator color={fg} /> : icon ? <Icon name={icon} size={18} color={fg} /> : null}
      <Text style={{ color: fg, fontWeight: '700', fontSize: 15 }}>{title}</Text>
    </Pressable>
  );
}

/**
 * Round icon-only button for actions whose icon says it all (follow, gift, message, add).
 * `label` is required: it is what screen readers announce and what long-press shows.
 */
export function IconButton({ icon, label, onPress, variant = 'glass', size = 48, loading, filled, badge, style }: { icon: IconName; label: string; onPress?: () => void; variant?: 'glass' | 'primary' | 'active' | 'danger'; size?: number; loading?: boolean; filled?: boolean; badge?: number; style?: ViewStyle }) {
  const bg = { glass: c.glass, primary: c.purple, active: c.pink + '26', danger: c.live }[variant];
  const fg = { glass: c.ink, primary: '#fff', active: c.pink, danger: '#fff' }[variant];
  return (
    <Pressable
      onPress={loading ? undefined : onPress}
      onLongPress={() => Alert.alert(label)}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ busy: !!loading }}
      hitSlop={6}
      style={({ pressed }) => [
        { width: size, height: size, borderRadius: size, alignItems: 'center', justifyContent: 'center', backgroundColor: bg, borderWidth: variant === 'glass' ? 1 : 0, borderColor: c.lineHi },
        variant === 'primary' && s.glow,
        { transform: [{ scale: pressed ? 0.92 : 1 }] },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : <Icon name={icon} size={Math.round(size * 0.44)} color={fg} filled={filled} />}
      {!!badge && (
        <View style={{ position: 'absolute', top: -2, right: -2, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: c.pink, borderWidth: 2, borderColor: c.bg }}>
          <Text style={{ color: '#fff', fontSize: 9, fontWeight: '800' }}>{badge > 99 ? '99+' : badge}</Text>
        </View>
      )}
    </Pressable>
  );
}

export function Input({ label, error, style, ...p }: TextInputProps & { label?: string; error?: string }) {
  return (
    <View style={{ gap: 6 }}>
      {label && <T size={13} weight="600">{label}</T>}
      <TextInput placeholderTextColor={c.faint} style={[s.input, error && { borderColor: c.danger }, style]} {...p} />
      {error && <T size={12} style={{ color: c.danger }}>{error}</T>}
    </View>
  );
}

/** Rounded glass plate — Tavern's surface. Pressable when `onPress` is given. */
export const Card = ({ children, style, onPress }: { children: ReactNode; style?: ViewStyle; onPress?: () => void }) =>
  onPress ? (
    <Pressable onPress={onPress} style={({ pressed }) => [s.card, pressed && { transform: [{ scale: 0.99 }] }, style]}>
      {({ pressed }) => (
        <>
          <ChamferBg fill={pressed ? c.surface2 : c.glass} stroke={c.line} cut={14} />
          {children}
        </>
      )}
    </Pressable>
  ) : (
    <View style={[s.card, style]}>
      <ChamferBg fill={c.glass} stroke={c.line} cut={14} />
      {children}
    </View>
  );

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'purple' | 'gold' | 'success' | 'warning' | 'danger' | 'pink' }) {
  const col = { neutral: c.muted, purple: c.purple, gold: c.gold, success: c.success, warning: c.warning, danger: c.danger, pink: c.pink }[tone];
  return (
    <View style={{ paddingHorizontal: 9, paddingVertical: 2, alignSelf: 'flex-start' }}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: col + '24', borderRadius: radius.pill }]} />
      <Text style={{ color: col, fontSize: 11, fontWeight: '600' }}>{label}</Text>
    </View>
  );
}

/** Round identity (matches the web). `ring` draws a coloured frame (following / hosting). Falls back to an illustrated avatar. */
export function Avatar({ name, uri, size = 40, status, ring }: { name: string; uri?: string; size?: number; status?: 'online' | 'busy' | 'offline'; ring?: string }) {
  const pip = Math.max(11, size * 0.28);
  return (
    <View style={{ width: size, height: size }} accessible accessibilityLabel={status ? `${name}, ${status === 'busy' ? 'in a session' : status}` : name}>
      <View style={{ flex: 1, borderRadius: size, padding: ring ? 2 : 0, backgroundColor: ring }}>
        <ExpoImage source={{ uri: uri || placeholderAvatar(name) }} style={{ flex: 1, borderRadius: size, backgroundColor: c.surface2 }} contentFit="cover" transition={150} />
      </View>
      {status && (
        <View style={{ position: 'absolute', right: 0, bottom: 0, width: pip, height: pip, borderRadius: pip, borderWidth: 2.5, borderColor: c.bg, backgroundColor: status === 'online' ? c.success : status === 'busy' ? c.warning : c.faint }} />
      )}
    </View>
  );
}

/** Official game marks, served by the web app (same files the web uses). */
const LOGOS: Record<string, string> = { valorant: 'valorant.svg', mlbb: 'mlbb.png', dota2: 'dota2.svg', 'wild-rift': 'wild-rift.svg', pubg: 'pubg.svg', codm: 'codm.svg', 'free-fire': 'free-fire.svg' };
export const gameLogo = (slug?: string) => (slug && LOGOS[slug] ? `${WEB_URL}/games/${LOGOS[slug]}` : undefined);

/** Round game token: the game's colour with its logo (initials when there's none). */
export function GameToken({ slug, name, size = 28 }: { slug?: string; name: string; size?: number }) {
  const logo = gameLogo(slug);
  return (
    <View style={{ width: size, height: size, borderRadius: size, backgroundColor: gameColor(slug)[0], alignItems: 'center', justifyContent: 'center' }} accessibilityLabel={name}>
      {logo ? (
        <ExpoImage source={{ uri: logo }} style={{ width: size * 0.64, height: size * 0.64 }} contentFit="contain" />
      ) : (
        <Text style={{ color: '#fff', fontWeight: '700', fontSize: Math.max(9, size * 0.34) }}>{name.split(/[\s:]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('')}</Text>
      )}
    </View>
  );
}

/** Night-realm backdrop: soft violet/cyan/pink glows behind a screen. Pass a game colour to tint it. */
export function Glow({ tint = c.purple }: { tint?: string }) {
  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <RadialGradient id="g1" cx="75%" cy="8%" r="70%">
          <Stop offset="0" stopColor={tint} stopOpacity="0.45" />
          <Stop offset="1" stopColor={tint} stopOpacity="0" />
        </RadialGradient>
        <RadialGradient id="g2" cx="0%" cy="100%" r="60%">
          <Stop offset="0" stopColor={c.cyan} stopOpacity="0.12" />
          <Stop offset="1" stopColor={c.cyan} stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Rect width="100%" height="100%" fill={c.bg} />
      <Rect width="100%" height="100%" fill="url(#g1)" />
      <Rect width="100%" height="100%" fill="url(#g2)" />
    </Svg>
  );
}

export function Empty({ icon, title, body, action }: { icon: IconName; title: string; body?: string; action?: ReactNode }) {
  return (
    <View style={{ alignItems: 'center', padding: 32, gap: 8 }}>
      <ChamferBg fill={c.bg2} cut={14} />
      <View style={{ width: 56, height: 56, borderRadius: 56, alignItems: 'center', justifyContent: 'center', backgroundColor: c.purple + '1F', borderWidth: 1.5, borderColor: c.purple }}>
        <Icon name={icon} size={26} color={c.purpleHi} />
      </View>
      <T weight="700" size={17}>{title}</T>
      {body && <T muted style={{ textAlign: 'center' }}>{body}</T>}
      {action}
    </View>
  );
}

export const ErrorNote = ({ error }: { error?: string | null }) =>
  error ? (
    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: c.danger + '1F', borderLeftWidth: 3, borderLeftColor: c.danger, padding: 12 }}>
      <Icon name="alert" size={18} color={c.danger} />
      <T style={{ color: c.danger, flex: 1 }} accessibilityRole="alert">{error}</T>
    </View>
  ) : null;

export const Loading = () => <ActivityIndicator color={c.purple} style={{ marginTop: 40 }} />;

export const Row = ({ children, style }: { children: ReactNode; style?: ViewStyle }) => <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 8 }, style]}>{children}</View>;

/** Gift imageUrl is an image URL or a single emoji glyph. */
export const GiftGlyph = ({ image, size = 36 }: { image: string; size?: number }) =>
  /^(https?:|\/)/.test(image) ? <Image source={{ uri: image }} style={{ width: size, height: size }} /> : <Text style={{ fontSize: size * 0.85 }}>{image}</Text>;

export function CompanionCard({ c: x }: { c: CardT }) {
  const g = x.games[0];
  return (
    <Card onPress={() => router.push(`/c/${x.username}`)} style={{ gap: 10 }}>
      <Row>
        <Avatar name={x.displayName} uri={x.avatarUrl} size={52} status={x.busy ? 'busy' : x.online ? 'online' : 'offline'} />
        <View style={{ flex: 1 }}>
          <Row style={{ gap: 4 }}>
            <T weight="700" size={16} numberOfLines={1}>{x.displayName}</T>
            {x.verified && <Icon name="verified" size={15} color="#B49CFF" label="Verified" />}
          </Row>
          <T muted size={13} numberOfLines={1}>{x.headline}</T>
          <Row style={{ gap: 4, marginTop: 2 }}>
            <Icon name="star" size={13} color={c.gold} />
            <T size={13} weight="600">{x.ratingAvg ? x.ratingAvg.toFixed(1) : 'New'}</T>
            <T muted size={12}>({x.ratingCount})</T>
          </Row>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <T muted size={11}>From</T>
          <T weight="800" size={16}>{x.startingPriceCentavos !== null ? formatPhp(x.startingPriceCentavos) : '—'}</T>
        </View>
      </Row>
      <Row style={{ flexWrap: 'wrap', gap: 6 }}>
        {g && <Badge label={g.name.split(':')[0]!} tone="purple" />}
        {g?.rank && <Badge label={g.rank} tone="gold" />}
        {g?.roles[0] && <Badge label={g.roles[0]} />}
      </Row>
    </Card>
  );
}

/**
 * Native stand-in for the web's 3D emblem: a perspective tilt + float driven on the UI thread.
 * No WebGL on native (R3F/expo-gl isn't stable on this RN version); static under reduced motion.
 */
export function FloatingEmblem({ size = 32 }: { size?: number }) {
  const reduced = useReducedMotion();
  const t = useSharedValue(0);
  useEffect(() => {
    if (!reduced) t.value = withRepeat(withTiming(1, { duration: 2600 }), -1, true);
  }, [reduced, t]);
  const st = useAnimatedStyle(() => ({
    transform: [{ perspective: 300 }, { translateY: -3 * t.value }, { rotateY: `${-25 + 50 * t.value}deg` }],
  }));
  return (
    <Animated.View style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, st]}>
      <Icon name="emblem" size={size} color={c.purple} filled />
    </Animated.View>
  );
}

/** Cyan dot that pulses while something is genuinely live; static when the OS asks for reduced motion. */
export function LiveDot({ size = 8 }: { size?: number }) {
  const reduced = useReducedMotion();
  const o = useSharedValue(1);
  useEffect(() => {
    if (!reduced) o.value = withRepeat(withTiming(0.35, { duration: 900 }), -1, true);
  }, [reduced, o]);
  const st = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[{ width: size, height: size, borderRadius: size, backgroundColor: c.cyan }, st]} />;
}

export const LiveBadge = () => (
  <Row style={{ gap: 5, backgroundColor: c.live, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' }}>
    <View style={{ width: 5, height: 5, borderRadius: 5, backgroundColor: '#fff' }} />
    <T size={10} weight="800" style={{ color: '#fff', letterSpacing: 0.6 }}>LIVE</T>
  </Row>
);

export function SectionTitle({ title, onMore, live }: { title: string; onMore?: () => void; live?: boolean }) {
  return (
    <Row style={{ justifyContent: 'space-between' }}>
      <Row>
        {live && <LiveDot />}
        <T size={17} weight="700">{title}</T>
      </Row>
      {onMore && (
        <Pressable onPress={onMore} hitSlop={10} accessibilityRole="link">
          <T muted size={13}>View all ›</T>
        </Pressable>
      )}
    </Row>
  );
}

/** Artwork-led live room card: game colour and logo, LIVE pill, title, host, seats. */
export function RoomTile({ r, width }: { r: VoiceRoom; width?: number }) {
  const [a, b] = gameColor(r.game?.slug);
  const logo = gameLogo(r.game?.slug);
  return (
    <Pressable
      onPress={() => router.push(`/room/${r.id}`)}
      accessibilityRole="button"
      accessibilityLabel={`${r.title}, live room hosted by ${r.host.displayName}`}
      style={({ pressed }) => [{ width, borderRadius: radius.card, overflow: 'hidden', backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, transform: [{ scale: pressed ? 0.98 : 1 }] }]}
    >
      <View style={{ height: 104, backgroundColor: a, padding: 10, justifyContent: 'space-between' }}>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: b, opacity: 0.45 }]} />
        {logo && <ExpoImage source={{ uri: logo }} style={{ position: 'absolute', right: 10, top: 18, width: 70, height: 46, opacity: 0.35 }} contentFit="contain" />}
        <View style={[StyleSheet.absoluteFill, { top: '45%', backgroundColor: '#06051A99' }]} />
        <Row>
          <LiveBadge />
          {r.privacy === 'invite' && <Icon name="lock" size={14} color="#fff" label="Invite only" />}
        </Row>
        <T weight="700" size={15} numberOfLines={2} style={{ color: '#fff' }}>{r.title}</T>
      </View>
      <Row style={{ padding: 10, gap: 6 }}>
        <Avatar name={r.host.displayName} uri={r.host.avatarUrl} size={22} />
        <View style={{ flex: 1 }} />
        <Icon name="users" size={13} color={c.muted} />
        <T muted size={11}>{r.participantCount}/{r.capacity}</T>
      </Row>
    </Pressable>
  );
}

/** Character card for rails: portrait over the main game's colour, name plate, rating and price. */
export function PersonTile({ c: x, width = 150 }: { c: CardT; width?: number }) {
  const g = x.games[0];
  const [a] = gameColor(g?.slug);
  return (
    <Pressable
      onPress={() => router.push(`/c/${x.username}`)}
      accessibilityRole="button"
      accessibilityLabel={x.displayName}
      style={({ pressed }) => [{ width, borderRadius: radius.card, overflow: 'hidden', backgroundColor: c.bg2, borderWidth: 1, borderColor: c.line, transform: [{ scale: pressed ? 0.98 : 1 }] }]}
    >
      <View style={{ height: width * 1.05, backgroundColor: a, justifyContent: 'flex-end' }}>
        <ExpoImage
          source={{ uri: x.avatarUrl || placeholderAvatar(x.displayName) }}
          style={{ position: 'absolute', left: '7%', right: '7%', top: '7%', bottom: 0, borderTopLeftRadius: width, borderTopRightRadius: width }}
          contentFit="cover"
          contentPosition="top"
        />
        <View style={{ padding: 8, paddingTop: 18, backgroundColor: '#110F2CCC' }}>
          <Row style={{ gap: 4 }}>
            <T weight="700" numberOfLines={1} style={{ flexShrink: 1, color: '#fff' }}>{x.displayName}</T>
            {x.verified && <Icon name="verified" size={14} color={c.purpleHi} label="Verified" />}
          </Row>
          <Row style={{ gap: 4 }}>
            <Icon name="star" size={11} color={c.gold} />
            <T size={11} weight="600">{x.ratingAvg ? x.ratingAvg.toFixed(1) : 'New'}</T>
            {x.startingPriceCentavos !== null && <T muted size={11} style={{ marginLeft: 'auto' }}>{formatPhp(x.startingPriceCentavos)}</T>}
          </Row>
        </View>
        {(x.online || x.busy) && (
          <Row style={{ position: 'absolute', top: 8, left: 8, gap: 5, backgroundColor: '#06051AAA', borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: x.busy ? c.warning : c.success }} />
            <T size={10} weight="700" style={{ color: '#fff' }}>{x.busy ? 'IN SESSION' : 'ONLINE'}</T>
          </Row>
        )}
      </View>
      {g && (
        <Row style={{ padding: 8, gap: 6 }}>
          <GameToken slug={g.slug} name={g.name} size={20} />
        </Row>
      )}
    </Pressable>
  );
}

const s = StyleSheet.create({
  btn: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 18 },
  glow: { shadowColor: c.purple, shadowOpacity: 0.6, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 8 },
  input: { minHeight: 48, borderRadius: radius.input, borderWidth: 1, borderColor: c.line, backgroundColor: c.glass, color: c.ink, paddingHorizontal: 14, fontSize: 15 },
  card: { padding: 18 },
});
