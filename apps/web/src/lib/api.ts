'use client';
import { ApiError, createApiClient } from '@tavern/api-client';
import { formatPhp } from '@tavern/shared';

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
export const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL ?? 'http://localhost:4000';

/** Browser client: session lives in HTTP-only cookies; a 401 triggers one refresh attempt. */
export const api = createApiClient({
  baseUrl: API_URL,
  credentials: 'include',
  refresh: async () => {
    try {
      await fetch(`${API_URL}/auth/refresh`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: '{}' }).then((r) => {
        if (!r.ok) throw new Error();
      });
      return true;
    } catch {
      return false;
    }
  },
});

export { ApiError, formatPhp };
export const errorMessage = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong. Please try again.');
export const newKey = () => crypto.randomUUID();
export const coins = (n: number) => `${n.toLocaleString('en-PH')} coins`;

export function timeAgo(iso?: string) {
  if (!iso) return '';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}
