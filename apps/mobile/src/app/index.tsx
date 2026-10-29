import { Redirect } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useEffect, useState } from 'react';
import { useSession } from '@/lib/session';

/** Entry: first launch → onboarding; signed out → sign in; else → tabs. */
export default function Index() {
  const { me } = useSession();
  const [onboarded, setOnboarded] = useState<boolean | null>(null);
  useEffect(() => {
    SecureStore.getItemAsync('tavern.onboarded').then((v) => setOnboarded(v === '1'));
  }, []);
  if (onboarded === null) return null;
  if (!onboarded) return <Redirect href="/onboarding" />;
  return <Redirect href={me ? '/(tabs)' : '/sign-in'} />;
}
