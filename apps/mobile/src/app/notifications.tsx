import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { View } from 'react-native';
import { Card, Empty, IconButton, Loading, Screen, T } from '@/components/ui';
import { api } from '@/lib/api';
import { toAppRoute } from '@/lib/session';
import { c } from '@/theme';

export default function Notifications() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['notifications', 'list'], queryFn: () => api.notifications.list() });
  const read = useMutation({ mutationFn: () => api.notifications.markRead(), onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }) });
  return (
    <Screen edges={['bottom']} refreshing={q.isRefetching} onRefresh={q.refetch}>
      <Stack.Screen options={{ headerRight: () => (q.data?.unread ? <IconButton icon="check" label="Mark all as read" size={36} onPress={() => read.mutate()} loading={read.isPending} /> : null) }} />
      {q.isPending ? <Loading /> : q.data?.items.length ? q.data.items.map((n) => (
        <Card key={n.id} onPress={n.link ? () => router.push(toAppRoute(n.link!) as never) : undefined} style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, marginTop: 6, backgroundColor: n.readAt ? 'transparent' : c.pink }} />
          <View style={{ flex: 1 }}>
            <T weight="700">{n.title}</T>
            <T muted>{n.body}</T>
          </View>
        </Card>
      )) : <Empty icon="bell" title="You're all caught up" />}
    </Screen>
  );
}
