'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type CosmeticCollection, DEFAULT_BACKGROUND, type RoomMember } from '@tavern/shared';
import { ConnectionState, Room, RoomEvent, Track } from 'livekit-client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { type CSSProperties, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { RoomBackdrop } from '@/components/cosmetics/backdrops';
import { SEAT_STATE_LABEL, SeatFrame, type SeatState } from '@/components/cosmetics/frames';
import { useCosmetics } from '@/components/cosmetics/use-cosmetics';
import { GiftPicker } from '@/components/domain';
import { Icon, type IconName } from '@/components/icon';
import { ReportModal } from '@/components/report';
import { Tavern3DScene } from '@/components/three/stage';
import { Badge, Button, cn, ErrorNote, GiftGlyph, IconButton, Input, Menu, MenuItem, MenuSeparator, Modal, Switch } from '@/components/ui';
import { api, ApiError, errorMessage } from '@/lib/api';
import { RequireRole, useSession } from '@/lib/session';
import s from './room.module.css';

type ChatMsg = { id: string; sender: { displayName?: string }; body: string };
type GiftEvent = { transactionId: string; gift: { imageUrl: string; name: string }; quantity: number; sender: { displayName?: string }; recipient: { displayName?: string } };
type Voice = 'off' | 'connecting' | 'connected' | 'reconnecting' | 'unavailable' | 'failed';
type Sheet = 'chat' | 'people' | 'view' | 'rules' | null;

