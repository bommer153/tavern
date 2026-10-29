'use client';
import { useParams } from 'next/navigation';
import { MessagesLayout } from '@/components/messages';
import { RequireRole } from '@/lib/session';

export default function ConversationPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <RequireRole>
      <MessagesLayout activeId={id} />
    </RequireRole>
  );
}
