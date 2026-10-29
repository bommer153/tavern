import { ApiError, createApiClient } from '@tavern/api-client';
import * as SecureStore from 'expo-secure-store';

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
export const SOCKET_URL = process.env.EXPO_PUBLIC_SOCKET_URL ?? 'http://localhost:4000';
export const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL ?? 'http://localhost:3000';

const ACCESS = 'tavern.access';
const REFRESH = 'tavern.refresh';
// Access token is cached in memory; both tokens persist only in the OS keychain/keystore.
let access: string | null = null;

export const tokens = {
  async load() {
    access = await SecureStore.getItemAsync(ACCESS);
    return access;
  },
  async save(a: string, r: string) {
    access = a;
    await SecureStore.setItemAsync(ACCESS, a);
    await SecureStore.setItemAsync(REFRESH, r);
  },
  async clear() {
    access = null;
    await SecureStore.deleteItemAsync(ACCESS);
    await SecureStore.deleteItemAsync(REFRESH);
  },
  access: () => access,
  refresh: () => SecureStore.getItemAsync(REFRESH),
};

let onSignedOut: () => void = () => {};
export const setSignedOutHandler = (fn: () => void) => (onSignedOut = fn);

export const api = createApiClient({
  baseUrl: API_URL,
  headers: { 'x-tavern-client': 'mobile' },
  getAccessToken: () => access,
  // Rotates the refresh token; a failed refresh signs the user out.
  refresh: async () => {
    const r = await tokens.refresh();
    if (!r) return false;
    try {
      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-tavern-client': 'mobile' },
        body: JSON.stringify({ refreshToken: r }),
      });
      if (!res.ok) throw new Error();
      const t = await res.json();
      await tokens.save(t.accessToken, t.refreshToken);
      return true;
    } catch {
      await tokens.clear();
      onSignedOut();
      return false;
    }
  },
});

export { ApiError };
export const errorMessage = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong. Please try again.');
export const newKey = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
export { formatPhp } from '@tavern/shared';
