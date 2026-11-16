'use client';
import { useEffect, useState } from 'react';
import { addDays, api, money, todayIn } from '@/lib/api';
import { useRestaurant } from '../context';

export default function Reports() {
  const { rid, timezone, role } = useRestaurant();
  const today = todayIn(timezone);
  const [date, setDate] = useState(today);
  const [from, setFrom] = useState(addDays(today, -29));
  const [to, setTo] = useState(today);
  const [pre, setPre] = useState<any>(null);
  const [sum, setSum] = useState<any>(null);
  const [billing, setBilling] = useState<any[]>([]);
  useEffect(() => { api(`/manage/${rid}/reports/pre-shift?date=${date}`).then(setPre); }, [rid, date]);
  useEffect(() => { api(`/manage/${rid}/reports/summary?from=${from}&to=${to}`).then(setSum).catch(() => setSum(null)); }, [rid, from, to]);
  useEffect(() => { if (['OWNER', 'ADMIN'].includes(role)) api(`/manage/${rid}/reports/billing`).then(setBilling).catch(() => {}); }, [rid, role]);
  const max = Math.max(1, ...(sum?.dailyCovers ?? []).map((d: any) => d.covers));

  const List = ({ title, items }: { title: string; items: any[] }) => (
    <div className="card"><h3>{title} ({items.length})</h3>
      {items.length ? <ul className="small" style={{ margin: 0, paddingLeft: 16 }}>{items.map((x) => (
        <li key={x.id}><b>{x.time}</b> {x.name} · {x.partySize}{x.allergies && ` · allergy: ${x.allergies}`}{x.occasion && ` · ${x.occasion}`}{x.noShows ? ` · ${x.noShows} prior no-show` : ''}{x.notes && ` · ${x.notes}`}</li>
      ))}</ul> : <div className="muted small">None</div>}
    </div>
  );

  return (
    <div>
      <div className="spread"><h1>Pre-shift report</h1><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
      {pre && <>
        <div className="kpi">
          <div className="card">Covers<b>{pre.covers}</b></div><div className="card">Parties<b>{pre.parties}</b></div>
          <div className="card">VIPs<b>{pre.vips.length}</b></div><div className="card">No-show risk<b>{pre.noShowRisk.length}</b></div>
        </div>
        <div className="grid2" style={{ marginBottom: 24 }}>
          <List title="VIPs" items={pre.vips} /><List title="Allergies" items={pre.allergies} />
          <List title="Occasions" items={pre.occasions} /><List title="Large parties" items={pre.largeParties} />
          <List title="Unconfirmed with past no-shows" items={pre.noShowRisk} /><List title="Pending requests" items={pre.pendingRequests} />
        </div>
      </>}

      {sum && <>
        <div className="spread"><h1>Performance</h1>
          <div className="row"><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />–<input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        </div>
        <div className="kpi">
          <div className="card">Covers<b>{sum.covers}</b></div>
          <div className="card">No-show rate<b>{(sum.noShowRate * 100).toFixed(1)}%</b></div>
          <div className="card">Avg turn<b>{sum.avgTurnMinutes ?? '—'} min</b></div>
          <div className="card">Spend / cover<b>{money(sum.spendPerCoverCents)}</b></div>
          <div className="card">Waitlist seated<b>{sum.waitlist.seated}/{sum.waitlist.joined}</b></div>
          <div className="card">Notify converted<b>{sum.notify.converted}/{sum.notify.subscriptions}</b></div>
        </div>
        <div className="grid2">
          <div className="card"><h3>Covers per day</h3>
            <div className="bars" style={{ marginBottom: 20 }}>{sum.dailyCovers.map((d: any) => (
              <div key={d.date} title={`${d.date}: ${d.covers}`} style={{ height: `${(d.covers / max) * 100}%` }}><span>{d.date.slice(8)}</span></div>
            ))}</div>
            {sum.dailyCovers.length === 0 && <p className="muted small">No completed visits in this range.</p>}
          </div>
          <div className="card"><h3>Covers by channel</h3>
            <table className="list"><tbody>{Object.entries(sum.byChannel).map(([k, v]: any) => <tr key={k}><td>{k}</td><td>{v.parties} parties</td><td>{v.covers} covers</td></tr>)}</tbody></table>
          </div>
        </div>
      </>}

      {billing.length > 0 && <div className="card" style={{ marginTop: 16 }}><h3>Billable network covers</h3>
        <table className="list"><tbody>{billing.map((b) => <tr key={b.month}><td>{b.month}</td><td>{b.networkCovers}</td></tr>)}</tbody></table></div>}
    </div>
  );
}
