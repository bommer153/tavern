import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { Button, ErrorNote, H, Input, Screen, T } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useSession } from '@/lib/session';
import { loginSchema } from '@tavern/shared';

export default function SignIn() {
  const { signIn } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const v = loginSchema.safeParse({ email, password });
    if (!v.success) return setError(v.error.issues[0]?.message ?? 'Check your details');
    setBusy(true);
    setError(null);
    try {
      await signIn(await api.auth.login(v.data));
      router.replace('/(tabs)');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen edges={['bottom']}>
        <View style={{ gap: 4, marginTop: 8 }}>
          <H>Welcome back</H>
          <T muted>Sign in to your Tavern account.</T>
        </View>
        <ErrorNote error={error} />
        <Input label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" textContentType="emailAddress" />
        <Input label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" textContentType="password" onSubmitEditing={submit} />
        <Button title="Sign in" onPress={submit} loading={busy} />
        <T muted style={{ textAlign: 'center' }}>
          New here? <T style={{ color: '#9366FF', fontWeight: '700' }} onPress={() => router.push('/register')}>Create an account</T>
        </T>
      </Screen>
    </KeyboardAvoidingView>
  );
}
