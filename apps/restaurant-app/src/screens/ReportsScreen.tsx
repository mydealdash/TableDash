import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { addDays, api, money, prettyDate, todayIn } from '../lib/api';
import { MANAGERS, useSession } from '../lib/session';
import { C, s } from '../lib/theme';
import { Btn, Chip, Chips, Loading } from '../components/ui';

/** Pre-shift report (OPS-01) and performance summary (OPS-02). */
export default function ReportsScreen() {
  const { restaurant, can } = useSession();
  const rid = restaurant!.id, tz = restaurant!.timezone;
  const [date, setDate] = useState(() => todayIn(tz));
  const [range, setRange] = useState(30);
  const [pre, setPre] = useState<any>(null);
  const [sum, setSum] = useState<any>(null);
  useEffect(() => { setPre(null); api(`/manage/${rid}/reports/pre-shift?date=${date}`).then(setPre); }, [rid, date]);
  useEffect(() => { if (can(...MANAGERS)) { const to = todayIn(tz); api(`/manage/${rid}/reports/summary?from=${addDays(to, -(range - 1))}&to=${to}`).then(setSum).catch(() => setSum(null)); } }, [rid, range]);
  const Kpi = ({ k, v }: { k: string; v: any }) => <View style={[s.card, { minWidth: 150, flexGrow: 1 }]}><Text style={s.muted}>{k}</Text><Text style={{ fontSize: 22, fontWeight: '800' }}>{v}</Text></View>;
  const List = ({ title, items }: { title: string; items: any[] }) => (
    <View style={[s.card, { marginTop: 8 }]}>
      <Text style={s.h2}>{title} ({items.length})</Text>
      {items.length ? items.map((x) => <Text key={x.id} style={[s.body, { marginBottom: 3 }]}>
        <Text style={{ fontWeight: '800' }}>{x.time}</Text> {x.name} · {x.partySize}{x.allergies ? ` · allergy: ${x.allergies}` : ''}{x.occasion ? ` · ${x.occasion}` : ''}{x.noShows ? ` · ${x.noShows} past no-show` : ''}{x.notes ? ` · ${x.notes}` : ''}
      </Text>) : <Text style={s.muted}>None</Text>}
    </View>
  );
  const max = Math.max(1, ...(sum?.dailyCovers ?? []).map((d: any) => d.covers));

  return (
    <ScrollView style={s.screen} contentContainerStyle={{ padding: 12, paddingBottom: 40 }}>
      <View style={[s.row, { justifyContent: 'space-between' }]}>
        <Text style={s.h1}>Pre-shift</Text>
        <View style={s.row}><Btn small title="‹" onPress={() => setDate(addDays(date, -1))} /><Text style={s.body}>{prettyDate(date)}</Text><Btn small title="›" onPress={() => setDate(addDays(date, 1))} /></View>
      </View>
      {!pre ? <Loading /> : <>
        <View style={[s.row, { flexWrap: 'wrap', marginTop: 8 }]}>
          <Kpi k="Covers" v={pre.covers} /><Kpi k="Parties" v={pre.parties} /><Kpi k="VIPs" v={pre.vips.length} /><Kpi k="No-show risk" v={pre.noShowRisk.length} />
        </View>
        <List title="VIPs" items={pre.vips} /><List title="Allergies" items={pre.allergies} /><List title="Occasions" items={pre.occasions} />
        <List title="Large parties" items={pre.largeParties} /><List title="Unconfirmed, past no-shows" items={pre.noShowRisk} /><List title="Pending requests" items={pre.pendingRequests} />
      </>}
      {sum && <>
        <View style={[s.row, { justifyContent: 'space-between', marginTop: 20 }]}>
          <Text style={s.h1}>Performance</Text>
          <Chips>{[7, 30, 90].map((d) => <Chip key={d} label={`${d} days`} on={range === d} onPress={() => setRange(d)} />)}</Chips>
        </View>
        <View style={[s.row, { flexWrap: 'wrap', marginTop: 8 }]}>
          <Kpi k="Covers" v={sum.covers} /><Kpi k="No-show rate" v={`${(sum.noShowRate * 100).toFixed(1)}%`} />
          <Kpi k="Avg turn" v={sum.avgTurnMinutes ? `${sum.avgTurnMinutes} min` : '—'} /><Kpi k="Spend / cover" v={money(sum.spendPerCoverCents)} />
          <Kpi k="Waitlist seated" v={`${sum.waitlist.seated}/${sum.waitlist.joined}`} /><Kpi k="Notify converted" v={`${sum.notify.converted}/${sum.notify.subscriptions}`} />
        </View>
        <View style={[s.card, { marginTop: 8 }]}>
          <Text style={s.h2}>Covers per day</Text>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 120, gap: 3 }}>
            {sum.dailyCovers.map((d: any) => <View key={d.date} style={{ flex: 1, height: `${(d.covers / max) * 100}%`, backgroundColor: C.brand, borderTopLeftRadius: 3, borderTopRightRadius: 3 }} />)}
          </View>
          {sum.dailyCovers.length === 0 && <Text style={s.muted}>No completed visits in this range.</Text>}
        </View>
        <View style={[s.card, { marginTop: 8 }]}>
          <Text style={s.h2}>By channel</Text>
          {Object.entries(sum.byChannel).map(([k, v]: any) => <Text key={k} style={s.body}>{k}: {v.parties} parties, {v.covers} covers</Text>)}
        </View>
      </>}
    </ScrollView>
  );
}
