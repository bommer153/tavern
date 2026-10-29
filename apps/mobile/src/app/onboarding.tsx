import { Icon, type IconName } from '@/components/icon';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, T } from '@/components/ui';
import { c } from '@/theme';

const SLIDES = [
  { icon: 'gamepad' as IconName, title: 'Find your duo', body: 'Hire skilled companions for ranked, coaching or casual mabar — MLBB, Valorant, Dota 2 and more.' },
  { icon: 'mic' as IconName, title: 'Enter your world', body: 'Join live voice rooms, raise your hand to speak, and meet your next squad.' },
  { icon: 'shield-check' as IconName, title: 'Play safe', body: 'Payments stay inside Tavern and are refunded automatically if a booking falls through. Never share your game password.' },
] as const;

export default function Onboarding() {
  const [i, setI] = useState(0);
  const slide = SLIDES[i]!;
  const done = async () => {
    await SecureStore.setItemAsync('tavern.onboarded', '1');
    router.replace('/sign-in');
  };
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg, padding: 24, justifyContent: 'space-between' }}>
      <T muted onPress={done} style={{ alignSelf: 'flex-end', padding: 8 }} accessibilityRole="button">Skip</T>
      <View style={{ alignItems: 'center', gap: 20 }}>
        <View style={{ width: 120, height: 120, borderRadius: 36, backgroundColor: c.purple + '22', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={slide.icon} size={56} color="#B49CFF" />
        </View>
        <T size={30} weight="800" style={{ textAlign: 'center' }}>{slide.title}</T>
        <T muted size={16} style={{ textAlign: 'center', lineHeight: 24 }}>{slide.body}</T>
      </View>
      <View style={{ gap: 16 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
          {SLIDES.map((_, j) => <View key={j} style={{ width: j === i ? 24 : 8, height: 8, borderRadius: 4, backgroundColor: j === i ? c.pink : c.line }} />)}
        </View>
        <Button title={i < SLIDES.length - 1 ? 'Next' : 'Get started'} onPress={() => (i < SLIDES.length - 1 ? setI(i + 1) : done())} />
      </View>
    </SafeAreaView>
  );
}
