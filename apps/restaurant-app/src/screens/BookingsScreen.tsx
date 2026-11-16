import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Text, TextInput, View } from 'react-native';
import { addDays, api, label, money, prettyDate, todayIn } from '../lib/api';
import { useRealtime } from '../lib/realtime';
import { MANAGERS, useSession } from '../lib/session';
import { C, s } from '../lib/theme';
import { Btn, Chip, Chips, Empty, Sheet } from '../components/ui';
import { ResCard } from '../components/ResCard';
import { BookingForm } from '../components/Forms';

/** Reservation book by date: create, modify, cancel, no-show, approve large parties, waive fees. */
export default function BookingsScreen() {
  const { restaurant, can } = useSession();
  const rid = restaurant!.id, tz = restaurant!.timezone;
  const [date, setDate] = useState(() => todayIn(tz));
  const [rows, setRows] = useState<any[]>([]);
  const [tables, setTables] = useState<any[]>([]);
  const [hideCancelled, setHideCancelled] = useState(true);
  const [sel, setSel] = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [creating, setCreating] = useState(false);
  const [pick, setPick] = useState<string[]>([]);
  const [time, setTime] = useState(''); const [party, setParty] = useState(2);

  const load = useCallback(() => api(`/manage/${rid}/reservations?date=${date}`).then(setRows), [rid, date]);
  useEffect(() => { load(); api(`/manage/${rid}/floor`).then((f) => setTables(f.tables)); }, [load, rid]);
  useRealtime(rid, () => load());
  useEffect(() => { if (sel) { api(`/manage/${rid}/reservations/${sel.id}/events`).then(setEvents); setTime(sel.localTime); setParty(sel.partySize); setPick([]); } }, [sel, rid]);
  const tableName = (id: string) => tables.find((t) => t.id === id)?.name ?? '?';
  const act = async (fn: () => Promise<any>, ok: string) => { try { await fn(); Alert.alert(ok); setSel(null); load(); } catch (e: any) { Alert.alert('Could not do that', e.message); } };
  const visible = rows.filter((r) => !hideCancelled || !['CANCELLED', 'DECLINED'].includes(r.status));
  const covers = visible.filter((r) => r.status !== 'NO_SHOW').reduce((n, r) => n + r.partySize, 0);

  return (
    <View style={[s.screen, { padding: 12 }]}>
      <View style={[s.row, { justifyContent: 'space-between', flexWrap: 'wrap' }]}>
        <View style={s.row}>
          <Btn small title="‹" onPress={() => setDate(addDays(date, -1))} />
          <Text style={[s.h2, { marginBottom: 0 }]}>{prettyDate(date)}</Text>
          <Btn small title="›" onPress={() => setDate(addDays(date, 1))} />
          <Btn small title="Today" onPress={() => setDate(todayIn(tz))} />
        </View>
        <Btn small kind="primary" title="New booking" onPress={() => setCreating(true)} />
      </View>
      <View style={[s.row, { marginVertical: 8 }]}>
        <Text style={s.muted}>{visible.length} parties · {covers} covers</Text>
        <Chip label={hideCancelled ? 'Show cancelled' : 'Hide cancelled'} onPress={() => setHideCancelled(!hideCancelled)} />
      </View>
      <FlatList data={visible} keyExtractor={(r) => r.id} ListEmptyComponent={<Empty text="No reservations for this date." />}
        renderItem={({ item }) => <ResCard r={item} tableName={tableName} onPress={() => setSel(item)} />} />

      <Sheet visible={creating} title="New booking" onClose={() => setCreating(false)}>
        <BookingForm rid={rid} date={date} onDone={() => { setCreating(false); load(); }} />
      </Sheet>
      <Sheet visible={!!sel} title={sel ? `${sel.guestName} · ${sel.partySize} · ${sel.localTime}` : ''} onClose={() => setSel(null)}>
        {sel && <View style={{ gap: 6 }}>
          <Text style={s.muted}>Code {sel.code} · {label(sel.status)} · {sel.channel}{sel.guestPhone ? ` · ${sel.guestPhone}` : ''}</Text>
          {sel.guest && <Text style={s.body}>Visits {sel.guest.visitCount} · no-shows {sel.guest.noShowCount} · lifetime spend {money(sel.guest.totalSpendCents)}{sel.guest.notes ? `\n${sel.guest.notes}` : ''}</Text>}

          {sel.status === 'REQUESTED' && <>
            <Text style={s.label}>Assign tables for this party</Text>
            <View style={[s.row, { flexWrap: 'wrap' }]}>{tables.map((t) => <Chip key={t.id} label={`${t.name} (${t.maxCovers})`} on={pick.includes(t.id)}
              onPress={() => setPick(pick.includes(t.id) ? pick.filter((x) => x !== t.id) : [...pick, t.id])} />)}</View>
            <Text style={s.muted}>Seats selected: {tables.filter((t) => pick.includes(t.id)).reduce((n, t) => n + t.maxCovers, 0)} of {sel.partySize}</Text>
            <Btn kind="primary" title="Approve request" disabled={!pick.length} onPress={() => act(() => api(`/manage/${rid}/reservations/${sel.id}/approve`, { body: { tableIds: pick } }), 'Request approved')} />
            <Btn kind="danger" title="Decline request" onPress={() => act(() => api(`/manage/${rid}/reservations/${sel.id}/decline`, { body: {} }), 'Request declined')} />
          </>}

          {sel.status === 'CONFIRMED' && <>
            <Text style={s.label}>Change time / party</Text>
            <View style={s.row}>
              <TextInput style={[s.input, { width: 90 }]} value={time} onChangeText={setTime} placeholder="19:30" />
              <TextInput style={[s.input, { width: 70 }]} value={String(party)} onChangeText={(v) => setParty(Number(v) || 1)} keyboardType="number-pad" />
              <Btn title="Save change" onPress={() => act(() => api(`/manage/${rid}/reservations/${sel.id}`, { method: 'PATCH', body: { time, partySize: party } }), 'Reservation updated')} />
            </View>
            <View style={[s.row, { marginTop: 8, flexWrap: 'wrap' }]}>
              <Btn kind="danger" title="No-show" onPress={() => act(() => api(`/manage/${rid}/reservations/${sel.id}/no-show`, { body: {} }), 'Marked no-show')} />
              <Btn title="Cancel booking" onPress={() => Alert.alert('Cancel this reservation?', 'The guest will be notified and not charged.', [
                { text: 'Keep', style: 'cancel' },
                { text: 'Cancel it', style: 'destructive', onPress: () => act(() => api(`/manage/${rid}/reservations/${sel.id}/cancel`, { body: { reason: 'Cancelled by restaurant' } }), 'Cancelled') }])} />
            </View>
          </>}

          {can(...MANAGERS) && sel.payments.filter((p: any) => ['NO_SHOW_FEE', 'LATE_CANCEL_FEE', 'DEPOSIT'].includes(p.kind) && p.status === 'CAPTURED').map((p: any) => (
            <Btn key={p.id} title={`Waive ${label(p.kind)} ${money(p.amountCents)}`} onPress={() => act(() => api(`/manage/${rid}/payments/${p.id}/waive`, { body: { reason: 'Waived by manager' } }), 'Fee waived')} />
          ))}
          <Text style={s.label}>History</Text>
          {events.map((e) => <Text key={e.id} style={s.muted}>{new Date(e.createdAt).toLocaleString()} — {label(e.type)}</Text>)}
        </View>}
      </Sheet>
    </View>
  );
}
