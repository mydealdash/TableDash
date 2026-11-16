import { useEffect, useState } from 'react';
import { Switch, Text, TextInput, View } from 'react-native';
import { api } from '../lib/api';
import { s } from '../lib/theme';
import { Btn, Chip, Chips } from './ui';

const OCCASIONS = ['Birthday', 'Anniversary', 'Date night', 'Business', 'Celebration'];
const TIMES = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2) + (i >= 0 ? 0 : 0)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`).filter((t) => t >= '10:00' && t <= '23:00');

/** Phone booking (date + time) or walk-in (seat now). */
export function BookingForm({ rid, date, walkIn, tableIds, onDone }: { rid: string; date: string; walkIn?: boolean; tableIds?: string[]; onDone: (msg: string) => void }) {
  const [f, setF] = useState({ guestName: '', guestPhone: '', guestEmail: '', partySize: 2, date, time: '19:00', specialRequest: '', occasion: '' });
  const [force, setForce] = useState(false);
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const set = (k: string, v: any) => setF((x) => ({ ...x, [k]: v }));
  return (
    <View>
      <Text style={s.label}>Guest name</Text><TextInput style={s.input} value={f.guestName} onChangeText={(v) => set('guestName', v)} />
      <Text style={s.label}>Mobile</Text><TextInput style={s.input} value={f.guestPhone} onChangeText={(v) => set('guestPhone', v)} keyboardType="phone-pad" placeholder="+15551234567" />
      <Text style={s.label}>Party</Text>
      <Chips>{Array.from({ length: 12 }, (_, i) => i + 1).map((n) => <Chip key={n} label={String(n)} on={f.partySize === n} onPress={() => set('partySize', n)} />)}</Chips>
      {!walkIn && <>
        <Text style={s.label}>Date (YYYY-MM-DD)</Text><TextInput style={s.input} value={f.date} onChangeText={(v) => set('date', v)} />
        <Text style={s.label}>Time</Text>
        <Chips>{TIMES.map((t) => <Chip key={t} label={t} on={f.time === t} onPress={() => set('time', t)} />)}</Chips>
        <Text style={s.label}>Email</Text><TextInput style={s.input} value={f.guestEmail} onChangeText={(v) => set('guestEmail', v)} autoCapitalize="none" keyboardType="email-address" />
      </>}
      <Text style={s.label}>Occasion</Text>
      <Chips>{OCCASIONS.map((o) => <Chip key={o} label={o} on={f.occasion === o} onPress={() => set('occasion', f.occasion === o ? '' : o)} />)}</Chips>
      <Text style={s.label}>Notes</Text><TextInput style={s.input} value={f.specialRequest} onChangeText={(v) => set('specialRequest', v)} placeholder="Allergies, high chair…" />
      {tableIds?.length ? <Text style={[s.muted, { marginTop: 8 }]}>Using the table you selected on the floor.</Text> : null}
      <View style={[s.row, { marginTop: 12 }]}><Switch value={force} onValueChange={setForce} /><Text style={s.body}>Override availability (overbook)</Text></View>
      {!!err && <Text style={{ color: '#b91c1c', marginTop: 8 }}>{err}</Text>}
      <Btn style={{ marginTop: 14 }} kind="primary" loading={busy} disabled={!f.guestName} title={walkIn ? 'Seat walk-in' : 'Book'} onPress={async () => {
        setBusy(true); setErr('');
        try {
          await api(`/manage/${rid}/reservations`, { body: {
            ...f, guestPhone: f.guestPhone || undefined, guestEmail: f.guestEmail || undefined, specialRequest: f.specialRequest || undefined,
            occasion: f.occasion || undefined, seatNow: !!walkIn, tableIds: tableIds?.length ? tableIds : undefined, force,
          } });
          onDone(walkIn ? 'Walk-in seated' : 'Booked');
        } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
      }} />
    </View>
  );
}

export function WaitlistForm({ rid, onDone }: { rid: string; onDone: () => void }) {
  const [f, setF] = useState({ guestName: '', guestPhone: '', partySize: 2, notes: '' });
  const [quote, setQuote] = useState<number | null>(null); const [err, setErr] = useState('');
  useEffect(() => { api(`/restaurants/${rid}/waitlist/quote?party=${f.partySize}`).then((q) => setQuote(q.quotedMinutes)).catch(() => setQuote(null)); }, [rid, f.partySize]);
  return (
    <View>
      <Text style={s.label}>Name</Text><TextInput style={s.input} value={f.guestName} onChangeText={(v) => setF({ ...f, guestName: v })} />
      <Text style={s.label}>Mobile</Text><TextInput style={s.input} value={f.guestPhone} onChangeText={(v) => setF({ ...f, guestPhone: v })} keyboardType="phone-pad" placeholder="+15551234567" />
      <Text style={s.label}>Party</Text>
      <Chips>{Array.from({ length: 10 }, (_, i) => i + 1).map((n) => <Chip key={n} label={String(n)} on={f.partySize === n} onPress={() => setF({ ...f, partySize: n })} />)}</Chips>
      <Text style={s.label}>Notes</Text><TextInput style={s.input} value={f.notes} onChangeText={(v) => setF({ ...f, notes: v })} />
      <Text style={[s.body, { marginTop: 10 }]}>Suggested quote: <Text style={{ fontWeight: '800' }}>{quote == null ? '—' : `${quote} min`}</Text></Text>
      {!!err && <Text style={{ color: '#b91c1c', marginTop: 8 }}>{err}</Text>}
      <Btn style={{ marginTop: 14 }} kind="primary" title="Add to waitlist" disabled={!f.guestName || !f.guestPhone} onPress={async () => {
        try { await api(`/manage/${rid}/waitlist`, { body: { ...f, notes: f.notes || undefined } }); onDone(); } catch (e: any) { setErr(e.message); }
      }} />
    </View>
  );
}
