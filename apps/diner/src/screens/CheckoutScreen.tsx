import { useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api, inZone, money, prettyDate, prettyTime, randomKey } from '../lib/api';
import { useAuth } from '../lib/auth';
import { C, s } from '../lib/theme';
import { Button, Chip, ChipRow } from '../components/ui';
import type { RootStack } from '../../App';

const OCCASIONS = ['Birthday', 'Anniversary', 'Date night', 'Business', 'Celebration'];

export default function CheckoutScreen({ route, navigation }: NativeStackScreenProps<RootStack, 'Checkout'>) {
  const { restaurant, hold, sessionKey, request, date, time } = route.params;
  const { user } = useAuth();
  const [name, setName] = useState(user ? `${user.firstName} ${user.lastName}`.trim() : '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [occasion, setOccasion] = useState<string | null>(null);
  const [requestText, setRequestText] = useState(user?.dietaryNotes ?? '');
  const [cards, setCards] = useState<any[]>([]);
  const [cardId, setCardId] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [left, setLeft] = useState<number>(hold ? Math.max(0, Math.round((new Date(hold.expiresAt).getTime() - Date.now()) / 1000)) : 0);
  const idem = useRef(randomKey()).current;
  const needsCard = hold && hold.payment.kind !== 'NONE';

  useEffect(() => { if (user) api('/me/payment-methods').then((c) => { setCards(c); setCardId(c[0]?.id ?? null); }); }, [user]);
  useEffect(() => {
    if (!hold) return;
    const t = setInterval(() => setLeft((x) => Math.max(0, x - 1)), 1000);
    return () => clearInterval(t);
  }, [hold]);
  // Release the hold if the diner backs out without booking.
  useEffect(() => navigation.addListener('beforeRemove', () => { if (hold && !done.current) api(`/holds/${hold.holdId}?sessionKey=${sessionKey}`, { method: 'DELETE' }).catch(() => {}); }), [navigation, hold, sessionKey]);
  const done = useRef(false);

  async function submit() {
    if (!name || (!phone && !email)) return Alert.alert('Add your name and a phone or email');
    if (hold?.policy && !accepted) return Alert.alert('Please accept the restaurant policy');
    setBusy(true);
    try {
      if (request) {
        await api(`/restaurants/${restaurant.id}/requests`, { body: { date, time, partySize: request.partySize, guestName: name, guestPhone: phone || undefined, guestEmail: email || undefined, specialRequest: requestText || undefined, occasion: occasion ?? undefined } });
        done.current = true;
        Alert.alert('Request sent', `${restaurant.name} will confirm your party of ${request.partySize}.`);
        navigation.popToTop();
        return;
      }
      const res = await api(`/holds/${hold!.holdId}/confirm`, { body: {
        sessionKey, channel: 'APP', guestName: name, guestPhone: phone || undefined, guestEmail: email || undefined,
        occasion: occasion ?? undefined, specialRequest: requestText || undefined, paymentMethodId: cardId ?? undefined,
        idempotencyKey: idem, acceptPolicyVersion: hold!.policy?.version,
      } });
      done.current = true;
      navigation.replace('Confirmation', { reservation: res, restaurant });
    } catch (e: any) {
      Alert.alert('Booking failed', e.message);
      if (e.status === 410 || e.status === 409) navigation.goBack();
    } finally { setBusy(false); }
  }

  const when = hold ? inZone(hold.startsAt, restaurant.timezone).label : `${prettyDate(date)} at ${prettyTime(time)}`;
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={s.screen} contentContainerStyle={[s.pad, { gap: 4, paddingBottom: 40 }]}>
        <Text style={s.h1}>{restaurant.name}</Text>
        <Text style={[s.body, { fontFamily: 'Nunito_700Bold' }]}>{when} · {hold?.partySize ?? request?.partySize} people</Text>
        {hold && <Text style={{ color: left < 60 ? C.bad : C.muted }}>We're holding this table for {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</Text>}
        {!user && (
          <Pressable onPress={() => navigation.navigate('Login', { reason: 'Sign in to earn points and save your card.' })} style={[s.card, { marginTop: 10, backgroundColor: C.brandSoft }]}>
            <Text style={{ fontFamily: 'Nunito_700Bold' }}>Sign in to earn 100 points for this booking →</Text>
          </Pressable>
        )}
        <Text style={s.label}>Name</Text><TextInput style={s.input} value={name} onChangeText={setName} />
        <Text style={s.label}>Mobile</Text><TextInput style={s.input} value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+15551234567" />
        <Text style={s.label}>Email</Text><TextInput style={s.input} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
        <Text style={s.label}>Occasion</Text>
        <ChipRow>{OCCASIONS.map((o) => <Chip key={o} label={o} on={occasion === o} onPress={() => setOccasion(occasion === o ? null : o)} />)}</ChipRow>
        <Text style={s.label}>Requests, allergies</Text>
        <TextInput style={[s.input, { minHeight: 70 }]} multiline value={requestText} onChangeText={setRequestText} placeholder="e.g. nut allergy, high chair" />

        {needsCard && (
          <View style={{ marginTop: 8 }}>
            <Text style={s.label}>{hold!.payment.kind === 'DEPOSIT' ? `Deposit ${money(hold!.payment.amountCents)}` : 'Card required to hold the table'}</Text>
            {cards.map((c) => <Chip key={c.id} label={`${c.brand} •••• ${c.last4}`} on={cardId === c.id} onPress={() => setCardId(c.id)} />)}
            <Pressable onPress={() => user ? navigation.navigate('AddCard', {}) : navigation.navigate('Login', { reason: 'Sign in to add a card.' })}>
              <Text style={{ color: C.brand, fontFamily: 'Nunito_700Bold', marginTop: 8 }}>+ Add a card</Text>
            </Pressable>
          </View>
        )}
        {hold?.policy && (
          <Pressable onPress={() => setAccepted(!accepted)} style={[s.card, { marginTop: 14, flexDirection: 'row', gap: 10 }]}>
            <Text style={{ fontSize: 18 }}>{accepted ? '☑' : '☐'}</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: 'Nunito_700Bold' }}>Restaurant policy</Text>
              <Text style={s.muted}>{hold.policy.text}</Text>
              <Text style={[s.muted, { marginTop: 4 }]}>Free cancellation until {hold.policy.cancelCutoffHours}h before.</Text>
            </View>
          </Pressable>
        )}
        <Button style={{ marginTop: 18 }} title={request ? 'Send request' : needsCard && hold!.payment.kind === 'DEPOSIT' ? `Pay ${money(hold!.payment.amountCents)} & book` : 'Complete reservation'}
          onPress={submit} loading={busy} disabled={!!hold && left === 0} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
