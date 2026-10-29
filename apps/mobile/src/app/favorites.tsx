import { useQuery } from '@tanstack/react-query';
import { CompanionCard, Empty, Loading, Screen } from '@/components/ui';
import { api } from '@/lib/api';

export default function Favorites() {
  const q = useQuery({ queryKey: ['following'], queryFn: () => api.companions.following() });
  return (
    <Screen edges={['bottom']} refreshing={q.isRefetching} onRefresh={q.refetch}>
      {q.isPending ? <Loading /> : q.data?.length ? q.data.map((x) => <CompanionCard key={x.userId} c={x} />) : <Empty icon="heart" title="No favorites yet" body="Follow companions to see them here." />}
    </Screen>
  );
}
