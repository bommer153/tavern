import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { View } from 'react-native';
import { Avatar, Badge, Card, Empty, Loading, Row, Screen, T } from '@/components/ui';
import { api } from '@/lib/api';
import { c } from '@/theme';

export default function Messages() {
  const q = useQuery({ queryKey: ['conversations'], queryFn: () => api.conversations.list() });
  return (
    <Screen edges={[]} refreshing={q.isRefetching} onRefresh={q.refetch}>
      {q.isPending ? <Loading /> : q.data?.length ? q.data.map((x) => (
        <Card key={x.id} onPress={() => router.push(`/chat/${x.id}`)}>
          <Row>
            <Avatar name={x.other.displayName} uri={x.other.avatarUrl} size={44} />
            <View style={{ flex: 1 }}>
              <Row><T weight="700" numberOfLines={1}>{x.other.displayName}</T>{x.type === 'order' && <Badge label="Order" tone="purple" />}</Row>
              <T muted numberOfLines={1}>{x.lastMessage ?? 'Say hi 👋'}</T>
            </View>
            {x.unread > 0 && <View style={{ backgroundColor: c.pink, borderRadius: 99, minWidth: 22, paddingHorizontal: 6, alignItems: 'center' }}><T size={12} weight="800" style={{ color: c.bg }}>{x.unread}</T></View>}
          </Row>
        </Card>
      )) : <Empty icon="chat" title="No conversations yet" body="Message a companion from their profile." />}
    </Screen>
  );
}
