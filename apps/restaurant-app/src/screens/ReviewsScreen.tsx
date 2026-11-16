import { useCallback, useEffect, useState } from 'react';
import { FlatList, Text, TextInput, View } from 'react-native';
import { api } from '../lib/api';
import { useSession } from '../lib/session';
import { C, s } from '../lib/theme';
import { Badge, Btn, Empty } from '../components/ui';

export default function ReviewsScreen() {
  const { restaurant } = useSession();
  const rid = restaurant!.id;
  const [rows, setRows] = useState<any[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const load = useCallback(() => api(`/manage/${rid}/reviews`).then(setRows).catch(() => setRows([])), [rid]);
  useEffect(() => { load(); }, [load]);
  const avg = rows.length ? (rows.reduce((n, r) => n + r.rating, 0) / rows.length).toFixed(1) : '—';
  return (
    <FlatList style={s.screen} contentContainerStyle={{ padding: 12, gap: 8 }} data={rows} keyExtractor={(r) => r.id}
      ListHeaderComponent={<Text style={s.muted}>{rows.length} verified reviews · average {avg} ★</Text>}
      ListEmptyComponent={<Empty text="No reviews yet. Diners can review after a completed visit." />}
      renderItem={({ item: r }) => (
        <View style={s.card}>
          <View style={[s.row, { justifyContent: 'space-between' }]}>
            <Text style={{ fontWeight: '800' }}>{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)} · {r.author}</Text>
            {r.status !== 'PUBLISHED' && <Badge text={r.status} color={C.bad} />}
          </View>
          <Text style={[s.body, { marginTop: 4 }]}>{r.text}</Text>
          {r.reply ? <Text style={[s.muted, { marginTop: 6 }]}>Your reply: {r.reply}</Text> : (
            <View style={{ marginTop: 8, gap: 6 }}>
              <TextInput style={s.input} placeholder="Write a public reply" value={draft[r.id] ?? ''} onChangeText={(v) => setDraft({ ...draft, [r.id]: v })} />
              <View style={s.row}>
                <Btn small kind="primary" title="Reply" disabled={!draft[r.id]} onPress={() => api(`/manage/${rid}/reviews/${r.id}/reply`, { body: { reply: draft[r.id] } }).then(load)} />
                {r.status === 'PUBLISHED' && <Btn small title="Flag for review" onPress={() => api(`/manage/${rid}/reviews/${r.id}/flag`, { body: {} }).then(load)} />}
              </View>
            </View>
          )}
        </View>
      )} />
  );
}
