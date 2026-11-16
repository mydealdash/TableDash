import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, ScrollView, Text, TextInput, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api, inZone, money } from '../lib/api';
import { C, s } from '../lib/theme';
import { Badge, Button, Chip, ChipRow, Loading } from '../components/ui';
import { PartyDateTime, PDT } from '../components/PartyDateTime';
import type { RootStack } from '../../App';

export default function ReservationDetailScreen({ route, navigation }: NativeStackScreenProps<RootStack, 'ReservationDetail'>) {
  const [r, setR] = useState<any>(null);
  const [modifying, setModifying] = useState<PDT | null>(null);
  const [rating, setRating] = useState(0); const [food, setFood] = useState(0); const [service, setService] = useState(0);
  const [text, setText] = useState(''); const [reviewed, setReviewed] = useState(false);
  const load = useCallback(() => api(`/me/reservations/${route.params.id}`).then(setR), [route.params.id]);
  useEffect(() => { load(); }, [load]);
  if (!r) return <Loading />;
  const tz = r.restaurant.timezone;
  const when = inZone(r.startsAt, tz);
  const hoursLeft = (new Date(r.startsAt).getTime() - Date.now()) / 3600000;
  const late = r.policy && hoursLeft < r.policy.cancelCutoffHours;

  const cancel = () => Alert.alert('Cancel reservation?', late
    ? `You're inside the ${r.policy.cancelCutoffHours}-hour window. ${r.policy.lateCancelFeeCents ? `A ${money(r.policy.lateCancelFeeCents * r.partySize)} fee applies.` : r.policy.depositType.startsWith('DEPOSIT') ? 'Your deposit will not be refunded.' : ''}`
    : 'Free cancellation.', [
    { text: 'Keep it', style: 'cancel' },
    { text: 'Cancel reservation', style: 'destructive', onPress: async () => { await api(`/me/reservations/${r.id}/cancel`, { body: {} }); load(); } },
  ]);
  const saveModify = async () => {
    try {
      await api(`/me/reservations/${r.id}`, { method: 'PATCH', body: { date: modifying!.date, time: modifying!.time, partySize: modifying!.party } });
      setModifying(null); load(); Alert.alert('Updated', 'Your reservation has been changed.');
    } catch (e: any) { Alert.alert('Not available', e.message); }
  };
  const Stars = ({ v, set }: { v: number; set: (n: number) => void }) => (
    <ChipRow>{[1, 2, 3, 4, 5].map((n) => <Chip key={n} label={'★'.repeat(n)} on={v === n} onPress={() => set(n)} />)}</ChipRow>
  );

  return (
    <ScrollView style={s.screen} contentContainerStyle={[s.pad, { gap: 10, paddingBottom: 40 }]}>
      <Text style={s.h1}>{r.restaurant.name}</Text>
      <Badge text={r.status} color={r.status === 'CONFIRMED' ? C.ok : C.muted} />
      <View style={[s.card, { gap: 4 }]}>
        <Text style={s.body}>{when.label}</Text>
        <Text style={s.body}>Party of {r.partySize}{r.tableType ? ` · ${r.tableType.toLowerCase().replace('_', ' ')}` : ''}</Text>
        <Text style={s.muted}>Code {r.code}</Text>
        {r.specialRequest && <Text style={s.muted}>Request: {r.specialRequest}</Text>}
        <Text style={[s.muted, { marginTop: 6 }]}>{r.restaurant.address}</Text>
      </View>
      {r.policy && <Text style={s.muted}>{r.policy.text}</Text>}

      {r.status === 'CONFIRMED' && (modifying ? (
        <View style={s.card}>
          <PartyDateTime value={modifying} onChange={setModifying} />
          <Button style={{ marginTop: 12 }} title="Save changes" onPress={saveModify} />
          <Button style={{ marginTop: 8 }} kind="ghost" title="Never mind" onPress={() => setModifying(null)} />
        </View>
      ) : (
        <View style={{ gap: 8 }}>
          <Button title="Modify" kind="ghost" disabled={!!late} onPress={() => setModifying({ party: r.partySize, date: when.date, time: new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit' }).format(new Date(r.startsAt)) })} />
          {late && <Text style={s.muted}>Changes inside the cancellation window must go through the restaurant.</Text>}
          <Button title="Cancel reservation" kind="danger" onPress={cancel} />
          <Button title="Get directions" kind="ghost" onPress={() => Linking.openURL(`https://maps.google.com/?q=${encodeURIComponent(r.restaurant.address)}`)} />
          {r.restaurant.phone && <Button title="Call restaurant" kind="ghost" onPress={() => Linking.openURL(`tel:${r.restaurant.phone}`)} />}
        </View>
      ))}

      {r.status === 'COMPLETED' && !reviewed && (
        <View style={[s.card, { gap: 6 }]}>
          <Text style={s.h2}>How was it?</Text>
          <Text style={s.label}>Overall</Text><Stars v={rating} set={setRating} />
          <Text style={s.label}>Food</Text><Stars v={food} set={setFood} />
          <Text style={s.label}>Service</Text><Stars v={service} set={setService} />
          <TextInput style={[s.input, { minHeight: 80 }]} multiline placeholder="Tell other diners about your visit" value={text} onChangeText={setText} />
          <Button title="Post review" disabled={!rating} onPress={async () => {
            try { await api(`/me/reservations/${r.id}/review`, { body: { rating, foodRating: food || undefined, serviceRating: service || undefined, text } }); setReviewed(true); Alert.alert('Thanks for your review'); }
            catch (e: any) { Alert.alert('Could not post', e.message); setReviewed(true); }
          }} />
        </View>
      )}
    </ScrollView>
  );
}
