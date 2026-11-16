import { useCallback, useState } from 'react';
import { FlatList, Image, Pressable, RefreshControl, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api, inZone } from '../lib/api';
import { useAuth } from '../lib/auth';
import { C, s } from '../lib/theme';
import { Badge, Button, Chip, Empty } from '../components/ui';

const COLOR: Record<string, string> = { CONFIRMED: C.ok, REQUESTED: C.gold, SEATED: '#1d4ed8', COMPLETED: C.muted, CANCELLED: C.muted, NO_SHOW: C.bad, DECLINED: C.muted };

export default function ReservationsScreen({ navigation }: any) {
  const { user } = useAuth();
  const [scope, setScope] = useState<'upcoming' | 'past'>('upcoming');
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true); try { setRows(await api(`/me/reservations?scope=${scope}`)); } finally { setLoading(false); }
  }, [user, scope]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!user) return (
    <View style={[s.screen, s.pad, { justifyContent: 'center', gap: 12 }]}>
      <Text style={[s.h1, { textAlign: 'center' }]}>Your reservations</Text>
      <Text style={[s.muted, { textAlign: 'center' }]}>Sign in to see and manage your bookings.</Text>
      <Button title="Sign in" onPress={() => navigation.navigate('Login', {})} />
    </View>
  );
  return (
    <FlatList style={s.screen} contentContainerStyle={{ padding: 16, gap: 12 }} data={rows} keyExtractor={(r) => r.id}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
      ListHeaderComponent={<View style={[s.row, { marginBottom: 4 }]}><Chip label="Upcoming" on={scope === 'upcoming'} onPress={() => setScope('upcoming')} /><Chip label="Past" on={scope === 'past'} onPress={() => setScope('past')} /></View>}
      ListEmptyComponent={<Empty text={scope === 'upcoming' ? 'No upcoming reservations.' : 'No past visits yet.'} />}
      renderItem={({ item: r }) => (
        <Pressable onPress={() => navigation.navigate('ReservationDetail', { id: r.id })} style={[s.card, s.row, { gap: 12 }]}>
          {r.restaurant.photos[0] && <Image source={{ uri: r.restaurant.photos[0] }} style={{ width: 64, height: 64, borderRadius: 10 }} />}
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontWeight: '800', fontSize: 16 }}>{r.restaurant.name}</Text>
            <Text style={s.body}>{inZone(r.startsAt, r.restaurant.timezone).label} · {r.partySize} people</Text>
            <Badge text={r.status.replace('_', ' ')} color={COLOR[r.status]} />
          </View>
        </Pressable>
      )} />
  );
}
