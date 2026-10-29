import { registerSchema } from '@tavern/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, Pressable, View } from 'react-native';
import { Button, ErrorNote, H, Input, Row, Screen, T } from '@/components/ui';
import { api, errorMessage, WEB_URL } from '@/lib/api';
import { useSession } from '@/lib/session';
import { c } from '@/theme';

export default function Register() {
  const { signIn } = useSession();
  const [f, setF] = useState({ displayName: '', username: '', email: '', password: '', birthDate: '' });
  const [accept, setAccept] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });

  const submit = async () => {
    // Same Zod schema the API validates with.
    const v = registerSchema.safeParse({ ...f, acceptTerms: accept });
    if (!v.success) {
      setErrors(Object.fromEntries(v.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setErrors({});
    setBusy(true);
    setError(null);
    try {
      await signIn(await api.auth.register(v.data));
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
        <H>Join the Tavern</H>
        <ErrorNote error={error} />
        <Input label="Display name" value={f.displayName} onChangeText={set('displayName')} error={errors.displayName} />
        <Input label="Username" value={f.username} onChangeText={set('username')} autoCapitalize="none" error={errors.username} />
        <Input label="Email" value={f.email} onChangeText={set('email')} autoCapitalize="none" keyboardType="email-address" error={errors.email} />
        <Input label="Password" value={f.password} onChangeText={set('password')} secureTextEntry textContentType="newPassword" error={errors.password} />
        <Input label="Date of birth (YYYY-MM-DD)" value={f.birthDate} onChangeText={set('birthDate')} placeholder="1999-04-21" keyboardType="numbers-and-punctuation" error={errors.birthDate} />
        <T muted size={12}>Tavern&apos;s paid marketplace is for adults (18+).</T>
        <Pressable onPress={() => setAccept(!accept)} accessibilityRole="checkbox" accessibilityState={{ checked: accept }}>
          <Row style={{ alignItems: 'flex-start' }}>
            <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: accept ? c.purple : c.line, backgroundColor: accept ? c.purple : 'transparent' }} />
            <T muted style={{ flex: 1 }}>
              I agree to the <T style={{ color: c.purple }} onPress={() => Linking.openURL(`${WEB_URL}/legal/terms`)}>Terms</T>, Privacy Policy and Community Guidelines.
            </T>
          </Row>
        </Pressable>
        {errors.acceptTerms && <T style={{ color: c.danger }} size={12}>{errors.acceptTerms}</T>}
        <Button title="Create account" onPress={submit} loading={busy} />
      </Screen>
    </KeyboardAvoidingView>
  );
}
