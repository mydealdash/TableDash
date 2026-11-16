import { Share, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { inZone } from '../lib/api';
import { s, C } from '../lib/theme';
import { Button } from '../components/ui';
import type { RootStack } from '../../App';

export default function ConfirmationScreen({ route, navigation }: NativeStackScreenProps<RootStack, 'Confirmation'>) {
  const { reservation: r, restaurant } = route.params;
  const when = inZone(r.startsAt, restaurant.timezone).label;
  return (
    <View style={[s.screen, s.pad, { justifyContent: 'center', gap: 12 }]}>
      <Text style={{ fontSize: 48, textAlign: 'center' }}>✓</Text>
      <Text style={[s.h1, { textAlign: 'center' }]}>You're booked</Text>
      <View style={[s.card, { gap: 4 }]}>
        <Text style={{ fontSize: 18, fontWeight: '800' }}>{restaurant.name}</Text>
        <Text style={s.body}>{when}</Text>
        <Text style={s.body}>Party of {r.partySize}</Text>
        <Text style={s.muted}>Confirmation code <Text style={{ fontWeight: '800', color: C.ink }}>{r.code}</Text></Text>
      </View>
      <Text style={[s.muted, { textAlign: 'center' }]}>We sent a confirmation and will remind you the day before.</Text>
      <Button title="Share with your party" kind="ghost" onPress={() => Share.share({ message: `Dinner at ${restaurant.name}, ${when}, party of ${r.partySize}. Code ${r.code}.` })} />
      <Button title="View my reservations" onPress={() => navigation.navigate('Tabs', { screen: 'Reservations' } as any)} />
    </View>
  );
}