export default function VoiceRoomPage() {
  return (
    <RequireRole>
      <RoomView />
    </RequireRole>
  );
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function RoomView() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { me, socket } = useSession();
  const detail = useQuery({ queryKey: ['room', id], queryFn: () => api.rooms.get(id) });
  const look = useCosmetics();
  const [voice, setVoice] = useState<Voice>('off');
  const [micOn, setMicOn] = useState(false);
  const [micBlocked, setMicBlocked] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [deafened, setDeafened] = useState(false);
  /** identity → audio level, straight from LiveKit's ActiveSpeakersChanged. */
  const [speaking, setSpeaking] = useState<Map<string, number>>(new Map());
  /** Who is connected to audio and who has a live mic, from LiveKit participant/track events. */
  const [lk, setLk] = useState<{ ids: Set<string>; mic: Set<string> }>({ ids: new Set(), mic: new Set() });
  const [featuredId, setFeaturedId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [ended, setEnded] = useState<string | null>(null);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [giftTo, setGiftTo] = useState<{ id: string; displayName: string } | null>(null);
  const [burst, setBurst] = useState<GiftEvent | null>(null);
  const [reporting, setReporting] = useState(false);
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [unread, setUnread] = useState(0);
  const [previewTheme, setPreviewTheme] = useState<string | null | undefined>(undefined);
  const roomRef = useRef<Room | null>(null);
  const audioRef = useRef<HTMLDivElement>(null);
  const deafRef = useRef(false);
  const sheetRef = useRef<Sheet>(null);
  useEffect(() => {
    sheetRef.current = sheet;
  }, [sheet]);
  const role = detail.data?.myRole ?? null;
  const canSpeak = role === 'host' || role === 'moderator' || role === 'speaker';
  const canModerate = role === 'host' || role === 'moderator';

  const disconnect = useCallback(async () => {
    await roomRef.current?.disconnect();
    roomRef.current = null;
    setMicOn(false);
    setSpeaking(new Map());
    setLk({ ids: new Set(), mic: new Set() });
    setVoice('off');
  }, []);

  /** Fetches a short-lived token for the current role and (re)connects audio. */
  const connectVoice = useCallback(async () => {
    await disconnect();
    setVoice('connecting');
    try {
      const { token, url } = await api.rooms.token(id);
      const room = new Room({ adaptiveStream: true, dynacast: true });
      const sync = () => {
        const all = [room.localParticipant, ...room.remoteParticipants.values()];
        setLk({ ids: new Set(all.map((p) => p.identity)), mic: new Set(all.filter((p) => p.isMicrophoneEnabled).map((p) => p.identity)) });
      };
      room
        .on(RoomEvent.TrackSubscribed, (track) => {
          if (track.kind !== Track.Kind.Audio) return;
          const el = track.attach();
          el.muted = deafRef.current;
          audioRef.current?.appendChild(el);
        })
        .on(RoomEvent.TrackUnsubscribed, (track) => track.detach().forEach((el) => el.remove()))
        .on(RoomEvent.ActiveSpeakersChanged, (ps) => {
          setSpeaking(new Map(ps.map((p) => [p.identity, p.audioLevel])));
          if (ps[0]) setFeaturedId(ps[0].identity); // loudest speaker takes the spotlight and keeps it through silence
        })
        .on(RoomEvent.ConnectionStateChanged, (st) => setVoice(st === ConnectionState.Connected ? 'connected' : st === ConnectionState.Reconnecting ? 'reconnecting' : st === ConnectionState.Disconnected ? 'off' : 'connecting'))
        .on(RoomEvent.LocalTrackUnpublished, () => setMicOn(false));
      for (const e of [RoomEvent.ParticipantConnected, RoomEvent.ParticipantDisconnected, RoomEvent.TrackMuted, RoomEvent.TrackUnmuted, RoomEvent.TrackPublished, RoomEvent.TrackUnpublished, RoomEvent.LocalTrackPublished, RoomEvent.LocalTrackUnpublished, RoomEvent.Connected])
        room.on(e, sync);
      await room.connect(url, token);
      await room.startAudio(); // called from a user gesture chain → satisfies autoplay policy
      roomRef.current = room;
      sync();
    } catch (e) {
      const unavailable = e instanceof ApiError && e.status === 503;
      setVoice(unavailable ? 'unavailable' : 'failed');
      if (!unavailable) setNotice('Could not connect to voice. Check your connection and try again.');
    }
  }, [id, disconnect]);

  const join = useMutation({
    mutationFn: () => api.rooms.join(id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['room', id] });
      await connectVoice();
    },
  });

  // Chat history once; live messages arrive over the socket below.
  useEffect(() => {
    api.rooms.messages(id).then(setMsgs).catch(() => {});
  }, [id]);

  // Socket subscription for room metadata, chat and gifts.
  useEffect(() => {
    if (!socket || !role) return;
    socket.emit('room:subscribe', { roomId: id });
    const refresh = () => qc.invalidateQueries({ queryKey: ['room', id] });
    const onRole = async () => {
      await refresh();
      await connectVoice(); // new token carries the new publish permission
    };
    const onMuted = async () => {
      await roomRef.current?.localParticipant.setMicrophoneEnabled(false);
      setMicOn(false);
      setNotice('A moderator muted your microphone.');
    };
    const onRemoved = async () => {
      await disconnect();
      setEnded('You were removed from this room.');
      refresh();
    };
    const onClosed = async () => {
      await disconnect();
      setEnded('This room has ended.');
      refresh();
    };
    const onGift = (g: GiftEvent) => {
      setBurst(g);
      setTimeout(() => setBurst((b) => (b?.transactionId === g.transactionId ? null : b)), 2600);
    };
    const onMessage = (m: ChatMsg) => {
      setMsgs((p) => (p.some((x) => x.id === m.id) ? p : [...p.slice(-199), m]));
      if (sheetRef.current !== 'chat') setUnread((n) => n + 1);
    };
    const onConnect = () => socket.emit('room:subscribe', { roomId: id });
    socket.on('room:members', refresh).on('room:role', onRole).on('room:muted', onMuted).on('room:removed', onRemoved).on('room:closed', onClosed).on('room:gift', onGift).on('room:message', onMessage).on('connect', onConnect);
    return () => {
      socket.emit('room:unsubscribe', { roomId: id });
      socket.off('room:members', refresh).off('room:role', onRole).off('room:muted', onMuted).off('room:removed', onRemoved).off('room:closed', onClosed).off('room:gift', onGift).off('room:message', onMessage).off('connect', onConnect);
    };
  }, [socket, id, role, qc, connectVoice, disconnect]);

  // Already a member (e.g. host after creating, or page refresh): reconnect audio.
  useEffect(() => {
    if (role && voice === 'off' && !roomRef.current && detail.data?.status === 'live') void connectVoice();
  }, [role]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => void roomRef.current?.disconnect(), []);

  async function toggleMic() {
    const room = roomRef.current;
    if (!room) return;
    setMicError(null);
    try {
      await room.localParticipant.setMicrophoneEnabled(!micOn);
      setMicOn(!micOn);
      setMicBlocked(false);
    } catch (e) {
      const blocked = (e as Error).name === 'NotAllowedError';
      setMicBlocked(blocked);
      setMicError(blocked ? 'Microphone access is blocked. Allow it in your browser’s site settings, then tap the mic again.' : 'No microphone found. Connect one and try again.');
    }
  }

  function toggleDeafen() {
    deafRef.current = !deafened;
    setDeafened(!deafened);
    audioRef.current?.querySelectorAll('audio').forEach((a) => (a.muted = deafRef.current));
  }

  async function leave() {
    await disconnect();
    await api.rooms.leave(id).catch(() => {});
    router.push('/rooms');
  }

  // Layout metrics: seat sizes and how many fit, recomputed from the real viewport so nothing ever scrolls.
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 390, h: 760, sw: 390, sh: 300 });
  useLayoutEffect(() => {
    const ro = new ResizeObserver(() => {
      const r = rootRef.current?.getBoundingClientRect();
      const st = stageRef.current?.getBoundingClientRect();
      if (r) setBox({ w: r.width, h: r.height, sw: st?.width ?? r.width, sh: st?.height ?? r.height / 3 });
    });
    if (rootRef.current) ro.observe(rootRef.current);
    if (stageRef.current) ro.observe(stageRef.current);
    return () => ro.disconnect();
  }, [detail.isSuccess]);

  if (detail.isPending)
    return (
      <div className={s.room}>
        <RoomBackdrop theme={look.appearance.background} animated={false} />
        <p className={s.loading} role="status">
          <Icon name="spinner" size={22} className={s.spin} /> Opening room…
        </p>
      </div>
    );
  if (detail.error)
    return (
      <div className={s.room}>
        <RoomBackdrop theme={DEFAULT_BACKGROUND} animated={false} />
        <div className={s.endCard}>
          <ErrorNote error={errorMessage(detail.error)} onRetry={() => detail.refetch()} retrying={detail.isFetching} />
          <Button variant="secondary" href="/rooms" icon="back">Back to rooms</Button>
        </div>
      </div>
    );

  const r = detail.data;
  const stage = r.members.filter((m) => m.role !== 'listener');
  const audience = r.members.filter((m) => m.role === 'listener');
  const hands = audience.filter((m) => m.handRaised);
  const meM = r.members.find((m) => m.user.id === me?.id);
  const featured = stage.find((m) => m.user.id === featuredId) ?? stage.find((m) => m.role === 'host') ?? stage[0];
  const connected = voice === 'connected';
  const levelOf = (uid: string) => speaking.get(uid) ?? 0;
  const loudest = Math.max(0, ...speaking.values());
  const seatState = (m: RoomMember): SeatState => {
    if (!connected) return 'idle';
    const uid = m.user.id;
    if (!lk.ids.has(uid)) return 'offline';
    if (speaking.has(uid)) return 'speaking';
    if (m.role !== 'listener' && !lk.mic.has(uid)) return 'muted';
    return 'idle';
  };

  // Personal view wins only when the room allows it and the user opted out of the room theme.
  const a = look.appearance;
  const roomTheme = previewTheme !== undefined ? previewTheme : r.theme.background;
  const theme = r.theme.allowPersonal && !a.followRoomTheme ? a.background : (roomTheme ?? (r.theme.allowPersonal ? a.background : DEFAULT_BACKGROUND));

  // Seat sizing: portrait stacks stage over seats; short landscape puts them side by side.
  const landscape = box.w > box.h && box.h < 560;
  const seat = Math.round(clamp(landscape ? box.h * 0.15 : box.h * 0.085, 40, 72));
  const cellW = seat + 22;
  const stripW = landscape ? box.w * 0.5 - 24 : box.w - 24;
  const cols = Math.max(3, Math.floor((stripW + 6) / (cellW + 6)));
  const rows = landscape ? Math.max(1, Math.floor((box.h - 150) / (seat + 30))) : box.h >= 760 ? 2 : 1;
  const preview = [...stage.filter((m) => m !== featured), ...audience];
  const capacity = cols * rows;
  const shown = preview.length > capacity ? preview.slice(0, capacity - 1) : preview;
  const extra = preview.length - shown.length;
  const feat = Math.round(clamp(Math.min(box.sh * 0.66, box.sw * 0.56), 84, 230));

  const giftTarget = [featured, ...stage].find((m) => m && m.user.id !== me?.id);
  const lastMsg = msgs[msgs.length - 1];
  const vs = VOICE[voice];
  const endedMsg = ended ?? (r.status === 'closed' ? 'This room has ended.' : null);

  return (
    <div ref={rootRef} className={cn(s.room, landscape && s.landscape)} style={{ '--seat': `${seat}px` } as CSSProperties}>
      <div ref={audioRef} hidden aria-hidden />
      <RoomBackdrop theme={theme} level={connected ? loudest : 0} animated={a.animated} intensity={a.intensity} parallax={a.parallax} />

      <header className={s.head}>
        <IconButton icon="back" label="Back to rooms" href="/rooms" className={s.glassBtn} />
        <div className={s.ident}>
          {r.game && <p className={s.game}>{r.game.name}</p>}
          <h1 className={s.title}>{r.title}</h1>
          <div className={s.meta}>
            {r.status === 'live' ? (
              <span className={s.live}>
                <i aria-hidden /> LIVE
              </span>
            ) : (
              <Badge>Ended</Badge>
            )}
            <button type="button" className={s.count} onClick={() => setSheet('people')} aria-label={`${r.participantCount} of ${r.capacity} people in the room. Show everyone`}>
              <Icon name="users" size={14} /> {r.participantCount}
              <span className={s.cap}>/{r.capacity}</span>
            </button>
            <span className={cn(s.vchip, s[`v-${voice}`])} role="status">
              <Icon name={vs.icon} size={13} className={voice === 'connecting' || voice === 'reconnecting' ? s.spin : undefined} /> {vs.label}
            </span>
          </div>
        </div>
        <Menu label="Room options" trigger={(p) => <IconButton icon="more" label="Room options" className={s.glassBtn} {...p} />}>
          <MenuItem icon="palette" onClick={() => setSheet('view')}>{canModerate ? 'View & room theme' : 'View settings'}</MenuItem>
          {r.rules && <MenuItem icon="flag" onClick={() => setSheet('rules')}>Room rules</MenuItem>}
          <MenuItem icon="shield-alert" onClick={() => setReporting(true)}>Report room</MenuItem>
          {role === 'host' && (
            <>
              <MenuSeparator />
              <MenuItem
                icon="close"
                danger
                onClick={async () => {
                  if (!confirm('End this room for everyone?')) return;
                  await api.rooms.close(id).catch((e) => setNotice(errorMessage(e)));
                }}
              >
                End room for everyone
              </MenuItem>
            </>
          )}
        </Menu>
      </header>

      <section ref={stageRef} className={s.stage} aria-label="Speaker stage">
        {(notice || micError || voice === 'unavailable' || voice === 'failed' || previewTheme !== undefined) && (
          <div className={s.toasts}>
            {previewTheme !== undefined && <p className={s.toast}><Icon name="palette" size={15} /> Previewing room theme — only you can see this</p>}
            {voice === 'unavailable' && <p className={s.toast}><Icon name="signal-off" size={15} /> Voice is temporarily unavailable. Chat still works.</p>}
            {micError && (
              <p className={cn(s.toast, s.toastWarn)} role="alert">
                <Icon name="mic-off" size={15} /> {micError}
              </p>
            )}
            {notice && (
              <p className={s.toast} role="status">
                {notice}
                <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss">
                  <Icon name="close" size={14} />
                </button>
              </p>
            )}
          </div>
        )}
        {featured ? (
          <div className={s.feature}>
            <div className={s.orb} style={{ width: feat * 1.7, height: feat * 1.7 }}>
              {/* Pulses only from LiveKit's real speaker events and measured levels. */}
              <Tavern3DScene scene="voice" speakers={speaking.size} connected={connected} level={levelOf(featured.user.id)} bare />
            </div>
            <SeatFrame frame={featured.frame} name={featured.user.displayName} src={featured.user.avatarUrl} size={feat} state={seatState(featured)} level={levelOf(featured.user.id)} />
            <p className={s.featName}>
              {featured.user.displayName}
              {featured.role !== 'speaker' && <span className={cn(s.role, featured.role === 'host' && s.roleHost)}>{featured.role}</span>}
            </p>
            <p className={s.featState} aria-live="polite">{SEAT_STATE_LABEL[seatState(featured)] || (connected ? 'on stage' : '')}</p>
          </div>
        ) : (
          <p className={s.emptyStage}>No one is on stage yet.</p>
        )}
      </section>

      <section className={s.seats} aria-label="Participants" style={{ '--cols': cols } as CSSProperties}>
        {shown.map((m) => (
          <button key={m.user.id} type="button" className={s.seat} onClick={() => setSheet('people')} aria-label={`${m.user.displayName}, ${m.role}${SEAT_STATE_LABEL[seatState(m)] ? `, ${SEAT_STATE_LABEL[seatState(m)]}` : ''}${m.handRaised ? ', hand raised' : ''}`}>
            <SeatFrame frame={m.frame} name={m.user.displayName} src={m.user.avatarUrl} size={seat} state={seatState(m)} level={levelOf(m.user.id)} />
            {m.handRaised && <Icon name="hand" size={14} className={s.hand} />}
            <span className={s.seatName}>{m.user.id === me?.id ? 'You' : m.user.displayName}</span>
          </button>
        ))}
        {extra > 0 && (
          <button type="button" className={cn(s.seat, s.more)} onClick={() => setSheet('people')} aria-label={`Show ${extra} more participants`}>
            <span style={{ width: seat, height: seat }}>+{extra}</span>
            <span className={s.seatName}>more</span>
          </button>
        )}
      </section>

      <button type="button" className={s.activity} onClick={() => (canModerate && hands.length ? setSheet('people') : setSheet('chat'))} aria-label="Room activity — open chat">
        {burst ? (
          <span className={s.actGift}>
            <GiftGlyph image={burst.gift.imageUrl} size={18} /> {burst.sender.displayName} sent {burst.quantity}× {burst.gift.name} to {burst.recipient.displayName}
          </span>
        ) : canModerate && hands.length ? (
          <span>
            <Icon name="hand" size={15} /> {hands.length} {hands.length === 1 ? 'person wants' : 'people want'} to speak
          </span>
        ) : lastMsg ? (
          <span>
            <b>{lastMsg.sender.displayName}</b> {lastMsg.body}
          </span>
        ) : (
          <span className={s.muted}>{r.chatEnabled ? 'Say hi in the room chat' : 'Chat is off in this room'}</span>
        )}
      </button>

      <nav className={s.dock} aria-label="Room controls">
        {!role && r.status === 'live' ? (
          <Button size="lg" className={s.primary} loading={join.isPending} onClick={() => join.mutate()} icon="mic">Join Room</Button>
        ) : voice === 'off' || voice === 'failed' ? (
          <Button size="lg" className={s.primary} disabled={!role || r.status !== 'live'} onClick={connectVoice} icon="retry">Reconnect</Button>
        ) : canSpeak ? (
          <button
            type="button"
            className={cn(s.mic, micOn && s.micOn, micBlocked && s.micBlocked)}
            onClick={toggleMic}
            disabled={!connected}
            aria-pressed={micOn}
            aria-label={micBlocked ? 'Microphone blocked. Try again' : micOn ? 'Mute microphone' : 'Unmute microphone'}
          >
            <Icon name={micBlocked ? 'lock' : micOn ? 'mic' : 'mic-off'} size={22} />
            <span>{micBlocked ? 'Blocked' : micOn ? 'Mute' : 'Unmute'}</span>
          </button>
        ) : (
          <button type="button" className={cn(s.mic, meM?.handRaised && s.micOn)} onClick={() => api.rooms.raiseHand(id, !meM?.handRaised).catch((e) => setNotice(errorMessage(e)))} aria-pressed={!!meM?.handRaised}>
            <Icon name="hand" size={22} />
            <span>{meM?.handRaised ? 'Lower hand' : 'Raise hand'}</span>
          </button>
        )}
        <DockBtn icon={deafened ? 'volume-off' : 'volume'} label={deafened ? 'Turn room audio on' : 'Turn room audio off'} pressed={deafened} onClick={toggleDeafen} disabled={!connected} />
        <DockBtn icon="chat" label={unread ? `Chat, ${unread} new` : 'Chat'} dot={unread > 0} onClick={() => { setSheet('chat'); setUnread(0); }} />
        <DockBtn icon="gift" label={giftTarget ? `Send a gift to ${giftTarget.user.displayName}` : 'No one to gift yet'} disabled={!role || !giftTarget || r.status !== 'live'} onClick={() => giftTarget && setGiftTo({ id: giftTarget.user.id, displayName: giftTarget.user.displayName })} />
        <button type="button" className={s.leave} onClick={leave} aria-label="Leave room">
          <Icon name="logout" size={20} />
          <span>Leave</span>
        </button>
      </nav>

      {burst && (
        <div className={s.burst} aria-live="polite">
          <GiftGlyph image={burst.gift.imageUrl} size={120} />
        </div>
      )}

      {endedMsg && (
        <div className={s.endOverlay} role="dialog" aria-modal aria-labelledby="ended">
          <div className={cn('tv-plate', s.endCard)}>
            <Icon name="signal-off" size={28} />
            <p id="ended" className={s.endTitle}>{endedMsg}</p>
            <Button href="/rooms" icon="back">Back to rooms</Button>
          </div>
        </div>
      )}

      <Modal open={sheet === 'chat'} onClose={() => setSheet(null)} title="Room chat">
        <RoomChat id={id} msgs={msgs} canSend={!!role && r.status === 'live' && r.chatEnabled} enabled={r.chatEnabled} />
      </Modal>
      <Modal open={sheet === 'people'} onClose={() => setSheet(null)} title={`In the room · ${r.members.length}`}>
        <People
          roomId={id}
          meId={me?.id}
          role={role}
          stage={stage}
          audience={audience}
          hands={hands}
          stateOf={seatState}
          onGift={(m) => setGiftTo({ id: m.user.id, displayName: m.user.displayName })}
          canGift={!!role && r.status === 'live'}
        />
      </Modal>
      <Modal open={sheet === 'view'} onClose={() => { setSheet(null); setPreviewTheme(undefined); }} title={canModerate ? 'View & room theme' : 'View settings'}>
        <ViewSettings roomId={id} theme={r.theme} canModerate={canModerate} look={look} preview={previewTheme} onPreview={setPreviewTheme} onDone={() => { setPreviewTheme(undefined); qc.invalidateQueries({ queryKey: ['room', id] }); }} />
      </Modal>
      <Modal open={sheet === 'rules'} onClose={() => setSheet(null)} title="Room rules">
        <p className={s.rules}>{r.rules}</p>
      </Modal>
      {giftTo && <GiftPicker open onClose={() => setGiftTo(null)} recipient={giftTo} context="room" contextId={id} />}
      <ReportModal open={reporting} onClose={() => setReporting(false)} targetType="room" targetId={id} />
    </div>
  );
}

