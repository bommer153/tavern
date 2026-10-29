'use client';
import { useQuery } from '@tanstack/react-query';
import { Icon } from '@/components/icon';
import { Avatar, Empty, PageHeader, Skeleton, Stars } from '@/components/ui';
import { api, timeAgo } from '@/lib/api';
import { useSession } from '@/lib/session';
import k from '@/styles/layout.module.css';

export default function CompanionReviewsPage() {
  const { me } = useSession();
  const profile = useQuery({ queryKey: ['companion-self'], queryFn: () => api.companion.profile() });
  const q = useQuery({ queryKey: ['reviews', me?.id], queryFn: () => api.companions.reviews(me!.id), enabled: !!me });
  return (
    <div>
      <PageHeader title="Reviews" subtitle="What players say about your sessions." action={profile.data && <Stars value={profile.data.ratingAvg} count={profile.data.ratingCount} />} />
      {q.isPending ? (
        <Skeleton style={{ height: 160 }} />
      ) : q.data?.items.length ? (
        <ul className={k.rows}>
          {q.data.items.map((r) => (
            <li key={r.id} className={k.row} style={{ alignItems: 'flex-start' }}>
              <Avatar name={r.author.displayName} src={r.author.avatarUrl} size={34} />
              <div className={k.rowMain}>
                <div className={k.between}>
                  <p className={`${k.small} ${k.strong}`}>{r.author.displayName}</p>
                  <span className={k.cluster} style={{ gap: 6 }}>
                    <span role="img" aria-label={`${r.rating} out of 5 stars`} style={{ display: 'inline-flex', color: 'var(--tv-gold)' }}>
                      {Array.from({ length: r.rating }, (_, i) => <Icon key={i} name="star" size={13} />)}
                    </span>
                    <span className={k.fine}>{timeAgo(r.createdAt)}</span>
                  </span>
                </div>
                {r.comment && <p className={`${k.small} ${k.muted}`} style={{ marginTop: 4 }}>{r.comment}</p>}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <Empty icon="star" title="No reviews yet" body="Reviews appear after players complete sessions with you." />
      )}
    </div>
  );
}
