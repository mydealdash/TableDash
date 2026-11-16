import { useCallback, useEffect, useState } from 'react';
import { Alert, Image, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api, ApiError, money, price, randomKey } from '../lib/api';
import { useAuth } from '../lib/auth';
import { C, s } from '../lib/theme';
import { Button, Chip, ChipRow, Loading, SlotButton } from '../components/ui';
import { PartyDateTime, PDT } from '../components/PartyDateTime';
import type { RootStack } from '../../App';
import { GListing, GoogleRatingLine, GoogleReviews, PhotoGallery } from '../components/GoogleContent';

const AREA: Record<string, string> = { DINING_ROOM: 'Dining room', BAR: 'Bar', PATIO: 'Patio', COUNTER: 'Counter' };
const PERIODS = [['All day', '00:00', '23:59'], ['Brunch', '10:00', '15:00'], ['Early', '16:00', '18:29'], ['Prime', '18:30', '20:29'], ['Late', '20:30', '23:59']] as const;

export default function RestaurantScreen({ route, navigation }: NativeStackScreenProps<RootStack, 'Restaurant'>) {
  const { user } = useAuth();
  const [r, setR] = useState<any>(null);
  const [google, setGoogle] = useState<GListing | null>(null);
  const [pdt, setPdt] = useState<PDT>({ party: route.params.party ?? 2, date: route.params.date, time: route.params.time ?? '19:00' });
  const [area, setArea] = useState<string | null>(null);
  const [period, setPeriod] = useState(0);
  const [slots, setSlots] = useState<any[] | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => { api(`/discovery/restaurants/${route.params.slug}`).then((x) => { setR(x); navigation.setOptions({ title: x.name }); }); }, [route.params.slug, navigation]);
  // Live Google rating, reviews and photos (only shown when the restaurant has linked its Google listing).
  useEffect(() => { api(`/discovery/restaurants/${route.params.slug}/google`).then(setGoogle).catch(() => setGoogle(null)); }, [route.params.slug]);

  const loadSlots = useCallback(async () => {
    if (!r) return;
    setSlots(null);
    if (pdt.party > r.maxPartyOnline) { setSlots([]); return; }
    const qs = new URLSearchParams({ date: pdt.date, party: String(pdt.party), ...(area ? { tableType: area } : {}) });
    const res = await api(`/restaurants/${r.id}/availability?${qs}`);
    setSlots(res.slots);
  }, [r, pdt.date, pdt.party, area]);
  useEffect(() => { loadSlots(); }, [loadSlots]);

  const hold = useCallback(async (time: string) => {
    setBusy(true);
    const sessionKey = randomKey();
    try {
      const h = await api(`/restaurants/${r.id}/holds`, { body: { date: pdt.date, time, partySize: pdt.party, tableType: area ?? undefined, sessionKey } });
      navigation.navigate('Checkout', { restaurant: { id: r.id, name: r.name, timezone: r.timezone, photo: r.photos[0] }, hold: h, sessionKey, date: pdt.date, time });
    } catch (e: any) {
      Alert.alert('Not available', e.message);
      loadSlots();
    } finally { setBusy(false); }
  }, [r, pdt, area, navigation, loadSlots]);

  // Arriving from a search-result time button: hold that slot straight away.
  useEffect(() => { if (r && route.params.autoHold && route.params.time) { navigation.setParams({ autoHold: false }); hold(route.params.time); } }, [r]);

  const notify = async () => {
    if (!user) return navigation.navigate('Login', { reason: 'Sign in to get notified when a table opens.' });
    const [, from, to] = PERIODS[period];
    try {
      await api(`/restaurants/${r.id}/notify`, { body: { date: pdt.date, fromTime: from === '00:00' ? '11:00' : from, toTime: to === '23:59' ? '22:30' : to, partySize: pdt.party, tableType: area ?? undefined } });
      Alert.alert("You're on the Notify list", `We'll alert you if a table opens on ${pdt.date}.`);
    } catch (e: any) { Alert.alert('Could not set Notify', e.message); }
  };
  const toggleSave = async () => {
    if (!user) return navigation.navigate('Login', {});
    await api(`/me/saved/${r.id}`, { method: saved ? 'DELETE' : 'PUT' }); setSaved(!saved);
  };

  if (!r) return <Loading />;
  const [, from, to] = PERIODS[period];
  const open = (slots ?? []).filter((x) => x.available && x.time >= from && x.time <= to);
  const large = pdt.party > r.maxPartyOnline;

  return (
    <ScrollView style={s.screen} contentContainerStyle={{ paddingBottom: 40 }}>
      <PhotoGallery own={r.photos} google={google} />
      <View style={[s.pad, { gap: 6 }]}>
        <View style={[s.row, { justifyContent: 'space-between' }]}>
          <Text style={s.h1}>{r.name}</Text>
          <Pressable onPress={toggleSave}><Text style={{ fontSize: 22 }}>{saved ? '♥' : '♡'}</Text></Pressable>
        </View>
        <Text style={s.muted}>★ {r.ratingAvg.toFixed(1)} ({r.ratingCount} TableDash reviews) · {r.cuisine} · {price(r.priceBand)} · {r.neighborhood}</Text>
        {google?.enabled && <GoogleRatingLine g={google} />}
        <Text style={[s.body, { marginTop: 6 }]}>{r.description}</Text>

        <View style={[s.card, { marginTop: 14 }]}>
          <Pressable onPress={() => setEditing(!editing)} style={[s.row, { justifyContent: 'space-between' }]}>
            <Text style={{ fontWeight: '700' }}>{pdt.party} people · {pdt.date} </Text>
            <Text style={{ color: C.brand, fontWeight: '700' }}>{editing ? 'Done' : 'Change'}</Text>
          </Pressable>
          {editing && <PartyDateTime value={pdt} onChange={setPdt} />}
          {r.tableTypes.length > 1 && <ChipRow>
            <Chip label="Any seating" on={!area} onPress={() => setArea(null)} />
            {r.tableTypes.map((t: string) => <Chip key={t} label={AREA[t] ?? t} on={area === t} onPress={() => setArea(t)} />)}
          </ChipRow>}
          <ChipRow>{PERIODS.map(([l], i) => <Chip key={l} label={l} on={period === i} onPress={() => setPeriod(i)} />)}</ChipRow>
          <View style={{ marginTop: 10 }}>
            {large ? (
              <View style={{ gap: 8 }}>
                <Text style={s.body}>Parties over {r.maxPartyOnline} are booked by request. The restaurant will confirm.</Text>
                <Button title="Send a large-party request" onPress={() => navigation.navigate('Checkout', { restaurant: { id: r.id, name: r.name, timezone: r.timezone, photo: r.photos[0] }, request: { partySize: pdt.party }, date: pdt.date, time: pdt.time })} />
              </View>
            ) : slots === null ? <Loading /> : open.length ? (
              <View style={[s.row, { flexWrap: 'wrap' }]}>{open.map((x) => <SlotButton key={x.time} time={x.time} onPress={() => hold(x.time)} />)}</View>
            ) : (
              <View style={{ gap: 8 }}>
                <Text style={s.body}>No tables for {pdt.party} in this window.</Text>
                <Button title="Notify me if a table opens" kind="ghost" onPress={notify} />
              </View>
            )}
            {!large && open.length > 0 && <Pressable onPress={notify} style={{ marginTop: 10 }}><Text style={{ color: C.brand, fontWeight: '600' }}>Want a different time? Set a Notify alert</Text></Pressable>}
            {busy && <Loading />}
          </View>
        </View>

        <Pressable onPress={() => navigation.navigate('Waitlist', { restaurantId: r.id, name: r.name })} style={[s.card, { marginTop: 10 }]}>
          <Text style={{ fontWeight: '700' }}>Walking in? Join the waitlist remotely →</Text>
        </Pressable>

        {r.policy && (
          <View style={[s.card, { marginTop: 10 }]}>
            <Text style={s.h2}>Policies</Text>
            <Text style={s.body}>{r.policy.text}</Text>
            {r.policy.depositType === 'DEPOSIT_PER_PERSON' && <Text style={s.muted}>Deposit: {money(r.policy.depositAmountCents)} per person</Text>}
            {r.policy.depositType === 'DEPOSIT_PER_PARTY' && <Text style={s.muted}>Deposit: {money(r.policy.depositAmountCents)} per party</Text>}
            {r.policy.noShowFeeCents > 0 && <Text style={s.muted}>No-show fee: {money(r.policy.noShowFeeCents)} per person</Text>}
          </View>
        )}
        <View style={[s.card, { marginTop: 10, gap: 4 }]}>
          <Text style={s.h2}>Details</Text>
          <Text style={s.body}>{r.address}</Text>
          {r.phone && <Pressable onPress={() => Linking.openURL(`tel:${r.phone}`)}><Text style={{ color: C.brand }}>{r.phone}</Text></Pressable>}
          {r.menuUrl && <Pressable onPress={() => Linking.openURL(r.menuUrl)}><Text style={{ color: C.brand }}>View menu</Text></Pressable>}
          {r.features.length > 0 && <Text style={s.muted}>{r.features.join(' · ')}</Text>}
        </View>
        {google?.enabled && <GoogleReviews g={google} />}
        <Text style={[s.h2, { marginTop: 16 }]}>Reviews from verified TableDash diners</Text>
        {r.reviews.length === 0 && <Text style={s.muted}>No reviews yet.</Text>}
        {r.reviews.map((rv: any) => (
          <View key={rv.id} style={[s.card, { marginBottom: 8 }]}>
            <Text style={{ fontWeight: '700' }}>{'★'.repeat(rv.rating)} {rv.author}</Text>
            <Text style={s.body}>{rv.text}</Text>
            {rv.reply && <Text style={[s.muted, { marginTop: 6 }]}>Reply from the restaurant: {rv.reply}</Text>}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
