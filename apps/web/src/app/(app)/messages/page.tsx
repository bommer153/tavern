'use client';
import { MessagesLayout } from '@/components/messages';
import { RequireRole } from '@/lib/session';

export default function MessagesPage() {
  return (
    <RequireRole>
      <MessagesLayout />
    </RequireRole>
  );
}
