import { Suspense } from 'react';
import { AppShell } from '@/components/shell';
import { Skeleton } from '@/components/ui';

// The shell reads the URL (active nav state), so it streams in under Suspense.
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<Skeleton style={{ height: 64, margin: 16 }} />}>
      <AppShell>
        <Suspense fallback={<Skeleton style={{ height: 256 }} />}>{children}</Suspense>
      </AppShell>
    </Suspense>
  );
}
