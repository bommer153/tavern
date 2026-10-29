'use client';
import { useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import s from '../auth.module.css';

export default function VerifyPage() {
  const token = useSearchParams().get('token') ?? '';
  const qc = useQueryClient();
  const [state, setState] = useState<{ ok?: boolean; error?: string }>({});
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current) return; // tokens are single-use; avoid a double call in dev strict mode
    ran.current = true;
    api.auth
      .verifyEmail(token)
      .then(() => {
        setState({ ok: true });
        qc.invalidateQueries({ queryKey: ['me'] });
      })
      .catch((e) => setState({ error: errorMessage(e) }));
  }, [token, qc]);
  return (
    <div className={s.center}>
      <h1 className={s.title}>{state.ok ? 'Email verified' : state.error ? 'Link not valid' : 'Verifying…'}</h1>
      {state.error && <p className={s.sub}>{state.error} Sign in and request a new link from the banner.</p>}
      {(state.ok || state.error) && (
        <Button href="/home" className={s.wide}>
          Continue to Tavern
        </Button>
      )}
    </div>
  );
}
