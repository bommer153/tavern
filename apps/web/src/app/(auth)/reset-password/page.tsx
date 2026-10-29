'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Button, ErrorNote, Field, Input } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import s from '../auth.module.css';

export default function ResetPage() {
  const token = useSearchParams().get('token') ?? '';
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className={s.form}
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await api.auth.resetPassword(token, password);
          router.replace('/login');
        } catch (err) {
          setError(errorMessage(err));
          setBusy(false);
        }
      }}
    >
      <h1 className={s.title}>Choose a new password</h1>
      <p className={s.sub}>You will be signed out of all devices.</p>
      <ErrorNote error={error} />
      <Field label="New password" hint="At least 8 characters">
        <Input type="password" minLength={8} required autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      <Button type="submit" className={s.wide} loading={busy} disabled={!token}>
        Update password
      </Button>
    </form>
  );
}
