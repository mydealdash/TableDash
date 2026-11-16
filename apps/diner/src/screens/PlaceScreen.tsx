import { useEffect, useState } from 'react';
import { Alert, Linking, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api, price } from '../lib/api';
import { useAuth } from '../lib/auth';
import { C, s } from '../lib/theme';
import { Button, Loading } from '../components/ui';
import { GoogleMapsAttribution, GoogleRatingLine, GoogleReviews, PhotoGallery } from '../components/GoogleContent';
import type { RootStack } from '../../App';

/** A restaurant from Google that isn't on TableDash yet: details, call/website/directions, and "tell me when they join". */
export default function PlaceScreen({ route, navigation }: NativeStackScreenProps<RootStack, 'Place'>) {
  const { user } = useAuth();
  const [p, setP] = useState<any>(null);
  const [err, setErr] = useState('');
  const load = () => api(`/discovery/places/${route.params.placeId}`).then((x) => {
    setP(x);
    // Joined since the search ran? Go straight to booking.
    if (x.tabledash) navigation.replace('Restaurant', { slug: x.tabledash.slug, date: new Date().toISOString().slice(0, 10) });
  }).catch((e) => setErr(e.message));
  useEffect(() => { navigation.setOptions({ title: route.params.name ?? '' }); load(); }, [route.params.placeId, user]);

  if (err) return <Text style={[s.muted, s.pad]}>{err}</Text>;
  if (!p) return <Loading />;
  const directions = p.lat != null
    ? Platform.select({ ios: `maps://?daddr=${p.lat},${p.lng}`, default: `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}&destination_place_id=${p.placeId}` })!
    : p.googleMapsUri;

  const interest = async () => {
    if (!user) return navigation.navigate('Login', { reason: "Sign in and we'll tell you when this restaurant joins TableDash." });
    try {
      await api(`/discovery/places/${p.placeId}/interest`, { method: p.interested ? 'DELETE' : 'POST' });
      setP({ ...p, interested: !p.interested });
      if (!p.interested) Alert.alert("We'll let you know", `You'll get a notification when ${p.name} starts taking bookings on TableDash.`);
    } catch (e: any) { Alert.alert('Something went wrong', e.message); }
  };

  return (
    <ScrollView style={s.screen} contentContainerStyle={{ paddingBottom: 40 }}>
      <PhotoGallery own={[]} google={p} />
      <View style={[s.pad, { gap: 6 }]}>
        <Text style={s.h1}>{p.name}</Text>
        <GoogleRatingLine g={p} />
        <Text style={s.muted}>{[p.type, p.priceBand ? price(p.priceBand) : null, p.openNow == null ? null : p.openNow ? 'Open now' : 'Closed now'].filter(Boolean).join(' · ')}</Text>
        {p.summary && <Text style={[s.body, { marginTop: 4 }]}>{p.summary}</Text>}

        <View style={[s.card, { marginTop: 12, backgroundColor: C.brandSoft, gap: 8 }]}>
          <Text style={{ fontWeight: '800', fontSize: 16 }}>Not on TableDash yet</Text>
          <Text style={s.body}>You can't book here through TableDash yet. Call or use their website to reserve, or ask us to tell you when they join.</Text>
          <Button title={p.interested ? "✓ We'll tell you when they join" : 'Tell me when they join'} kind={p.interested ? 'ghost' : 'primary'} onPress={interest} />
        </View>

        <View style={[s.row, { marginTop: 12, gap: 8 }]}>
          {p.phone && <Button style={{ flex: 1 }} kind="ghost" title="Call" onPress={() => Linking.openURL(`tel:${p.phoneIntl ?? p.phone}`)} />}
          {p.website && <Button style={{ flex: 1 }} kind="ghost" title="Website" onPress={() => Linking.openURL(p.website)} />}
          {directions && <Button style={{ flex: 1 }} kind="ghost" title="Directions" onPress={() => Linking.openURL(directions)} />}
        </View>

        <View style={[s.card, { marginTop: 12, gap: 4 }]}>
          <View style={[s.row, { justifyContent: 'space-between' }]}><Text style={s.h2}>Details</Text><GoogleMapsAttribution /></View>
          <Text style={s.body}>{p.address}</Text>
          {p.phone && <Text style={s.body}>{p.phone}</Text>}
          {p.hours.length > 0 && <View style={{ marginTop: 6 }}>{p.hours.map((h: string) => <Text key={h} style={s.muted}>{h}</Text>)}</View>}
          {p.googleMapsUri && <Pressable onPress={() => Linking.openURL(p.googleMapsUri)}><Text style={{ color: C.brand, marginTop: 6 }}>Open in Google Maps</Text></Pressable>}
        </View>
        <GoogleReviews g={p} />
      </View>
    </ScrollView>
  );
}