const VOICE: Record<Voice, { label: string; icon: IconName }> = {
  connected: { label: 'Audio on', icon: 'signal' },
  connecting: { label: 'Connecting', icon: 'spinner' },
  reconnecting: { label: 'Reconnecting', icon: 'spinner' },
  unavailable: { label: 'Chat only', icon: 'signal-off' },
  failed: { label: 'No audio', icon: 'signal-off' },
  off: { label: 'Disconnected', icon: 'signal-off' },
};

function DockBtn({ icon, label, onClick, pressed, dot, disabled }: { icon: IconName; label: string; onClick: () => void; pressed?: boolean; dot?: boolean; disabled?: boolean }) {
  return (
    <button type="button" className={cn(s.dockBtn, pressed && s.dockOn)} onClick={onClick} aria-label={label} aria-pressed={pressed} disabled={disabled} title={label}>
      <Icon name={icon} size={21} />
      {dot && <i className={s.dot} aria-hidden />}
    </button>
  );
}

function People({
  roomId,
  meId,
  role,
  stage,
  audience,
  hands,
  stateOf,
  onGift,
  canGift,
}: {
  roomId: string;
  meId?: string;
  role: string | null;
  stage: RoomMember[];
  audience: RoomMember[];
  hands: RoomMember[];
  stateOf: (m: RoomMember) => SeatState;
  onGift: (m: RoomMember) => void;
  canGift: boolean;
}) {
  const canModerate = role === 'host' || role === 'moderator';
  const [err, setErr] = useState<string | null>(null);
  const act = (p: Promise<unknown>) => p.catch((e) => setErr(errorMessage(e)));
  const row = (m: RoomMember) => {
    const st = stateOf(m);
    const mine = m.user.id === meId;
    return (
      <li key={m.user.id} className={s.person}>
        <SeatFrame frame={m.frame} name={m.user.displayName} src={m.user.avatarUrl} size={44} state={st} />
        <span className={s.personText}>
          <b>{mine ? `${m.user.displayName} (you)` : m.user.displayName}</b>
          <span>
            {m.role}
            {SEAT_STATE_LABEL[st] && ` · ${SEAT_STATE_LABEL[st]}`}
            {m.handRaised && ' · hand raised'}
          </span>
        </span>
        {!mine && canGift && <IconButton icon="gift" label={`Send a gift to ${m.user.displayName}`} onClick={() => onGift(m)} />}
        {!mine && canModerate && m.role !== 'host' && (
          <Menu label={`Manage ${m.user.displayName}`} trigger={(p) => <IconButton icon="sliders" label={`Manage ${m.user.displayName}`} {...p} />}>
            {m.role === 'listener' && <MenuItem icon="mic" onClick={() => act(api.rooms.setRole(roomId, m.user.id, 'speaker'))}>Invite to speak</MenuItem>}
            {m.role === 'speaker' && <MenuItem icon="users" onClick={() => act(api.rooms.setRole(roomId, m.user.id, 'listener'))}>Move to audience</MenuItem>}
            {role === 'host' && m.role !== 'moderator' && <MenuItem icon="shield" onClick={() => act(api.rooms.setRole(roomId, m.user.id, 'moderator'))}>Make moderator</MenuItem>}
            {m.role !== 'listener' && <MenuItem icon="mic-off" onClick={() => act(api.rooms.mute(roomId, m.user.id))}>Mute</MenuItem>}
            <MenuItem icon="ban" danger onClick={() => confirm(`Remove ${m.user.displayName} from this room?`) && act(api.rooms.remove(roomId, m.user.id))}>Remove from room</MenuItem>
          </Menu>
        )}
      </li>
    );
  };
  return (
    <div className={s.people}>
      <ErrorNote error={err} />
      {canModerate && hands.length > 0 && (
        <section>
          <h3 className={s.group}>Requests to speak · {hands.length}</h3>
          <ul>
            {hands.map((m) => (
              <li key={m.user.id} className={s.person}>
                <SeatFrame frame={m.frame} name={m.user.displayName} src={m.user.avatarUrl} size={44} />
                <span className={s.personText}><b>{m.user.displayName}</b></span>
                <Button size="sm" onClick={() => act(api.rooms.setRole(roomId, m.user.id, 'speaker'))}>Approve</Button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section>
        <h3 className={s.group}>On stage · {stage.length}</h3>
        <ul>{stage.map(row)}</ul>
      </section>
      {audience.length > 0 && (
        <section>
          <h3 className={s.group}>Listening · {audience.length}</h3>
          <ul>{audience.map(row)}</ul>
        </section>
      )}
    </div>
  );
}

function RoomChat({ id, msgs, canSend, enabled }: { id: string; msgs: ChatMsg[]; canSend: boolean; enabled: boolean }) {
  const [text, setText] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const log = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Scroll the chat log only, never the room.
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [msgs.length]);
  return (
    <div className={s.chat}>
      <div ref={log} className={s.chatLog} aria-live="polite">
        {msgs.length ? msgs.map((m) => (
          <p key={m.id}>
            <b>{m.sender.displayName}</b> {m.body}
          </p>
        )) : <p className={s.muted}>{enabled ? 'No messages yet.' : 'Chat is off in this room.'}</p>}
      </div>
      <form
        className={s.chatForm}
        onSubmit={async (e) => {
          e.preventDefault();
          const body = text.trim();
          if (!body) return;
          setText('');
          setErr(null);
          await api.rooms.sendMessage(id, body).catch((x) => setErr(errorMessage(x)));
        }}
      >
        <Input disabled={!canSend} value={text} onChange={(e) => setText(e.target.value)} maxLength={500} placeholder={canSend ? 'Say something…' : enabled ? 'Join to chat' : 'Chat is off'} aria-label="Room chat message" enterKeyHint="send" />
        <Button type="submit" disabled={!canSend || !text.trim()} aria-label="Send message" icon="send" />
      </form>
      {err && <p className={s.chatErr} role="alert">{err}</p>}
    </div>
  );
}

function ViewSettings({
  roomId,
  theme,
  canModerate,
  look,
  preview,
  onPreview,
  onDone,
}: {
  roomId: string;
  theme: { background: string | null; allowPersonal: boolean };
  canModerate: boolean;
  look: ReturnType<typeof useCosmetics>;
  preview: string | null | undefined;
  onPreview: (k: string | null | undefined) => void;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const a = look.appearance;
  const [allow, setAllow] = useState(theme.allowPersonal);
  const backgrounds = (look.data?.items ?? []).filter((c) => c.kind === 'background' && look.owned.has(c.key));
  const apply = useMutation({ mutationFn: (bg: string | null) => api.rooms.setTheme(roomId, { background: bg, allowPersonal: allow }), onSuccess: onDone });
  const chosen = preview !== undefined ? preview : theme.background;
  return (
    <div className={s.view}>
      <section>
        <h3 className={s.group}>Your view</h3>
        {theme.allowPersonal ? (
          <Switch label="Use the room’s theme" checked={a.followRoomTheme} onChange={(e) => look.save.mutate({ followRoomTheme: e.target.checked })} />
        ) : (
          <p className={s.muted}>The host has set one theme for everyone in this room.</p>
        )}
        {theme.allowPersonal && !a.followRoomTheme && (
          <ThemeRow items={backgrounds} value={a.background} onPick={(k) => k && look.save.mutate({ background: k })} label="Your background" />
        )}
        <Switch label="Animated background" checked={a.animated} onChange={(e) => look.save.mutate({ animated: e.target.checked })} />
        <Switch label="Parallax" checked={a.parallax} disabled={!a.animated} onChange={(e) => look.save.mutate({ parallax: e.target.checked })} />
        <label className={s.range}>
          <span>Background brightness</span>
          <input
            type="range"
            min={20}
            max={100}
            step={5}
            value={a.intensity}
            // Live preview while dragging; saved once on release.
            onChange={(e) => qc.setQueryData<CosmeticCollection>(['cosmetics', 'me'], (c) => c && { ...c, appearance: { ...c.appearance, intensity: Number(e.target.value) } })}
            onPointerUp={(e) => look.save.mutate({ intensity: Number(e.currentTarget.value) })}
            onKeyUp={(e) => look.save.mutate({ intensity: Number(e.currentTarget.value) })}
          />
        </label>
        <Link href="/customize" target="_blank" className={s.link}>
          <Icon name="palette" size={16} /> Seat frames & full collection <Icon name="external" size={14} />
        </Link>
        <ErrorNote error={look.save.error ? errorMessage(look.save.error) : null} />
      </section>
      {canModerate && (
        <section>
          <h3 className={s.group}>Room theme · everyone</h3>
          <ThemeRow items={backgrounds} value={chosen} onPick={onPreview} label="Room theme" withDefault />
          <Switch label="Let members use their own backgrounds" checked={allow} onChange={(e) => setAllow(e.target.checked)} />
          <ErrorNote error={apply.error ? errorMessage(apply.error) : null} />
          <div className={s.actions}>
            <Button variant="ghost" onClick={() => { onPreview(undefined); setAllow(theme.allowPersonal); }}>Cancel</Button>
            <Button variant="secondary" loading={apply.isPending && apply.variables === null} onClick={() => apply.mutate(null)}>Reset to default</Button>
            <Button loading={apply.isPending && apply.variables !== null} onClick={() => apply.mutate(chosen ?? null)}>Apply</Button>
          </div>
        </section>
      )}
    </div>
  );
}

function ThemeRow({ items, value, onPick, label, withDefault }: { items: { key: string; name: string }[]; value: string | null | undefined; onPick: (k: string | null) => void; label: string; withDefault?: boolean }) {
  return (
    <div className={s.themes} role="radiogroup" aria-label={label}>
      {withDefault && (
        <button type="button" role="radio" aria-checked={!value} className={s.theme} onClick={() => onPick(null)}>
          <span className={s.thumb}><RoomBackdrop theme={DEFAULT_BACKGROUND} animated={false} /></span>
          <span>Default</span>
        </button>
      )}
      {items.filter((b) => !withDefault || b.key !== DEFAULT_BACKGROUND).map((b) => (
        <button key={b.key} type="button" role="radio" aria-checked={value === b.key} className={s.theme} onClick={() => onPick(b.key)}>
          <span className={s.thumb}><RoomBackdrop theme={b.key} animated={false} /></span>
          <span>{b.name}</span>
        </button>
      ))}
    </div>
  );
}
