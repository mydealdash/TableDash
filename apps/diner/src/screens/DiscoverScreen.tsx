import { useCallback, useEffect, useState } from 'react';
import { FlatList, Image, Pressable, RefreshControl, Text, TextInput, View } from 'react-native';
import * as Location from 'expo-location';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api, localDate, price } from '../lib/api';
import { C, s } from '../lib/theme';
import { Badge, Chip, ChipRow, Empty, Loading, SlotButton } from '../components/ui';
import { PartyDateTime, PDT } from '../components/PartyDateTime';
import { GoogleMapsAttribution, googlePhotoUri } from '../components/GoogleContent';
import type { RootStack } from '../../App';

/**
 * Search: restaurants come from Google (photos, ratings, prices, addresses) when Google is
 * configured; the ones on TableDash also show bookable times. Without Google, or without a
 * location or search text, it shows TableDash restaurants only.
 */
export default function DiscoverScreen({ navigation }: NativeStackScreenProps<RootStack, 'Tabs'>) {
  const [pdt, setPdt] = useState<PDT>({ party: 2, date: localDate(0), time: '19:00' });
  const [q, setQ] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [results, setResults] = useState<any[] | null>(null);
  const [source, setSource] = useState<'google' | 'tabledash'>('tabledash');
  const [next, setNext] = useState<string | null>(null);
  const [bookableOnly, setBookableOnly] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    Location.requestForegroundPermissionsAsync().then(async ({ status }) => {
      if (status === 'granted') { const p = await Location.getCurrentPositionAsync({}); setCoords({ lat: p.coords.latitude, lng: p.coords.longitude }); }
    }).catch(() => {});
  }, []);

  const params = useCallback((extra: Record<string, string> = {}) => new URLSearchParams({
    date: pdt.date, time: pdt.time, party: String(pdt.party), ...(submitted ? { q: submitted } : {}),
    ...(coords ? { lat: String(coords.lat), lng: String(coords.lng) } : {}), ...extra }), [pdt, submitted, coords]);

  const search = useCallback(async () => {
    setLoading(true);
    try {
      const g = await api(`/discovery/places-search?${params()}`);
      if (g.source === 'google') { setSource('google'); setResults(g.results); setNext(g.nextPageToken); return; }
      const t = await api(`/discovery/search?${params()}`);
      setSource('tabledash'); setNext(null);
      setResults(t.results.map((r: any) => ({ name: r.name, address: r.neighborhood, type: r.cuisine, priceBand: r.priceBand, ownPhoto: r.photo,
        tableDashRating: r.ratingAvg, distanceKm: r.distanceKm, tabledash: { id: r.id, slug: r.slug, date: r.date, slots: r.slots } })));
    } catch { setResults([]); } finally { setLoading(false); }
  }, [params]);
  useEffect(() => { search(); }, [search]);

  const more = async () => {
    if (!next || loading) return;
    setLoading(true);
    try { const g = await api(`/discovery/places-search?${params({ pageToken: next })}`); setResults((r) => [...(r ?? []), ...g.results]); setNext(g.nextPageToken); }
    finally { setLoading(false); }
  };

  const open = (r: any, time?: string) => r.tabledash
    ? navigation.navigate('Restaurant', { slug: r.tabledash.slug, party: pdt.party, date: r.tabledash.date, time: time ?? pdt.time, autoHold: !!time })
    : navigation.navigate('Place', { placeId: r.placeId, name: r.name });
  const shown = (results ?? []).filter((r) => !bookableOnly || r.tabledash);

  return (
    <View style={s.screen}>
      <FlatList
        data={shown}
        keyExtractor={(r, i) => r.placeId ?? r.tabledash?.id ?? String(i)}
        refreshControl={<RefreshControl refreshing={loading && !!results} onRefresh={search} />}
        onEndReached={more} onEndReachedThreshold={0.4}
        contentContainerStyle={{ padding: 16, gap: 14 }}
        ListHeaderComponent={
          <View style={{ gap: 10 }}>
            <Text style={s.h1}>Find a table</Text>
            <TextInput style={s.input} placeholder={coords ? 'Search any restaurant or cuisine near you' : 'Restaurant, cuisine or city'} value={q}
              onChangeText={setQ} returnKeyType="search" onSubmitEditing={() => setSubmitted(q.trim())} onBlur={() => setSubmitted(q.trim())} />
            <Pressable onPress={() => setShowPicker(!showPicker)} style={[s.card, s.row, { justifyContent: 'space-between' }]}>
              <Text style={{ fontWeight: '700' }}>{pdt.party} {pdt.party === 1 ? 'person' : 'people'} · {pdt.date === localDate(0) ? 'Today' : pdt.date} · {pdt.time}</Text>
              <Text style={{ color: C.brand, fontWeight: '700' }}>{showPicker ? 'Done' : 'Change'}</Text>
            </Pressable>
            {showPicker && <PartyDateTime value={pdt} onChange={setPdt} />}
            <ChipRow>
              <Chip label="All restaurants" on={!bookableOnly} onPress={() => setBookableOnly(false)} />
              <Chip label="Bookable on TableDash" on={bookableOnly} onPress={() => setBookableOnly(true)} />
            </ChipRow>
            {source === 'google' && <View style={[s.row, { justifyContent: 'space-between' }]}>
              <Text style={s.muted}>Restaurant info and photos from</Text><GoogleMapsAttribution />
            </View>}
            {results === null && <Loading />}
          </View>
        }
        ListEmptyComponent={results ? <Empty text={bookableOnly ? 'None of these are on TableDash yet.' : 'No restaurants found. Try another search.'} /> : null}
        ListFooterComponent={loading && results ? <Loading /> : null}
        renderItem={({ item: r }) => {
          const photo = r.photo ? googlePhotoUri(r.photo.name, 800) : r.ownPhoto;
          return (
            <Pressable onPress={() => open(r)} style={[s.card, { padding: 0, overflow: 'hidden' }]}>
              {photo ? <Image source={{ uri: photo }} style={{ height: 150, backgroundColor: C.line }} /> : <View style={{ height: 80, backgroundColor: C.line }} />}
              <View style={{ padding: 14, gap: 4 }}>
                <View style={[s.row, { justifyContent: 'space-between' }]}>
                  <Text style={{ fontSize: 18, fontWeight: '800', flexShrink: 1 }}>{r.name}</Text>
                  {r.tabledash ? <Badge text="BOOK ON TABLEDASH" color={C.ok} /> : <Badge text="NOT ON TABLEDASH YET" />}
                </View>
                <Text style={s.muted}>
                  {[r.rating != null ? `★ ${r.rating.toFixed(1)} (${r.userRatingCount ?? 0})` : r.tableDashRating ? `★ ${r.tableDashRating.toFixed(1)}` : null,
                    r.type, r.priceBand ? price(r.priceBand) : null, r.address, r.distanceKm != null ? `${r.distanceKm} km` : null].filter(Boolean).join(' · ')}
                </Text>
                {r.temporarilyClosed && <Text style={{ color: C.bad, fontSize: 13 }}>Temporarily closed</Text>}
                {r.tabledash ? (
                  <View style={[s.row, { flexWrap: 'wrap', marginTop: 8 }]}>
                    {r.tabledash.slots.length ? r.tabledash.slots.map((sl: any) => <SlotButton key={sl.time} time={sl.time} onPress={() => open(r, sl.time)} />)
                      : <Text style={{ color: C.muted }}>No tables near {pdt.time}. Tap for other times or Notify.</Text>}
                  </View>
                ) : <Text style={{ color: C.muted, marginTop: 4 }}>See details, call or ask them to join TableDash →</Text>}
                {r.photo && <View style={{ alignItems: 'flex-end', marginTop: 4 }}><GoogleMapsAttribution /></View>}
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}
