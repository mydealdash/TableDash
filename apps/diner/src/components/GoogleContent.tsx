/**
 * Google rating, photos and reviews for a restaurant's linked Google listing.
 * Rendered per the Places API policies: "Google Maps" text attribution in the same
 * container, author credit (avatar + name + profile link), each item linked to its
 * source on Google Maps, an ordering notice, and translation disclosure.
 */
import { useState } from 'react';
import { Image, Linking, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { API_URL } from '../lib/api';
import { C, s } from '../lib/theme';

export interface GAuthor { name: string; uri: string | null; photoUri: string | null }
export interface GListing {
  enabled: boolean; rating: number | null; userRatingCount: number | null; googleMapsUri: string | null;
  reviews: { author: GAuthor; rating: number; text: string; originalText: string | null; translated: boolean; relativeTime: string | null;
    googleMapsUri: string | null; flagContentUri: string | null; visitDate: { year: number; month: number } | null }[];
  photos: { name: string; width: number; height: number; authors: GAuthor[]; googleMapsUri: string | null }[];
}

const open = (url?: string | null) => url && Linking.openURL(url);
export const googlePhotoUri = (name: string, w = 1200) => `${API_URL}/v1/discovery/google-photo?name=${encodeURIComponent(name)}&w=${w}`;

/** Required text attribution: exact "Google Maps", not translated or wrapped, #5E5E5E, 12–16sp. */
export const GoogleMapsAttribution = ({ light }: { light?: boolean }) => (
  <Text numberOfLines={1} style={{ fontSize: 12, color: light ? '#FFFFFF' : '#5E5E5E', fontWeight: '400' }} {...({ translate: 'no' } as any)}>Google Maps</Text>
);

export function GoogleRatingLine({ g }: { g: GListing }) {
  if (g.rating == null) return null;
  return (
    <Pressable onPress={() => open(g.googleMapsUri)} style={[s.row, { marginTop: 2 }]}>
      <Text style={s.muted}>★ {g.rating.toFixed(1)} ({g.userRatingCount ?? 0}) on</Text><GoogleMapsAttribution />
    </Pressable>
  );
}

/** Photo gallery: TableDash photos first, then Google photos, each Google photo credited to its author. */
export function PhotoGallery({ own, google }: { own: string[]; google?: GListing | null }) {
  const win = useWindowDimensions();
  const [width, setWidth] = useState(Math.min(win.width, 430));
  const gphotos = google?.enabled ? google.photos : [];
  return (
    <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {own.map((p) => <Image key={p} source={{ uri: p }} style={{ width, height: 240, backgroundColor: C.line }} />)}
      {gphotos.map((p) => {
        const a = p.authors[0];
        return (
          <View key={p.name} style={{ width, height: 240, backgroundColor: C.line }}>
            <Image source={{ uri: googlePhotoUri(p.name, Math.min(1600, Math.round(width * 2))) }} style={{ width, height: 240 }} />
            <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#0008', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {a?.photoUri && <Image source={{ uri: a.photoUri }} style={{ width: 18, height: 18, borderRadius: 9 }} />}
              <Pressable style={{ flex: 1 }} onPress={() => open(a?.uri ?? p.googleMapsUri)}><Text numberOfLines={1} style={{ color: '#fff', fontSize: 12 }}>Photo: {a?.name ?? 'Google user'}</Text></Pressable>
              <Pressable onPress={() => open(p.googleMapsUri)}><GoogleMapsAttribution light /></Pressable>
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

export function GoogleReviews({ g }: { g: GListing }) {
  const [original, setOriginal] = useState<Record<number, boolean>>({});
  if (!g.enabled || (!g.reviews.length && g.rating == null)) return null;
  return (
    <View style={[s.card, { marginTop: 16, gap: 10 }]}>
      <View style={[s.row, { justifyContent: 'space-between' }]}>
        <Text style={[s.h2, { marginBottom: 0 }]}>Google reviews</Text>
        <GoogleMapsAttribution />
      </View>
      {g.rating != null && (
        <Pressable onPress={() => open(g.googleMapsUri)}>
          <Text style={s.body}><Text style={{ fontFamily: 'Nunito_800ExtraBold', fontSize: 18 }}>★ {g.rating.toFixed(1)}</Text>  from {g.userRatingCount ?? 0} reviews · see all on Google Maps</Text>
        </Pressable>
      )}
      {g.reviews.map((r, i) => (
        <View key={i} style={{ borderTopWidth: 1, borderTopColor: C.line, paddingTop: 10, gap: 4 }}>
          <Pressable onPress={() => open(r.author.uri)} style={s.row}>
            {r.author.photoUri
              ? <Image source={{ uri: r.author.photoUri }} style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: C.line }} />
              : <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: C.line }} />}
            <Text style={{ fontFamily: 'Nunito_700Bold', color: C.ink }}>{r.author.name}</Text>
          </Pressable>
          <Text style={s.muted}>{'★'.repeat(Math.round(r.rating))}{'☆'.repeat(5 - Math.round(r.rating))}{r.relativeTime ? ` · ${r.relativeTime}` : ''}
            {r.visitDate ? ` · visited ${String(r.visitDate.month).padStart(2, '0')}/${r.visitDate.year}` : ''}</Text>
          <Text style={s.body}>{original[i] && r.originalText ? r.originalText : r.text}</Text>
          <View style={[s.row, { flexWrap: 'wrap', gap: 12 }]}>
            {r.translated && <Pressable onPress={() => setOriginal({ ...original, [i]: !original[i] })}>
              <Text style={{ color: C.brand, fontSize: 13 }}>{original[i] ? 'Show translation' : 'Translated by Google · See original'}</Text></Pressable>}
            <Pressable onPress={() => open(r.googleMapsUri)}><Text style={{ color: C.brand, fontSize: 13 }}>View on Google Maps</Text></Pressable>
            {r.flagContentUri && <Pressable onPress={() => open(r.flagContentUri)}><Text style={{ color: C.muted, fontSize: 13 }}>Report</Text></Pressable>}
          </View>
        </View>
      ))}
      <Text style={[s.muted, { fontSize: 12 }]}>
        Up to 5 reviews from Google Maps, in Google's "most relevant" order with no filtering by TableDash. Google doesn't verify reviews but removes fake content when it's identified.
      </Text>
    </View>
  );
}
