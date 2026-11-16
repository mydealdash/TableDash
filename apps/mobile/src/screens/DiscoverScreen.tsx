import { useCallback, useEffect, useState } from 'react';
import { FlatList, Image, Pressable, RefreshControl, Text, TextInput, View } from 'react-native';
import * as Location from 'expo-location';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api, localDate, price } from '../lib/api';
import { C, s } from '../lib/theme';
import { Chip, ChipRow, Empty, Loading, SlotButton } from '../components/ui';
import { PartyDateTime, PDT } from '../components/PartyDateTime';
import type { RootStack } from '../../App';

export default function DiscoverScreen({ navigation }: NativeStackScreenProps<RootStack, 'Tabs'>) {
  const [pdt, setPdt] = useState<PDT>({ party: 2, date: localDate(0), time: '19:00' });
  const [q, setQ] = useState('');
  const [cuisine, setCuisine] = useState<string | null>(null);
  const [cuisines, setCuisines] = useState<string[]>([]);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [sort, setSort] = useState<'relevance' | 'distance' | 'rating'>('relevance');
  const [results, setResults] = useState<any[] | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api('/discovery/cuisines').then(setCuisines).catch(() => {});
    Location.requestForegroundPermissionsAsync().then(async ({ status }) => {
      if (status === 'granted') { const p = await Location.getCurrentPositionAsync({}); setCoords({ lat: p.coords.latitude, lng: p.coords.longitude }); }
    }).catch(() => {});
  }, []);

  const search = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ date: pdt.date, time: pdt.time, party: String(pdt.party), sort, ...(q ? { q } : {}), ...(cuisine ? { cuisine } : {}),
      ...(coords ? { lat: String(coords.lat), lng: String(coords.lng) } : {}) });
    try { setResults((await api(`/discovery/search?${params}`)).results); } catch { setResults([]); } finally { setLoading(false); }
  }, [pdt, q, cuisine, coords, sort]);
  useEffect(() => { const t = setTimeout(search, 250); return () => clearTimeout(t); }, [search]);

  const open = (r: any, time?: string) => navigation.navigate('Restaurant', { slug: r.slug, party: pdt.party, date: r.date, time: time ?? pdt.time, autoHold: !!time });

  return (
    <View style={s.screen}>
      <FlatList
        data={results ?? []}
        keyExtractor={(r) => r.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={search} />}
        contentContainerStyle={{ padding: 16, gap: 14 }}
        ListHeaderComponent={
          <View style={{ gap: 10 }}>
            <Text style={s.h1}>Find a table</Text>
            <TextInput style={s.input} placeholder="Restaurant, cuisine or neighborhood" value={q} onChangeText={setQ} returnKeyType="search" />
            <Pressable onPress={() => setShowPicker(!showPicker)} style={[s.card, s.row, { justifyContent: 'space-between' }]}>
              <Text style={{ fontWeight: '700' }}>{pdt.party} {pdt.party === 1 ? 'person' : 'people'} · {pdt.date === localDate(0) ? 'Today' : pdt.date} · {pdt.time}</Text>
              <Text style={{ color: C.brand, fontWeight: '700' }}>{showPicker ? 'Done' : 'Change'}</Text>
            </Pressable>
            {showPicker && <PartyDateTime value={pdt} onChange={setPdt} />}
            <ChipRow>
              <Chip label="All" on={!cuisine} onPress={() => setCuisine(null)} />
              {cuisines.map((c) => <Chip key={c} label={c} on={cuisine === c} onPress={() => setCuisine(cuisine === c ? null : c)} />)}
            </ChipRow>
            <ChipRow>
              {(['relevance', 'rating', ...(coords ? ['distance'] : [])] as const).map((k) => <Chip key={k} label={`Sort: ${k}`} on={sort === k} onPress={() => setSort(k as any)} />)}
            </ChipRow>
            {results === null && <Loading />}
          </View>
        }
        ListEmptyComponent={results ? <Empty text="No restaurants match. Try another time or cuisine." /> : null}
        renderItem={({ item: r }) => (
          <Pressable onPress={() => open(r)} style={[s.card, { padding: 0, overflow: 'hidden' }]}>
            {r.photo && <Image source={{ uri: r.photo }} style={{ height: 150, backgroundColor: C.line }} />}
            <View style={{ padding: 14, gap: 4 }}>
              <Text style={{ fontSize: 18, fontWeight: '800' }}>{r.name}</Text>
              <Text style={s.muted}>★ {r.ratingAvg.toFixed(1)} ({r.ratingCount}) · {r.cuisine} · {price(r.priceBand)} · {r.neighborhood}{r.distanceKm != null ? ` · ${r.distanceKm} km` : ''}</Text>
              {r.features?.length > 0 && <Text style={[s.muted, { fontSize: 12 }]}>{r.features.slice(0, 3).join(' · ')}</Text>}
              <View style={[s.row, { flexWrap: 'wrap', marginTop: 8 }]}>
                {r.slots.length ? r.slots.map((sl: any) => <SlotButton key={sl.time} time={sl.time} onPress={() => open(r, sl.time)} />)
                  : <Text style={{ color: C.muted }}>No tables near {pdt.time}. Tap to see other times or get notified.</Text>}
              </View>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
