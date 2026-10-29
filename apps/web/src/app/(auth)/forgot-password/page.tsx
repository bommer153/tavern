'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Button, ErrorNote, Field, Input } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import s from '../auth.module.css';

export default function ForgotPage() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'busy' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);
  if (state === 'sent')
    return (
      <div className={s.center}>
        <h1 className={s.title}>Check your inbox</h1>
        <p className={s.sub}>If an account exists for {email}, we sent a reset link. It expires in 1 hour.</p>
        <Link href="/login" className={s.link}>
          Back to sign in
        </Link>
      </div>
    );
  return (
    <form
      className={s.form}
      onSubmit={async (e) => {
        e.preventDefault();
        setState('busy');
        setError(null);
        try {
          await api.auth.forgotPassword(email);
          setState('sent');
        } catch (err) {
          setError(errorMessage(err));
          setState('idle');
        }
      }}
    >
      <h1 className={s.title}>Reset your password</h1>
      <ErrorNote error={error} />
      <Field label="Email">
        <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Button type="submit" className={s.wide} loading={state === 'busy'}>
        Send reset link
      </Button>
    </form>
  );
}
