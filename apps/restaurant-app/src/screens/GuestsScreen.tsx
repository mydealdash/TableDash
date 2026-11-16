import { useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, Switch, Text, TextInput, View } from 'react-native';
import { api, label, money } from '../lib/api';
import { useSession } from '../lib/session';
import { C, RES_COLOR, s } from '../lib/theme';
import { Badge, Btn, Empty, Sheet } from '../components/ui';

/** Guestbook (spec 9.9): search, profile, tags, VIP, allergies, notes, visit history. */
export default function GuestsScreen() {
  const { restaurant } = useSession();
  const rid = restaurant!.id;
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<any[]>([]);
  const [g, setG] = useState<any>(null);
  const [edit, setEdit] = useState<any>(null);
  const search = () => api(`/manage/${rid}/guests?q=${encodeURIComponent(q)}`).then(setRows);
  useEffect(() => { const t = setTimeout(search, 250); return () => clearTimeout(t); }, [q, rid]);
  const open = async (id: string) => { const x = await api(`/manage/${rid}/guests/${id}`); setG(x); setEdit({ tags: x.tags.join(', '), notes: x.notes, allergies: x.allergies, isVip: x.isVip }); };

  return (
    <View style={[s.screen, { padding: 12 }]}>
      <TextInput style={s.input} placeholder="Search name, phone or email" value={q} onChangeText={setQ} />
      <FlatList style={{ marginTop: 8 }} data={rows} keyExtractor={(x) => x.id} ListEmptyComponent={<Empty text="No guests found." />}
        renderItem={({ item: x }) => (
          <Pressable onPress={() => open(x.id)} style={[s.card, { marginBottom: 8 }]}>
            <View style={[s.row, { justifyContent: 'space-between' }]}>
              <Text style={{ fontSize: 16, fontWeight: '800' }}>{x.firstName} {x.lastName}</Text>
              {x.isVip && <Badge text="VIP" color={C.dark} />}
            </View>
            <Text style={s.muted}>{x.visitCount} visits · {x.noShowCount} no-shows · {money(x.totalSpendCents)} spent{x.lastVisitAt ? ` · last ${new Date(x.lastVisitAt).toLocaleDateString()}` : ''}</Text>
            {x.tags.length > 0 && <View style={[s.row, { flexWrap: 'wrap', gap: 4, marginTop: 4 }]}>{x.tags.map((t: string) => <Badge key={t} text={t} color={C.info} />)}</View>}
          </Pressable>
        )} />
      <Sheet visible={!!g} title={g ? `${g.firstName} ${g.lastName}` : ''} onClose={() => setG(null)}>
        {g && edit && <View>
          <Text style={s.muted}>{[g.phone, g.email].filter(Boolean).join(' · ')} · marketing {g.marketingConsent ? 'opted in' : 'not opted in'}</Text>
          <View style={[s.row, { marginTop: 10 }]}><Switch value={edit.isVip} onValueChange={(v) => setEdit({ ...edit, isVip: v })} /><Text style={s.body}>VIP</Text></View>
          <Text style={s.label}>Tags (comma separated)</Text><TextInput style={s.input} value={edit.tags} onChangeText={(v) => setEdit({ ...edit, tags: v })} />
          <Text style={s.label}>Allergies & dietary</Text><TextInput style={s.input} value={edit.allergies} onChangeText={(v) => setEdit({ ...edit, allergies: v })} />
          <Text style={s.label}>Notes</Text><TextInput style={[s.input, { minHeight: 70 }]} multiline value={edit.notes} onChangeText={(v) => setEdit({ ...edit, notes: v })} />
          <Btn style={{ marginTop: 12 }} kind="primary" title="Save guest" onPress={async () => {
            await api(`/manage/${rid}/guests/${g.id}`, { method: 'PATCH', body: { ...edit, tags: edit.tags.split(',').map((t: string) => t.trim()).filter(Boolean) } });
            Alert.alert('Saved'); open(g.id); search();
          }} />
          <Text style={s.label}>Visit history</Text>
          {g.history.map((r: any) => (
            <View key={r.id} style={[s.row, { justifyContent: 'space-between', paddingVertical: 4 }]}>
              <Text style={s.body}>{new Date(r.startsAt).toLocaleDateString()} · {r.partySize}</Text>
              <View style={s.row}><Text style={s.muted}>{money(r.spendCents)}</Text><Badge text={label(r.status)} color={RES_COLOR[r.status]} /></View>
            </View>
          ))}
        </View>}
      </Sheet>
    </View>
  );
}
