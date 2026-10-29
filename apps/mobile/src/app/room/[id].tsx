import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { RoomMember } from '@tavern/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, PermissionsAndroid, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon, type IconName } from '@/components/icon';
import { Avatar, Button, ErrorNote, Glow, LiveBadge, Row, T } from '@/components/ui';
import { api, ApiError, errorMessage } from '@/lib/api';
import { useSession } from '@/lib/session';
import { c, gameColor, radius } from '@/theme';

type Voice = 'off' | 'connecting' | 'connected' | 'reconnecting' | 'unavailable' | 'needs-build';
type LK = { lk: typeof import('livekit-client'); rn: typeof import('@livekit/react-native') };

let loaded: LK | null | undefined;
/** LiveKit needs native WebRTC (development build). In Expo Go this returns null and the room degrades to chat/controls only. */
async function loadVoice(): Promise<LK | null> {
  if (loaded !== undefined) return loaded;
  try {
    const rn = await import('@livekit/react-native');
    rn.registerGlobals();
    loaded = { rn, lk: await import('livekit-client') };
  } catch {
    loaded = null;
  }
  return loaded;
}

async function ensureMicPermission() {
  if (Platform.OS !== 'android') return true; // iOS shows the system prompt (NSMicrophoneUsageDescription) on first publish
  const r = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, {
    title: 'Microphone access',
    message: 'Tavern uses your microphone only while you are unmuted on stage in a voice room.',
    buttonPositive: 'Allow',
  });
  return r === PermissionsAndroid.RESULTS.GRANTED;
}

const STATUS: Record<Voice, string> = {
  off: 'Voice off',
  connecting: 'Connecting…',
  connected: 'Voice connected',
  reconnecting: 'Reconnecting…',
  unavailable: 'Voice unavailable · chat still works',
  'needs-build': 'Voice needs the Tavern app build',
};

/**
 * Voice room, fitted to one screen: header, stage grid that sizes itself to the space left,
 * one-line audience strip, fixed control bar. Description and rules live behind the info button.
 */
