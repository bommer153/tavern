'use client';
import { useQuery } from '@tanstack/react-query';
import { CardGridSkeleton, CompanionCard, PeopleGrid } from '@/components/domain';
import { Button, Empty, ErrorNote, PageHeader } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { RequireRole } from '@/lib/session';

export default function FavoritesPage() {
  const q = useQuery({ queryKey: ['following'], queryFn: () => api.companions.following() });
  const sorted = q.data && [...q.data].sort((a, b) => Number(b.online || b.busy) - Number(a.online || a.busy));
  return (
    <RequireRole>
      <PageHeader eyebrow="Your people" title="Following" subtitle="Online first, so you can jump straight in." />
      <ErrorNote error={q.error ? errorMessage(q.error) : null} onRetry={() => q.refetch()} retrying={q.isFetching} />
      {q.isPending ? (
        <CardGridSkeleton n={4} />
      ) : sorted?.length ? (
        <PeopleGrid>{sorted.map((c) => <CompanionCard key={c.userId} c={c} following />)}</PeopleGrid>
      ) : (
        !q.error && <Empty icon="heart" title="You're not following anyone yet" body="Follow companions to see when they're online and get notified about their rooms." action={<Button href="/discover">Discover people</Button>} />
      )}
    </RequireRole>
  );
}
