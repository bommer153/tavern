'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { type RegisterInput, registerSchema } from '@tavern/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button, ErrorNote, Field, Input } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import s from '../auth.module.css';

export default function RegisterPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<RegisterInput>({ resolver: zodResolver(registerSchema) });

  const onSubmit = handleSubmit(async (v) => {
    setError(null);
    try {
      const { user } = await api.auth.register(v);
      qc.setQueryData(['me'], user);
      router.replace('/home');
    } catch (e) {
      setError(errorMessage(e));
    }
  });
  const e = formState.errors;

  return (
    <form onSubmit={onSubmit} className={s.form} noValidate>
      <div>
        <h1 className={s.title}>Join the Tavern</h1>
        <p className={s.sub}>Find your duo. Enter your world.</p>
      </div>
      <ErrorNote error={error} />
      <div className={s.pair}>
        <Field label="Display name" error={e.displayName?.message}>
          <Input autoComplete="nickname" {...register('displayName')} />
        </Field>
        <Field label="Username" error={e.username?.message}>
          <Input autoComplete="username" {...register('username')} />
        </Field>
      </div>
      <Field label="Email" error={e.email?.message}>
        <Input type="email" autoComplete="email" {...register('email')} />
      </Field>
      <Field label="Password" error={e.password?.message} hint="At least 8 characters">
        <Input type="password" autoComplete="new-password" {...register('password')} />
      </Field>
      <Field label="Date of birth" error={e.birthDate?.message} hint="Tavern's paid marketplace is for adults (18+).">
        <Input type="date" {...register('birthDate')} />
      </Field>
      <label className={s.terms}>
        <input type="checkbox" {...register('acceptTerms')} />
        <span>
          I agree to the{' '}
          <Link href="/legal/terms" className={s.link}>
            Terms
          </Link>
          ,{' '}
          <Link href="/legal/privacy" className={s.link}>
            Privacy Policy
          </Link>{' '}
          and{' '}
          <Link href="/legal/guidelines" className={s.link}>
            Community Guidelines
          </Link>
          .
        </span>
      </label>
      {e.acceptTerms && <p className={s.err} role="alert">{e.acceptTerms.message}</p>}
      <Button type="submit" className={s.wide} size="lg" loading={formState.isSubmitting}>
        Create account
      </Button>
      <p className={s.foot}>
        Already have an account?{' '}
        <Link href="/login" className={s.link}>
          Sign in
        </Link>
      </p>
    </form>
  );
}
