import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Switch, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useKeepAwake } from 'expo-keep-awake';
import * as Haptics from 'expo-haptics';
import { api, label, timeIn, todayIn } from '../lib/api';
import { useRealtime } from '../lib/realtime';
import { FLOOR, useSession } from '../lib/session';
import { C, s } from '../lib/theme';
import { Badge, Btn, Chip, Chips, Empty, Loading, Sheet } from '../components/ui';
import { FloorPlan } from '../components/FloorPlan';
import { ResCard } from '../components/ResCard';
import { BookingForm, WaitlistForm } from '../components/Forms';
import { Image } from 'react-native';

const COURSE_FLOW = ['SEATED', 'APPETIZER', 'ENTREE', 'DESSERT', 'CHECK_DROPPED', 'PAID', 'BUSSING'];
type Tab = 'upcoming' | 'seated' | 'waitlist' | 'done';

/** Host stand (spec F5): the screen that stays open on the iPad all service. */
export default function HostScreen() {
  useKeepAwake();
  const { restaurant, refreshRestaurant, can } = useSession();
  const rid = restaurant!.id, tz = restaurant!.timezone;
  const win = useWindowDimensions();
  const [width, setWidth] = useState(win.width);
  const wide = width >= 820;
  const [date] = useState(() => todayIn(tz));
  const [floor, setFloor] = useState<any>(null);
  const [book, setBook] = useState<any[]>([]);
  const [waitlist, setWaitlist] = useState<any[]>([]);
  const [tab, setTab] = useState<Tab>('upcoming');
  const [view, setView] = useState<'list' | 'floor'>('list');
  const [roomId, setRoomId] = useState('all');
  const [selRes, setSelRes] = useState<any>(null);
  const [selWait, setSelWait] = useState<any>(null);
  const [selTable, setSelTable] = useState<any>(null);
  const [suggested, setSuggested] = useState<string[]>([]);
  const [sheet, setSheet] = useState<null | 'book' | 'walkin' | 'wait' | 'spend'>(null);
  const [spendFor, setSpendFor] = useState<any>(null);
  const [spend, setSpend] = useState('');
  const [toast, setToast] = useState('');

  const load = useCallback(async () => {
    const [f, b, w] = await Promise.all([api(`/manage/${rid}/floor`), api(`/manage/${rid}/reservations?date=${date}`), api(`/manage/${rid}/waitlist`)]);
    setFloor(f); setBook(b); setWaitlist(w);
  }, [rid, date]);
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);
  useRealtime(rid, () => load());

  useEffect(() => {
    setSuggested([]);
    const q = selRes ? `reservationId=${selRes.id}` : selWait ? `party=${selWait.partySize}` : null;
    if (q) api(`/manage/${rid}/suggest-tables?${q}`).then((x) => setSuggested(x.tableIds)).catch(() => {});
  }, [selRes, selWait, rid]);

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3000); };
  const run = async (fn: () => Promise<any>, ok: string) => {
    try { await fn(); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); flash(ok); setSelRes(null); setSelWait(null); setSelTable(null); await load(); }
    catch (e: any) { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {}); Alert.alert('Could not do that', e.message); }
  };

  const groups = useMemo(() => ({
    upcoming: book.filter((r) => ['CONFIRMED', 'REQUESTED'].includes(r.status)),
    seated: book.filter((r) => r.status === 'SEATED'),
    done: book.filter((r) => ['COMPLETED', 'NO_SHOW', 'CANCELLED', 'DECLINED'].includes(r.status)),
  }), [book]);
  if (!floor) return <Loading />;
  const tableName = (id: string) => floor.tables.find((t: any) => t.id === id)?.name ?? '?';
  const covers = book.filter((r) => ['CONFIRMED', 'SEATED', 'COMPLETED'].includes(r.status)).reduce((n, r) => n + r.partySize, 0);
  const tables = floor.tables.filter((t: any) => roomId === 'all' || t.roomId === roomId);

  const tapTable = (t: any) => {
    Haptics.selectionAsync().catch(() => {});
    if (selRes) return run(() => api(`/manage/${rid}/reservations/${selRes.id}/seat`, { body: { tableIds: [t.id] } }), `Seated ${selRes.guestName} at ${t.name}`);
    if (selWait) return run(() => api(`/manage/${rid}/waitlist/${selWait.id}/seat`, { body: { tableIds: [t.id] } }), `Seated ${selWait.guestName} at ${t.name}`);
    setSelTable(t);
  };
  const pickToSeat = (r: any, isWait = false) => {
    if (isWait) { setSelRes(null); setSelWait(selWait?.id === r.id ? null : r); } else { setSelWait(null); setSelRes(selRes?.id === r.id ? null : r); }
    if (!wide) setView('floor');
  };

  const list = (
    <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
      <Chips>{(['upcoming', 'seated', 'waitlist', 'done'] as Tab[]).map((k) =>
        <Chip key={k} label={`${label(k)} (${k === 'waitlist' ? waitlist.length : groups[k].length})`} on={tab === k} onPress={() => setTab(k)} />)}</Chips>
      <View style={{ height: 8 }} />
      {tab === 'waitlist' ? (waitlist.length ? waitlist.map((e) => (
        <Pressable key={e.id} onPress={() => pickToSeat(e, true)} style={[s.card, { marginBottom: 8, borderColor: selWait?.id === e.id ? C.brand : C.line, borderWidth: selWait?.id === e.id ? 2 : 1 }]}>
          <View style={[s.row, { justifyContent: 'space-between' }]}>
            <Text style={{ fontSize: 16, fontFamily: 'Nunito_800ExtraBold' }}>{e.guestName} · {e.partySize}</Text>
            <Badge text={e.status === 'NOTIFIED' ? 'Texted' : 'Waiting'} color={e.status === 'NOTIFIED' ? C.info : C.warn} />
          </View>
          <Text style={s.muted}>Waited {Math.round((Date.now() - new Date(e.createdAt).getTime()) / 60000)} min · quoted {e.quotedMinutes} min{e.joinedRemotely ? ' · joined remotely' : ''}</Text>
          {!!e.notes && <Text style={s.body}>{e.notes}</Text>}
          <View style={[s.row, { marginTop: 8 }]}>
            <Btn small title="Text: table ready" onPress={() => run(() => api(`/manage/${rid}/waitlist/${e.id}/notify`, { body: {} }), 'Table-ready text sent')} />
            <Btn small kind="danger" title="Left" onPress={() => run(() => api(`/manage/${rid}/waitlist/${e.id}/remove`, { body: { status: 'LEFT' } }), 'Removed')} />
          </View>
        </Pressable>
      )) : <Empty text="No one waiting." />) : (groups[tab].length ? groups[tab].map((r: any) => (
        <ResCard key={r.id} r={r} tableName={tableName} selected={selRes?.id === r.id} onPress={() => r.status === 'CONFIRMED' && pickToSeat(r)}>
          {r.status === 'CONFIRMED' && <View style={[s.row, { marginTop: 8 }]}>
            {r.tableIds.length > 0 && <Btn small kind="dark" title={`Seat at ${r.tableIds.map(tableName).join('+')}`} onPress={() => run(() => api(`/manage/${rid}/reservations/${r.id}/seat`, { body: {} }), `Seated ${r.guestName}`)} />}
            <Btn small kind="danger" title="No-show" onPress={() => run(() => api(`/manage/${rid}/reservations/${r.id}/no-show`, { body: {} }), 'Marked no-show')} />
          </View>}
          {r.status === 'REQUESTED' && <Text style={[s.muted, { marginTop: 6 }]}>Large-party request. Approve it in Bookings.</Text>}
          {r.status === 'SEATED' && <View style={[s.row, { marginTop: 8 }]}>
            <Btn small kind="primary" title="Paid & left" onPress={() => { setSpendFor(r); setSpend(''); setSheet('spend'); }} />
          </View>}
        </ResCard>
      )) : <Empty text="Nothing here." />)}
    </ScrollView>
  );

  const floorView = (
    <View style={{ flex: 1 }}>
      <Chips>
        <Chip label="All rooms" on={roomId === 'all'} onPress={() => setRoomId('all')} />
        {floor.rooms.map((r: any) => <Chip key={r.id} label={r.name} on={roomId === r.id} onPress={() => setRoomId(r.id)} />)}
      </Chips>
      {(selRes || selWait) && (
        <View style={[s.card, { backgroundColor: '#fff7ed', marginTop: 6 }]}>
          <Text style={s.body}>Tap a table to seat <Text style={{ fontFamily: 'Nunito_800ExtraBold' }}>{(selRes ?? selWait).guestName}</Text>
            {suggested.length > 0 && <Text> · suggested <Text style={{ fontFamily: 'Nunito_800ExtraBold' }}>{suggested.map(tableName).join(' + ')}</Text></Text>}</Text>
          <View style={[s.row, { marginTop: 6 }]}>
            {suggested.length > 0 && <Btn small kind="primary" title="Seat at suggested" onPress={() => run(() => selRes
              ? api(`/manage/${rid}/reservations/${selRes.id}/seat`, { body: { tableIds: suggested } })
              : api(`/manage/${rid}/waitlist/${selWait.id}/seat`, { body: { tableIds: suggested } }), 'Seated')} />}
            <Btn small title="Cancel" onPress={() => { setSelRes(null); setSelWait(null); }} />
          </View>
        </View>
      )}
      <View style={[s.card, { flex: 1, marginTop: 8, padding: 4 }]}>
        <FloorPlan tables={tables} timezone={tz} selectedId={selTable?.id} suggested={suggested} onPress={tapTable} />
      </View>
    </View>
  );

  return (
    <View style={[s.screen, { padding: 12 }]} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <View style={[s.row, { justifyContent: 'space-between', flexWrap: 'wrap', marginBottom: 8 }]}>
        <View style={s.row}>
          <Image source={require('../../assets/logo-mark.png')} style={{ width: 36, height: 36 }} />
          <View>
          <Text style={s.h1}>{restaurant!.name}</Text>
          <Text style={s.muted}>{covers} covers · {groups.upcoming.length} upcoming · {waitlist.length} waiting{toast ? `   ✓ ${toast}` : ''}</Text>
          </View>
        </View>
        <View style={[s.row, { flexWrap: 'wrap' }]}>
          {can(...FLOOR) && <View style={s.row}><Text style={s.muted}>Online</Text>
            <Switch value={restaurant!.onlineBookingEnabled} onValueChange={(v) => api(`/manage/${rid}/settings/online-booking`, { method: 'PUT', body: { enabled: v } }).then(refreshRestaurant)} /></View>}
          <Btn small title="+ Waitlist" onPress={() => setSheet('wait')} />
          <Btn small title="Walk-in" onPress={() => setSheet('walkin')} />
          <Btn small kind="primary" title="New booking" onPress={() => setSheet('book')} />
        </View>
      </View>
      {!wide && <View style={[s.row, { marginBottom: 8 }]}>
        <Chip label="List" on={view === 'list'} onPress={() => setView('list')} />
        <Chip label="Floor plan" on={view === 'floor'} onPress={() => setView('floor')} />
      </View>}
      {wide
        ? <View style={{ flex: 1, flexDirection: 'row', gap: 12 }}><View style={{ width: 380 }}>{list}</View><View style={{ flex: 1 }}>{floorView}</View></View>
        : view === 'list' ? list : floorView}

      <Sheet visible={!!selTable && !selRes && !selWait} title={selTable ? `Table ${selTable.name} · ${label(selTable.status)}` : ''} onClose={() => setSelTable(null)}>
        {selTable && <>
          <Text style={s.body}>{selTable.current
            ? `${selTable.current.guestName}, party of ${selTable.current.partySize}, seated ${timeIn(selTable.current.seatedAt, tz)}`
            : `${selTable.minCovers}–${selTable.maxCovers} covers${selTable.next ? ` · next ${timeIn(selTable.next.startsAt, tz)} (${selTable.next.guestName})` : ''}`}</Text>
          {selTable.status !== 'AVAILABLE' && selTable.status !== 'OUT_OF_SERVICE' && <>
            <Text style={s.label}>Course</Text>
            <View style={[s.row, { flexWrap: 'wrap' }]}>{COURSE_FLOW.map((st) => <Chip key={st} label={label(st)} on={selTable.status === st}
              onPress={() => run(() => api(`/manage/${rid}/tables/${selTable.id}/status`, { method: 'PATCH', body: { status: st } }), `Table ${selTable.name}: ${label(st)}`)} />)}</View>
            <Btn style={{ marginTop: 12 }} kind="primary" title="Clear table" onPress={() => run(() => api(`/manage/${rid}/tables/${selTable.id}/status`, { method: 'PATCH', body: { status: 'AVAILABLE' } }), `Table ${selTable.name} cleared`)} />
          </>}
          {selTable.status === 'AVAILABLE' && <View style={{ gap: 8, marginTop: 12 }}>
            <Btn kind="primary" title="Seat a walk-in here" onPress={() => setSheet('walkin')} />
            <Btn title="Block table" onPress={() => run(() => api(`/manage/${rid}/tables/${selTable.id}/status`, { method: 'PATCH', body: { status: 'OUT_OF_SERVICE' } }), 'Table blocked')} />
          </View>}
          {selTable.status === 'OUT_OF_SERVICE' && <Btn style={{ marginTop: 12 }} title="Unblock table" onPress={() => run(() => api(`/manage/${rid}/tables/${selTable.id}/status`, { method: 'PATCH', body: { status: 'AVAILABLE' } }), 'Table unblocked')} />}
        </>}
      </Sheet>
      <Sheet visible={sheet === 'book'} title="New booking" onClose={() => setSheet(null)}>
        <BookingForm rid={rid} date={date} onDone={(m) => { setSheet(null); flash(m); load(); }} />
      </Sheet>
      <Sheet visible={sheet === 'walkin'} title={selTable ? `Walk-in at ${selTable.name}` : 'Seat a walk-in'} onClose={() => setSheet(null)}>
        <BookingForm rid={rid} date={date} walkIn tableIds={selTable ? [selTable.id] : undefined} onDone={(m) => { setSheet(null); setSelTable(null); flash(m); load(); }} />
      </Sheet>
      <Sheet visible={sheet === 'wait'} title="Add to waitlist" onClose={() => setSheet(null)}>
        <WaitlistForm rid={rid} onDone={() => { setSheet(null); setTab('waitlist'); load(); }} />
      </Sheet>
      <Sheet visible={sheet === 'spend'} title={spendFor ? `${spendFor.guestName}: paid & left` : ''} onClose={() => setSheet(null)}>
        <Text style={s.label}>Check total ($, optional)</Text>
        <TextInput style={s.input} value={spend} onChangeText={setSpend} keyboardType="decimal-pad" placeholder="e.g. 142.50" />
        <Btn style={{ marginTop: 12 }} kind="primary" title="Complete visit & clear table" onPress={() => { setSheet(null);
          run(() => api(`/manage/${rid}/reservations/${spendFor.id}/complete`, { body: spend ? { spendCents: Math.round(Number(spend) * 100) } : {} }), 'Table cleared'); }} />
      </Sheet>
    </View>
  );
}
