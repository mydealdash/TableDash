import { useEffect, useState } from 'react';
import { Alert, ScrollView, Text, TextInput, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { s } from '../lib/theme';
import { Button, Chip, ChipRow } from '../components/ui';
import type { RootStack } from '../../App';

/** Remote waitlist join (WTL-02) with live position. */
export default function WaitlistScreen({ route }: NativeStackScreenProps<RootStack, 'Waitlist'>) {
  const { user } = useAuth();
  const { restaurantId, name } = route.params;
  const [party, setParty] = useState(2);
  const [quote, setQuote] = useState<number | null>(null);
  const [guestName, setGuestName] = useState(user ? `${user.firstName} ${user.lastName}`.trim() : '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [entry, setEntry] = useState<any>(null);
  useEffect(() => { api(`/restaurants/${restaurantId}/waitlist/quote?party=${party}`).then((q) => setQuote(q.quotedMinutes)).catch(() => setQuote(null)); }, [party, restaurantId]);
  useEffect(() => {
    if (!entry) return;
    const t = setInterval(() => api(`/waitlist/${entry.id}`).then(setEntry).catch(() => {}), 15000);
    return () => clearInterval(t);
  }, [entry?.id]);

  if (entry) return (
    <View style={[s.screen, s.pad, { gap: 10 }]}>
      <Text style={s.h1}>You're on the list</Text>
      <View style={s.card}>
        <Text style={{ fontSize: 40, fontWeight: '800' }}>{entry.status === 'NOTIFIED' ? 'Table ready!' : `#${entry.position ?? '—'}`}</Text>
        <Text style={s.body}>{name} · party of {entry.partySize}</Text>
        <Text style={s.muted}>Quoted wait {entry.quotedMinutes} min. We'll text you when your table is ready.</Text>
      </View>
    </View>
  );
  return (
    <ScrollView style={s.screen} contentContainerStyle={[s.pad, { gap: 6 }]}>
      <Text style={s.h1}>Join the waitlist</Text>
      <Text style={s.body}>{name}</Text>
      <Text style={s.label}>Party</Text>
      <ChipRow>{[1, 2, 3, 4, 5, 6, 7, 8].map((n) => <Chip key={n} label={String(n)} on={party === n} onPress={() => setParty(n)} />)}</ChipRow>
      <View style={[s.card, { marginTop: 10 }]}><Text style={s.h2}>{quote == null ? 'No table fits this party' : quote === 0 ? 'No wait right now' : `About ${quote} min wait`}</Text></View>
      <Text style={s.label}>Name</Text><TextInput style={s.input} value={guestName} onChangeText={setGuestName} />
      <Text style={s.label}>Mobile</Text><TextInput style={s.input} value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+15551234567" />
      <Button style={{ marginTop: 14 }} title="Join waitlist" disabled={quote == null || !guestName || !phone} onPress={async () => {
        try { const e = await api(`/restaurants/${restaurantId}/waitlist`, { body: { guestName, guestPhone: phone, partySize: party } }); setEntry(await api(`/waitlist/${e.id}`)); }
        catch (e: any) { Alert.alert('Could not join', e.message); }
      }} />
    </ScrollView>
  );
}
