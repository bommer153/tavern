'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { type LoginInput, loginSchema } from '@tavern/shared';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button, ErrorNote, Field, Input } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import s from '../auth.module.css';

export default function LoginPage() {
  const router = useRouter();
  const next = useSearchParams().get('next');
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  const onSubmit = handleSubmit(async (v) => {
    setError(null);
    try {
      const { user } = await api.auth.login(v);
      qc.setQueryData(['me'], user);
      // Only allow same-site relative redirects.
      router.replace(next?.startsWith('/') && !next.startsWith('//') ? next : '/home');
    } catch (e) {
      setError(errorMessage(e));
    }
  });

  return (
    <form onSubmit={onSubmit} className={s.form} noValidate>
      <div>
        <h1 className={s.title}>Welcome back</h1>
        <p className={s.sub}>Sign in to your Tavern account.</p>
      </div>
      <ErrorNote error={error} />
      <Field label="Email" error={formState.errors.email?.message}>
        <Input type="email" autoComplete="email" {...register('email')} />
      </Field>
      <Field label="Password" error={formState.errors.password?.message}>
        <Input type="password" autoComplete="current-password" {...register('password')} />
      </Field>
      <div className={s.right}>
        <Link href="/forgot-password" className={s.link}>
          Forgot password?
        </Link>
      </div>
      <Button type="submit" className={s.wide} size="lg" loading={formState.isSubmitting}>
        Sign in
      </Button>
      <p className={s.foot}>
        New here?{' '}
        <Link href="/register" className={s.link}>
          Create an account
        </Link>
      </p>
    </form>
  );
}
