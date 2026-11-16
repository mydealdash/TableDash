import { useCallback, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api, prettyDate, prettyTime } from '../lib/api';
import { useAuth } from '../lib/auth';
import { C, s } from '../lib/theme';
import { Badge, Button, Empty } from '../components/ui';

export default function NotifyScreen({ navigation }: any) {
  const { user } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const load = useCallback(() => { if (user) api('/me/notify').then(setRows); }, [user]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  if (!user) return <View style={[s.screen, s.pad, { justifyContent: 'center', gap: 12 }]}><Text style={[s.muted, { textAlign: 'center' }]}>Sign in to manage Notify alerts.</Text><Button title="Sign in" onPress={() => navigation.navigate('Login', {})} /></View>;
  return (
    <FlatList style={s.screen} contentContainerStyle={{ padding: 16, gap: 10 }} data={rows} keyExtractor={(n) => n.id}
      ListHeaderComponent={<View style={{ gap: 4, marginBottom: 6 }}>
        <Text style={s.h1}>Notify</Text>
        <Text style={s.muted}>We alert you the moment a matching table opens.{user.tier === 'GOLD' ? ' As a Gold member you hear first.' : ''}</Text>
      </View>}
      ListEmptyComponent={<Empty text="No alerts set. Open a fully booked restaurant and tap “Notify me”." />}
      renderItem={({ item: n }) => (
        <Pressable onPress={() => navigation.navigate('Restaurant', { slug: n.restaurant.slug, date: n.date, party: n.partySize, time: n.fromTime })} style={s.card}>
          <View style={[s.row, { justifyContent: 'space-between' }]}>
            <Text style={{ fontFamily: 'Nunito_800ExtraBold', fontSize: 16 }}>{n.restaurant.name}</Text>
            {n.status === 'ALERTED' && <Badge text="TABLE OPENED" color={C.ok} />}
          </View>
          <Text style={s.body}>{prettyDate(n.date)} · {prettyTime(n.fromTime)}–{prettyTime(n.toTime)} · {n.partySize} people</Text>
          <Pressable onPress={() => api(`/me/notify/${n.id}`, { method: 'DELETE' }).then(load)}><Text style={{ color: C.bad, marginTop: 6 }}>Remove</Text></Pressable>
        </Pressable>
      )} />
  );
}
