import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Message } from '@tavern/shared';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { T } from '@/components/ui';
import { api, newKey } from '@/lib/api';
import { useSession } from '@/lib/session';
import { c } from '@/theme';
import { Icon } from '@/components/icon';

type Pending = Message & { state?: 'sending' | 'failed' };

export default function Chat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me, socket } = useSession();
  const qc = useQueryClient();
  const conv = useQuery({ queryKey: ['conversation', id], queryFn: () => api.conversations.get(id) });
  const history = useQuery({ queryKey: ['messages', id], queryFn: () => api.conversations.messages(id) });
  const [pending, setPending] = useState<Pending[]>([]);
  const [text, setText] = useState('');
  const [typing, setTyping] = useState(false);
  const lastTyping = useRef(0);

  useEffect(() => {
    api.conversations.read(id).then(() => qc.invalidateQueries({ queryKey: ['conversations'] })).catch(() => {});
  }, [id, qc, history.data?.length]);

  useEffect(() => {
    if (!socket) return;
    let t: ReturnType<typeof setTimeout>;
    const onMsg = (m: Message) => {
      if (m.conversationId !== id) return;
      qc.setQueryData<Message[]>(['messages', id], (old = []) => (old.some((x) => x.id === m.id) ? old : [...old, m]));
      setPending((p) => p.filter((x) => x.clientId !== m.clientId));
    };
    const onTyping = (e: { conversationId: string }) => {
      if (e.conversationId !== id) return;
      setTyping(true);
      clearTimeout(t);
      t = setTimeout(() => setTyping(false), 3000);
    };
    const onConnect = () => qc.invalidateQueries({ queryKey: ['messages', id] }); // catch up after reconnect
    socket.on('message:new', onMsg);
    socket.on('typing', onTyping);
    socket.on('connect', onConnect);
    return () => {
      socket.off('message:new', onMsg);
      socket.off('typing', onTyping);
      socket.off('connect', onConnect);
      clearTimeout(t);
    };
  }, [socket, id, qc]);

  async function send(body: string, clientId = newKey()) {
    setPending((p) => [...p.filter((x) => x.clientId !== clientId), { id: clientId, clientId, body, conversationId: id, senderId: me!.id, createdAt: new Date().toISOString(), state: 'sending' }]);
    try {
      const m = await api.conversations.send(id, body, clientId); // clientId makes retries idempotent
      qc.setQueryData<Message[]>(['messages', id], (old = []) => (old.some((x) => x.id === m.id) ? old : [...old, m]));
      setPending((p) => p.filter((x) => x.clientId !== clientId));
    } catch {
      setPending((p) => p.map((x) => (x.clientId === clientId ? { ...x, state: 'failed' } : x)));
    }
  }

  const all: Pending[] = [...(history.data ?? []), ...pending.filter((p) => !history.data?.some((m) => m.clientId === p.clientId))];
  const data = [...all].reverse();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['bottom']}>
      <Stack.Screen options={{ title: conv.data?.other.displayName ?? 'Chat', headerTitle: () => (
        <View><T weight="700">{conv.data?.other.displayName ?? 'Chat'}</T>{typing && <T muted size={11}>typing…</T>}</View>
      ) }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
        <FlatList
          inverted
          data={data}
          keyExtractor={(m) => m.clientId}
          contentContainerStyle={{ padding: 12, gap: 6 }}
          renderItem={({ item: m }) => {
            const mine = m.senderId === me?.id;
            return (
              <Pressable disabled={m.state !== 'failed'} onPress={() => send(m.body, m.clientId)} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '80%', backgroundColor: mine ? c.purple : c.surface2, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8, opacity: m.state === 'sending' ? 0.6 : 1 }}>
                <T>{m.body}</T>
                <T size={10} style={{ color: mine ? '#ffffffaa' : c.faint }}>{m.state === 'failed' ? 'Failed — tap to retry' : new Date(m.createdAt).toLocaleTimeString('en-PH', { timeStyle: 'short' })}</T>
              </Pressable>
            );
          }}
        />
        <View style={{ flexDirection: 'row', gap: 8, padding: 10, borderTopWidth: 1, borderTopColor: c.line }}>
          <TextInput
            value={text}
            onChangeText={(v) => {
              setText(v);
              if (socket && Date.now() - lastTyping.current > 2000) {
                lastTyping.current = Date.now();
                socket.emit('typing', { conversationId: id });
              }
            }}
            placeholder="Write a message…"
            placeholderTextColor={c.faint}
            maxLength={2000}
            multiline
            accessibilityLabel="Message"
            style={{ flex: 1, minHeight: 44, maxHeight: 120, borderRadius: 12, borderWidth: 1, borderColor: c.line, color: c.ink, paddingHorizontal: 12, paddingVertical: 10 }}
          />
          <Pressable
            accessibilityLabel="Send"
            disabled={!text.trim()}
            onPress={() => {
              const b = text.trim();
              setText('');
              void send(b);
            }}
            style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: c.purple, alignItems: 'center', justifyContent: 'center', opacity: text.trim() ? 1 : 0.5 }}
          >
            <Icon name="send" size={18} color="#fff" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