export default function VoiceRoom() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me, socket } = useSession();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['room', id], queryFn: () => api.rooms.get(id) });
  const [voice, setVoice] = useState<Voice>('off');
  const [mic, setMic] = useState(false);
  const [speaking, setSpeaking] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<string | null>(null);
  const [stageBox, setStageBox] = useState({ w: 0, h: 0 });
  const roomRef = useRef<import('livekit-client').Room | null>(null);
  const role = q.data?.myRole ?? null;
  const canSpeak = role === 'host' || role === 'moderator' || role === 'speaker';

  const disconnect = useCallback(async () => {
    await roomRef.current?.disconnect();
    roomRef.current = null;
    setMic(false);
    setVoice('off');
    await loaded?.rn.AudioSession.stopAudioSession().catch(() => {});
  }, []);

  const connect = useCallback(async () => {
    await disconnect();
    const mod = await loadVoice();
    if (!mod) return setVoice('needs-build');
    setVoice('connecting');
    try {
      const { token, url } = await api.rooms.token(id);
      await mod.rn.AudioSession.startAudioSession();
      const room = new mod.lk.Room();
      const E = mod.lk.RoomEvent;
      room
        .on(E.ActiveSpeakersChanged, (ps) => setSpeaking(new Set(ps.map((p) => p.identity))))
        .on(E.Reconnecting, () => setVoice('reconnecting'))
        .on(E.Reconnected, () => setVoice('connected'))
        .on(E.Disconnected, () => setVoice('off'));
      await room.connect(url, token);
      roomRef.current = room;
      setVoice('connected');
    } catch (e) {
      setVoice(e instanceof ApiError && e.status === 503 ? 'unavailable' : 'off');
      if (!(e instanceof ApiError && e.status === 503)) setNotice('Could not connect to voice. Check your connection.');
    }
  }, [id, disconnect]);

  const join = useMutation({
    mutationFn: () => api.rooms.join(id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['room', id] });
      await connect();
    },
  });

  useEffect(() => {
    if (role && voice === 'off' && !roomRef.current && q.data?.status === 'live') void connect();
  }, [role]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reconnect voice when returning to the foreground (background audio is not configured).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active' && role && roomRef.current?.state !== 'connected') void connect();
    });
    return () => sub.remove();
  }, [role, connect]);

  useEffect(() => {
    if (!socket || !role) return;
    socket.emit('room:subscribe', { roomId: id });
    const refresh = () => qc.invalidateQueries({ queryKey: ['room', id] });
    const onRole = async () => { await refresh(); await connect(); };
    const onMuted = async () => { await roomRef.current?.localParticipant.setMicrophoneEnabled(false); setMic(false); setNotice('A moderator muted you.'); };
    const onEnd = (msg: string) => async () => { await disconnect(); setNotice(msg); refresh(); };
    const removed = onEnd('You were removed from this room.');
    const closed = onEnd('This room has ended.');
    socket.on('room:members', refresh).on('room:role', onRole).on('room:muted', onMuted).on('room:removed', removed).on('room:closed', closed);
    return () => {
      socket.emit('room:unsubscribe', { roomId: id });
      socket.off('room:members', refresh).off('room:role', onRole).off('room:muted', onMuted).off('room:removed', removed).off('room:closed', closed);
    };
  }, [socket, id, role, qc, connect, disconnect]);

  useEffect(() => () => void disconnect(), [disconnect]);

  async function toggleMic() {
    if (!roomRef.current) return;
    if (!mic && !(await ensureMicPermission())) return setNotice('Microphone permission denied. Enable it in Settings to speak.');
    try {
      await roomRef.current.localParticipant.setMicrophoneEnabled(!mic);
      setMic(!mic);
    } catch {
      setNotice('Could not access the microphone.');
    }
  }

  const leave = async () => {
    await disconnect();
    await api.rooms.leave(id).catch(() => {});
    router.back();
  };

  if (q.isPending || q.error) {
    return (
      <SafeAreaView style={st.fill} edges={['top', 'bottom']}>
        <Stack.Screen options={{ headerShown: false }} />
        <Glow />
        <TopBar title="Voice room" />
        {q.error ? <View style={{ padding: 16 }}><ErrorNote error={errorMessage(q.error)} /></View> : <ActivityIndicator color={c.purple} style={{ marginTop: 40 }} />}
      </SafeAreaView>
    );
  }

  const r = q.data;
  const stage = r.members.filter((m) => m.role !== 'listener');
  const audience = r.members.filter((m) => m.role === 'listener');
  const requests = audience.filter((m) => m.handRaised);
  const mine = r.members.find((m) => m.user.id === me?.id);
  const isHost = role === 'host';

  // Stage grid sized to the space left on screen: 3 across (4 when busy), rows that fit, the rest folds into "+N".
  const cols = stage.length > 6 ? 4 : 3;
  const seatW = stageBox.w ? Math.floor(stageBox.w / cols) : 0;
  const seatH = seatW ? seatW + 18 : 0;
  const rows = seatH ? Math.max(1, Math.floor(stageBox.h / seatH)) : 1;
  const capacity = cols * rows;
  const shown = stage.length > capacity ? stage.slice(0, capacity - 1) : stage;
  const hidden = stage.length - shown.length;
  const avatar = Math.min(seatW - 22, (stageBox.h / rows) - 34, 84);

  const info = () => Alert.alert(r.title, [r.description, r.rules && `Rules\n${r.rules}`].filter(Boolean).join('\n\n') || 'No description or rules for this room.');
  const more = () =>
    Alert.alert('Room', undefined, [
      { text: 'Room info & rules', onPress: info },
      ...(isHost ? [{ text: 'End room for everyone', style: 'destructive' as const, onPress: () => api.rooms.close(id).then(() => router.back()) }] : []),
      { text: 'Cancel', style: 'cancel' as const },
    ]);

  return (
    <SafeAreaView style={st.fill} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      <Glow tint={gameColor(r.game?.slug)[0]} />

      <TopBar title={r.title} onMore={more}>
        <Row style={{ gap: 6 }}>
          {r.status === 'live' ? <LiveBadge /> : <T size={11} muted>Ended</T>}
          <Icon name="users" size={13} color={c.muted} />
          <T size={12} muted>{r.participantCount}</T>
        </Row>
      </TopBar>

      <View style={st.statusRow}>
        <View style={[st.statusPill, voice === 'connected' && { borderColor: c.success + '66' }]} accessible accessibilityLabel={notice ?? STATUS[voice]}>
          <View style={[st.dot, { backgroundColor: voice === 'connected' ? c.success : voice === 'connecting' || voice === 'reconnecting' ? c.warning : c.faint }]} />
          {(notice || (voice !== 'connected' && voice !== 'off')) && <T size={11} muted accessibilityLiveRegion="polite" numberOfLines={1}>{notice ?? STATUS[voice]}</T>}
        </View>
      </View>

      {/* Stage: fills whatever height is left between header and controls. */}
      <View style={st.stage} onLayout={(e) => setStageBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
        {seatW > 0 && (
          <View style={st.grid}>
            {shown.map((m) => <Seat key={m.user.id} m={m} width={seatW} size={avatar} speaking={speaking.has(m.user.id)} me={m.user.id === me?.id} />)}
            {hidden > 0 && (
              <View style={{ width: seatW, alignItems: 'center', gap: 6 }}>
                <View style={[st.more, { width: avatar, height: avatar, borderRadius: avatar }]}><T weight="700" size={16}>+{hidden}</T></View>
              </View>
            )}
          </View>
        )}
      </View>

      {/* Audience: one line, never grows the page. */}
      <View style={st.audience}>
        <View style={st.faces}>
          {audience.slice(0, 7).map((m, i) => (
            <View key={m.user.id} style={{ marginLeft: i ? -10 : 0, borderRadius: 40, borderWidth: 2, borderColor: m.handRaised ? c.gold : c.bg }}>
              <Avatar name={m.user.displayName} uri={m.user.avatarUrl} size={28} />
            </View>
          ))}
        </View>
        <T size={13} muted style={{ flex: 1 }} numberOfLines={1} accessibilityLabel={`${audience.length} listening, ${requests.length} want to speak`}>
          <Icon name="users" size={13} color={c.muted} /> {audience.length}{requests.length ? '   ' : ''}
        </T>
        {requests.length > 0 && (
          <Row style={{ gap: 4 }}>
            <Icon name="hand" size={14} color={c.gold} />
            <T size={13} weight="700" style={{ color: c.gold }}>{requests.length}</T>
          </Row>
        )}
      </View>

      {isHost && requests.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={st.requests}>
          {requests.map((m) => (
            <Pressable key={m.user.id} onPress={() => api.rooms.setRole(id, m.user.id, 'speaker')} style={st.request} accessibilityRole="button" accessibilityLabel={`Let ${m.user.displayName} speak`}>
              <Avatar name={m.user.displayName} uri={m.user.avatarUrl} size={24} />
              <Icon name="check" size={14} color={c.success} />
            </Pressable>
          ))}
        </ScrollView>
      )}

      <ErrorNote error={join.error ? errorMessage(join.error) : null} />

      {/* Controls: fixed to the bottom. */}
      <View style={st.controls}>
        {!role ? (
          r.status === 'live' ? <Button title="Join room" icon="mic" onPress={() => join.mutate()} loading={join.isPending} style={{ flex: 1 }} /> : <Button title="Back" variant="secondary" onPress={() => router.back()} style={{ flex: 1 }} />
        ) : (
          <>
            {canSpeak ? (
              <Control icon={mic ? 'mic' : 'mic-off'} label={mic ? 'Mute' : 'Unmute'} active={mic} onPress={toggleMic} disabled={voice !== 'connected'} big />
            ) : (
              <Control icon="hand" label={mine?.handRaised ? 'Lower hand' : 'Raise hand'} active={!!mine?.handRaised} onPress={() => api.rooms.raiseHand(id, !mine?.handRaised)} big />
            )}
            <Control icon="gift" label="Gift" onPress={() => router.push({ pathname: '/gift', params: { recipientId: r.host.id, name: r.host.displayName, context: 'room', contextId: id } })} />
            <Control icon="logout" label="Leave" danger onPress={leave} />
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

function TopBar({ title, onMore, children }: { title: string; onMore?: () => void; children?: React.ReactNode }) {
  return (
    <Row style={st.top}>
      <Pressable onPress={() => router.back()} style={st.round} accessibilityRole="button" accessibilityLabel="Back" hitSlop={8}>
        <Icon name="back" size={20} color={c.ink} />
      </Pressable>
      <View style={{ flex: 1, gap: 2 }}>
        <T weight="800" size={17} numberOfLines={1}>{title}</T>
        {children}
      </View>
      {onMore && (
        <Pressable onPress={onMore} style={st.round} accessibilityRole="button" accessibilityLabel="Room options" hitSlop={8}>
          <Icon name="more" size={20} color={c.ink} />
        </Pressable>
      )}
    </Row>
  );
}

function Seat({ m, width, size, speaking, me }: { m: RoomMember; width: number; size: number; speaking?: boolean; me?: boolean }) {
  const ring = speaking ? c.success : m.role === 'host' ? c.gold : m.role === 'moderator' ? c.purpleHi : c.line;
  return (
    <View style={{ width, alignItems: 'center', gap: 5 }}>
      <View style={[{ borderRadius: size, padding: 3, borderWidth: 2.5, borderColor: ring }, speaking && st.speaking]}>
        <Avatar name={m.user.displayName} uri={m.user.avatarUrl} size={size} />
        {m.handRaised && (
          <View style={st.hand}><Icon name="hand" size={12} color={c.bg} label="Hand raised" /></View>
        )}
      </View>
      <T size={12} weight="600" numberOfLines={1} style={{ maxWidth: width - 8 }}>
        {m.role === 'host' ? '★ ' : ''}{me ? 'You' : m.user.displayName}
      </T>
    </View>
  );
}

function Control({ icon, label, onPress, active, danger, disabled, big }: { icon: IconName; label: string; onPress: () => void; active?: boolean; danger?: boolean; disabled?: boolean; big?: boolean }) {
  const size = big ? 64 : 52;
  const bg = danger ? c.live : active ? c.purple : c.glass;
  return (
    <Pressable onPress={disabled ? undefined : onPress} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled, selected: !!active }} style={({ pressed }) => [{ alignItems: 'center', gap: 4, opacity: disabled ? 0.45 : 1, transform: [{ scale: pressed ? 0.94 : 1 }] }]}>
      <View style={[{ width: size, height: size, borderRadius: size, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', borderWidth: active || danger ? 0 : 1, borderColor: c.lineHi }, active && st.glow]}>
        <Icon name={icon} size={big ? 26 : 22} color="#fff" />
      </View>
    </Pressable>
  );
}

const st = StyleSheet.create({
  fill: { flex: 1, backgroundColor: c.bg },
  top: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12, gap: 12 },
  round: { width: 40, height: 40, borderRadius: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: c.glass, borderWidth: 1, borderColor: c.line },
  statusRow: { alignItems: 'center', paddingBottom: 6 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '90%', paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: c.glass, borderWidth: 1, borderColor: c.line },
  dot: { width: 7, height: 7, borderRadius: 7 },
  stage: { flex: 1, marginHorizontal: 16, paddingTop: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', rowGap: 18 },
  more: { alignItems: 'center', justifyContent: 'center', backgroundColor: c.glass, borderWidth: 1, borderColor: c.lineHi },
  speaking: { shadowColor: c.success, shadowOpacity: 0.8, shadowRadius: 12, elevation: 10 },
  hand: { position: 'absolute', top: -2, right: -2, width: 22, height: 22, borderRadius: 22, backgroundColor: c.gold, alignItems: 'center', justifyContent: 'center' },
  audience: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 16, marginBottom: 12, padding: 12, borderRadius: radius.card, backgroundColor: c.glass, borderWidth: 1, borderColor: c.line },
  faces: { flexDirection: 'row' },
  requests: { gap: 8, paddingHorizontal: 12, paddingBottom: 8 },
  request: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: c.glass, borderWidth: 1, borderColor: c.gold + '88' },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-evenly', paddingHorizontal: 24, paddingTop: 16, paddingBottom: 12, borderTopWidth: 1, borderTopColor: c.line, backgroundColor: '#0B0A22E6' },
  glow: { shadowColor: c.purple, shadowOpacity: 0.7, shadowRadius: 16, elevation: 10 },
});
