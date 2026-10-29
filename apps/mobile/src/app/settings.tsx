import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Me } from '@tavern/shared';
import { useState } from 'react';
import { Switch } from 'react-native';
import { Button, Card, ErrorNote, Input, Row, Screen, T } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { registerPush, useSession } from '@/lib/session';
import { c } from '@/theme';

const PUSH = [['order', 'Orders'], ['message', 'Messages'], ['room', 'Room invites'], ['gift', 'Gifts'], ['payment', 'Payments'], ['payout', 'Payouts']] as const;

export default function Settings() {
  const { me } = useSession();
  return me ? <Form me={me} /> : null;
}

function Form({ me }: { me: Me }) {
  const qc = useQueryClient();
  const { signOut } = useSession();
  const [displayName, setDisplayName] = useState(me.displayName);
  const [bio, setBio] = useState(me.bio ?? '');
  const [prefs, setPrefs] = useState(me.notificationPrefs);
  const save = useMutation({ mutationFn: () => api.users.update({ displayName, bio, notificationPrefs: prefs }), onSuccess: (u) => qc.setQueryData(['me'], u) });
  const logoutAll = useMutation({ mutationFn: () => api.auth.logoutAll(), onSuccess: signOut });
  return (
    <Screen edges={['bottom']}>
      <Input label="Display name" value={displayName} onChangeText={setDisplayName} maxLength={40} />
      <Input label="Bio" value={bio} onChangeText={setBio} multiline maxLength={500} style={{ minHeight: 80 }} />
      <Card style={{ gap: 10 }}>
        <T weight="700">Push notifications</T>
        {PUSH.map(([k, label]) => (
          <Row key={k} style={{ justifyContent: 'space-between' }}>
            <T>{label}</T>
            <Switch value={prefs[`push_${k}`] !== false} onValueChange={(v) => setPrefs({ ...prefs, [`push_${k}`]: v })} trackColor={{ true: c.purple }} accessibilityLabel={`${label} push notifications`} />
          </Row>
        ))}
        <Button title="Enable push on this device" variant="secondary" onPress={registerPush} />
      </Card>
      <ErrorNote error={save.error ? errorMessage(save.error) : null} />
      <Button title={save.isSuccess ? 'Saved' : 'Save'} onPress={() => save.mutate()} loading={save.isPending} />
      <Button title="Sign out of all devices" variant="danger" onPress={() => logoutAll.mutate()} loading={logoutAll.isPending} />
    </Screen>
  );
}
