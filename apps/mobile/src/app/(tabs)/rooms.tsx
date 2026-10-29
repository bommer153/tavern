import { useMutation, useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, Switch, useWindowDimensions, View } from 'react-native';
import { Button, Empty, ErrorNote, IconButton, Input, Loading, RoomTile, Row, Screen, T } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { c } from '@/theme';
import { Icon } from '@/components/icon';

export default function Rooms() {
  const q = useQuery({ queryKey: ['rooms'], queryFn: () => api.rooms.list(), refetchInterval: 20_000 });
  const [creating, setCreating] = useState(false);
  // Two rooms per row so more of the directory fits on screen.
  const tile = (useWindowDimensions().width - 16 * 2 - 12) / 2;
  return (
    <View style={{ flex: 1 }}>
    <Screen glow edges={[]} refreshing={q.isRefetching} onRefresh={q.refetch}>
      <ErrorNote error={q.error ? errorMessage(q.error) : null} />
      {q.isPending ? <Loading /> : q.data?.length ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>{q.data.map((r) => <RoomTile key={r.id} r={r} width={tile} />)}</View> : <Empty icon="mic" title="No live rooms" body="Start one and invite your squad." />}
      <CreateRoom open={creating} onClose={() => setCreating(false)} />
    </Screen>
    <IconButton icon="plus" label="Start a room" variant="primary" size={60} onPress={() => setCreating(true)} style={{ position: 'absolute', right: 20, bottom: 20 }} />
    </View>
  );
}

function CreateRoom({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [invite, setInvite] = useState(false);
  const m = useMutation({
    mutationFn: () => api.rooms.create({ title, description, category: 'hangout', privacy: invite ? 'invite' : 'public' }),
    onSuccess: (r) => {
      onClose();
      router.push(`/room/${r.id}`);
    },
  });
  return (
    <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: c.bg, padding: 20, gap: 16 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <T size={20} weight="800">Start a voice room</T>
          <Pressable onPress={onClose} accessibilityLabel="Close" hitSlop={10}><Icon name="close" size={24} color={c.muted} /></Pressable>
        </Row>
        <Input label="Title" value={title} onChangeText={setTitle} maxLength={60} />
        <Input label="Description" value={description} onChangeText={setDescription} multiline maxLength={500} style={{ minHeight: 80 }} />
        <Row><Switch value={invite} onValueChange={setInvite} trackColor={{ true: c.purple }} /><T>Invite only</T></Row>
        <ErrorNote error={m.error ? errorMessage(m.error) : null} />
        <Button title="Go live" onPress={() => m.mutate()} loading={m.isPending} disabled={title.trim().length < 3} />
      </View>
    </Modal>
  );
}
