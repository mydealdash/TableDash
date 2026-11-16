import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, Share, Switch, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { C, s } from '../lib/theme';
import { Button } from '../components/ui';
import { Logo } from '../components/Logo';

export default function AccountScreen({ navigation }: any) {
  const { user, signOut, refresh } = useAuth();
  const [loyalty, setLoyalty] = useState<any>(null);
  const [cards, setCards] = useState<any[]>([]);
  const [saved, setSaved] = useState<any[]>([]);
  const [dietary, setDietary] = useState(user?.dietaryNotes ?? '');
  const [marketing, setMarketing] = useState(false);
  useFocusEffect(useCallback(() => {
    if (!user) return;
    api('/me/loyalty').then(setLoyalty); api('/me/payment-methods').then(setCards); api('/me/saved').then(setSaved);
    api('/me').then((u) => { setDietary(u.dietaryNotes ?? ''); setMarketing(u.marketingOptIn); });
  }, [user]));

  if (!user) return (
    <View style={[s.screen, s.pad, { justifyContent: 'center', gap: 12 }]}>
      <View style={{ alignItems: 'center' }}><Logo size={44} /></View>
      <Text style={[s.muted, { textAlign: 'center' }]}>Sign in to earn points, save cards and set Notify alerts.</Text>
      <Button title="Sign in or create account" onPress={() => navigation.navigate('Login', {})} />
    </View>
  );
  const toGold = Math.max(0, (loyalty?.goldThreshold ?? 6) - (loyalty?.completedCount ?? 0));
  return (
    <ScrollView style={s.screen} contentContainerStyle={[s.pad, { gap: 12, paddingBottom: 40 }]}>
      <Text style={s.h1}>Hi, {user.firstName}</Text>
      <View style={[s.card, { backgroundColor: user.tier === 'GOLD' ? '#fff8e6' : C.card }]}>
        <Text style={{ fontFamily: 'Nunito_800ExtraBold', fontSize: 16, color: user.tier === 'GOLD' ? C.gold : C.ink }}>{user.tier === 'GOLD' ? '★ Gold member' : 'Member'}</Text>
        <Text style={{ fontSize: 28, fontFamily: 'Nunito_800ExtraBold', marginTop: 4 }}>{loyalty?.points ?? user.points} pts</Text>
        <Text style={s.muted}>{user.tier === 'GOLD' ? 'Gold diners get Priority Notify — first alert when tables open.' : `${toGold} more completed bookings to reach Gold.`}</Text>
      </View>
      <View style={s.card}>
        <Text style={s.h2}>Saved restaurants</Text>
        {saved.length === 0 && <Text style={s.muted}>Tap ♡ on a restaurant to save it.</Text>}
        {saved.map((r) => <Pressable key={r.id} onPress={() => navigation.navigate('Restaurant', { slug: r.slug, date: new Date().toISOString().slice(0, 10) })}><Text style={[s.body, { paddingVertical: 4 }]}>{r.name} · {r.cuisine}</Text></Pressable>)}
      </View>
      <View style={s.card}>
        <Text style={s.h2}>Payment methods</Text>
        {cards.map((c) => <View key={c.id} style={[s.row, { justifyContent: 'space-between', paddingVertical: 4 }]}><Text style={s.body}>{c.brand} •••• {c.last4}</Text>
          <Pressable onPress={() => api(`/me/payment-methods/${c.id}`, { method: 'DELETE' }).then(() => api('/me/payment-methods').then(setCards))}><Text style={{ color: C.bad }}>Remove</Text></Pressable></View>)}
        <Pressable onPress={() => navigation.navigate('AddCard', {})}><Text style={{ color: C.brand, fontFamily: 'Nunito_700Bold', marginTop: 6 }}>+ Add card</Text></Pressable>
      </View>
      <View style={s.card}>
        <Text style={s.h2}>Dining preferences</Text>
        <TextInput style={s.input} value={dietary} onChangeText={setDietary} placeholder="Allergies, dietary needs" />
        <View style={[s.row, { justifyContent: 'space-between', marginTop: 10 }]}><Text style={s.body}>Offers and news by email</Text><Switch value={marketing} onValueChange={setMarketing} /></View>
        <Button style={{ marginTop: 10 }} kind="ghost" title="Save preferences" onPress={async () => { await api('/me', { method: 'PATCH', body: { dietaryNotes: dietary, marketingOptIn: marketing } }); refresh(); Alert.alert('Saved'); }} />
      </View>
      <Button kind="ghost" title="Export my data" onPress={async () => Share.share({ message: JSON.stringify(await api('/me/export'), null, 2) })} />
      <Button kind="ghost" title="Sign out" onPress={signOut} />
      <Button kind="danger" title="Delete account" onPress={() => Alert.alert('Delete account?', 'This removes your profile and saved cards.', [
        { text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: async () => { await api('/me', { method: 'DELETE' }); signOut(); } }])} />
    </ScrollView>
  );
}
