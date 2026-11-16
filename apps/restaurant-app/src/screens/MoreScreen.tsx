import { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { api, label, money } from '../lib/api';
import { FLOOR, MANAGERS, useSession } from '../lib/session';
import { s } from '../lib/theme';
import { Btn, Chip } from '../components/ui';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Settings that matter during the day. Floor-plan drawing and staff invites also live in the web back office. */
export default function MoreScreen({ navigation }: any) {
  const { restaurant, memberships, selectRestaurant, signOut, refreshRestaurant, user, can } = useSession();
  const rid = restaurant!.id;
  const [cfg, setCfg] = useState<any>(null);
  const [closure, setClosure] = useState(''); const [reason, setReason] = useState('');
  const [rules, setRules] = useState<any>(null);
  const load = useCallback(() => api(`/manage/${rid}/settings`).then((x) => { setCfg(x); setRules({
    bookingWindowDays: x.restaurant.bookingWindowDays, maxPartyOnline: x.restaurant.maxPartyOnline, graceMinutes: x.restaurant.graceMinutes, holdMinutes: x.restaurant.holdMinutes }); }), [rid]);
  useEffect(() => { load(); }, [load]);
  const policy = cfg?.policies.find((p: any) => p.active);
  const num = (k: string) => <TextInput style={[s.input, { width: 80 }]} keyboardType="number-pad" value={String(rules[k])} onChangeText={(v) => setRules({ ...rules, [k]: Number(v) || 0 })} />;

  return (
    <ScrollView style={s.screen} contentContainerStyle={{ padding: 12, gap: 10, paddingBottom: 40 }}>
      <View style={s.card}>
        <Text style={s.h2}>Signed in</Text>
        <Text style={s.body}>{user?.firstName} {user?.lastName} · {restaurant!.role}</Text>
        {memberships.length > 1 && <>
          <Text style={s.label}>Switch restaurant</Text>
          <View style={[s.row, { flexWrap: 'wrap' }]}>{memberships.map((m) => <Chip key={m.restaurantId} label={m.name} on={m.restaurantId === rid} onPress={() => selectRestaurant(m.restaurantId)} />)}</View>
        </>}
        <Btn style={{ marginTop: 10 }} title="Sign out" onPress={signOut} />
      </View>

      {can(...FLOOR) && <View style={[s.card, s.row, { justifyContent: 'space-between' }]}>
        <View style={{ flex: 1 }}><Text style={s.h2}>Online booking</Text><Text style={s.muted}>Turn off to stop all diner and partner bookings right away.</Text></View>
        <Switch value={restaurant!.onlineBookingEnabled} onValueChange={(v) => api(`/manage/${rid}/settings/online-booking`, { method: 'PUT', body: { enabled: v } }).then(refreshRestaurant)} />
      </View>}

      {cfg && can(...MANAGERS) && rules && <View style={s.card}>
        <Text style={s.h2}>Booking rules</Text>
        {[['bookingWindowDays', 'Days ahead diners can book'], ['maxPartyOnline', 'Largest party bookable online'], ['holdMinutes', 'Checkout hold (minutes)'], ['graceMinutes', 'No-show grace (minutes)']].map(([k, l]) => (
          <View key={k} style={[s.row, { justifyContent: 'space-between', marginTop: 6 }]}><Text style={s.body}>{l}</Text>{num(k)}</View>
        ))}
        <Btn style={{ marginTop: 10 }} kind="primary" title="Save rules" onPress={async () => { await api(`/manage/${rid}/settings/profile`, { method: 'PATCH', body: rules }); Alert.alert('Saved'); }} />
      </View>}

      {cfg && <View style={s.card}>
        <Text style={s.h2}>Shifts</Text>
        {cfg.shifts.map((x: any) => <Text key={x.id} style={s.body}>{x.name}: {x.daysOfWeek.map((d: number) => DAYS[d]).join(' ')} · {x.startTime}–{x.endTime} · every {x.slotInterval} min · max {x.maxCoversPerSlot ?? '∞'} covers / {x.maxPartiesPerSlot ?? '∞'} parties per slot{x.onlineEnabled ? '' : ' · phone only'}</Text>)}
        {policy && <>
          <Text style={[s.h2, { marginTop: 10 }]}>Policy v{policy.version}</Text>
          <Text style={s.body}>{label(policy.depositType)} · deposit {money(policy.depositAmountCents)} · no-show {money(policy.noShowFeeCents)}/person · free cancellation until {policy.cancelCutoffHours}h before</Text>
          <Text style={s.muted}>{policy.text}</Text>
        </>}
        <Text style={[s.muted, { marginTop: 8 }]}>Edit shifts, floor plan, turn times, policies and staff in the web back office.</Text>
      </View>}

      {cfg && can(...MANAGERS) && <View style={s.card}>
        <Text style={s.h2}>Closed dates</Text>
        {cfg.closures.map((c: any) => <View key={c.id} style={[s.row, { justifyContent: 'space-between' }]}><Text style={s.body}>{c.date} — {c.reason ?? 'Closed'}</Text>
          <Btn small title="Remove" onPress={() => api(`/manage/${rid}/settings/closures/${c.id}`, { method: 'DELETE' }).then(load)} /></View>)}
        <View style={[s.row, { marginTop: 8, flexWrap: 'wrap' }]}>
          <TextInput style={[s.input, { width: 130 }]} placeholder="YYYY-MM-DD" value={closure} onChangeText={setClosure} />
          <TextInput style={[s.input, { flex: 1, minWidth: 120 }]} placeholder="Reason" value={reason} onChangeText={setReason} />
          <Btn kind="primary" title="Close date" disabled={!/^\d{4}-\d{2}-\d{2}$/.test(closure)} onPress={() => api(`/manage/${rid}/settings/closures`, { body: { date: closure, reason: reason || undefined } }).then(() => { setClosure(''); setReason(''); load(); })} />
        </View>
      </View>}

      <View style={[s.row, { flexWrap: 'wrap' }]}>
        <Btn title="Guestbook" onPress={() => navigation.navigate('Guests')} />
        <Btn title="Reviews" onPress={() => navigation.navigate('Reviews')} />
      </View>
    </ScrollView>
  );
}
