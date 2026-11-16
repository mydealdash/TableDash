'use client';
import { useCallback, useEffect, useState } from 'react';
import { addDays, api, money, todayIn } from '@/lib/api';
import { useRealtime } from '@/lib/realtime';
import { Modal } from '@/components/Modal';
import { BookingForm } from '@/components/BookingForm';
import { useRestaurant } from '../context';

export default function Reservations() {
  const { rid, timezone } = useRestaurant();
  const [date, setDate] = useState(() => todayIn(timezone));
  const [rows, setRows] = useState<any[]>([]);
  const [tables, setTables] = useState<any[]>([]);
  const [show, setShow] = useState<'active' | 'all'>('active');
  const [creating, setCreating] = useState(false);
  const [detail, setDetail] = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [approve, setApprove] = useState<any>(null);
  const [msg, setMsg] = useState('');

  const load = useCallback(() => api(`/manage/${rid}/reservations?date=${date}`).then(setRows), [rid, date]);
  useEffect(() => { load(); api(`/manage/${rid}/floor`).then((f) => setTables(f.tables)); }, [load, rid]);
  useRealtime(rid, () => load());
  useEffect(() => { if (detail) api(`/manage/${rid}/reservations/${detail.id}/events`).then(setEvents); }, [detail, rid]);

  const act = async (fn: () => Promise<any>, ok: string) => {
    try { await fn(); setMsg(ok); setDetail(null); setApprove(null); load(); } catch (e: any) { setMsg(`⚠ ${e.message}`); }
  };
  const visible = rows.filter((r) => show === 'all' || !['CANCELLED', 'DECLINED'].includes(r.status));
  const name = (id: string) => tables.find((t) => t.id === id)?.name ?? '';
  const covers = visible.filter((r) => r.status !== 'NO_SHOW').reduce((s, r) => s + r.partySize, 0);

  return (
    <div>
      <div className="spread" style={{ marginBottom: 14 }}>
        <div className="row">
          <h1 style={{ margin: 0 }}>Reservations</h1>
          <button className="btn sm" onClick={() => setDate(addDays(date, -1))}>‹</button>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <button className="btn sm" onClick={() => setDate(addDays(date, 1))}>›</button>
          <button className="btn sm" onClick={() => setDate(todayIn(timezone))}>Today</button>
          <span className="muted">{visible.length} parties · {covers} covers</span>
        </div>
        <div className="row">
          {msg && <span className={msg.startsWith('⚠') ? 'err' : 'ok'}>{msg}</span>}
          <select value={show} onChange={(e) => setShow(e.target.value as any)}><option value="active">Hide cancelled</option><option value="all">Show all</option></select>
          <a className="btn" href="#" onClick={async (e) => { e.preventDefault();
            const csv = await api(`/manage/${rid}/reports/reservations.csv?from=${date}&to=${date}`, { raw: true });
            const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = `reservations-${date}.csv`; a.click(); }}>Export CSV</a>
          <button className="btn primary" onClick={() => setCreating(true)}>New booking</button>
        </div>
      </div>
      <table className="list">
        <thead><tr><th>Time</th><th>Guest</th><th>Party</th><th>Table</th><th>Status</th><th>Source</th><th>Notes</th><th>Payment</th><th></th></tr></thead>
        <tbody>
          {visible.map((r) => (
            <tr key={r.id} className="click" onClick={() => setDetail(r)}>
              <td><b>{r.localTime}</b></td>
              <td>{r.guestName}{r.guest?.isVip && <> <span className="badge vip">VIP</span></>}<div className="small muted">{r.guestPhone ?? r.guestEmail}</div></td>
              <td>{r.partySize}</td>
              <td>{r.tableIds.map(name).join(' + ') || '—'}</td>
              <td><span className={`badge ${r.status}`}>{r.status.replace('_', ' ')}</span></td>
              <td className="small">{r.channel}{r.source ? ` · ${r.source}` : ''}</td>
              <td className="small">{[r.occasion, r.specialRequest, r.guest?.allergies && `Allergy: ${r.guest.allergies}`].filter(Boolean).join(' · ')}</td>
              <td className="small">{r.payments.map((p: any) => `${p.kind.replace(/_/g, ' ').toLowerCase()} ${money(p.amountCents)} (${p.status.toLowerCase()})`).join(', ') || '—'}</td>
              <td onClick={(e) => e.stopPropagation()}>
                {r.status === 'REQUESTED' && <button className="btn sm primary" onClick={() => setApprove({ ...r, pick: [] })}>Review request</button>}
              </td>
            </tr>
          ))}
          {visible.length === 0 && <tr><td colSpan={9} className="muted">No reservations for this date.</td></tr>}
        </tbody>
      </table>

      {creating && <Modal title="New booking" onClose={() => setCreating(false)}><BookingForm rid={rid} date={date} onDone={() => { setCreating(false); load(); }} /></Modal>}

      {approve && (
        <Modal title={`Large party: ${approve.guestName} (${approve.partySize})`} onClose={() => setApprove(null)}>
          <p className="muted">{approve.localTime} on {date}. {approve.specialRequest}</p>
          <p>Select tables to assign:</p>
          <div className="row">
            {tables.map((t) => (
              <label key={t.id} className="check"><input type="checkbox" checked={approve.pick.includes(t.id)}
                onChange={(e) => setApprove({ ...approve, pick: e.target.checked ? [...approve.pick, t.id] : approve.pick.filter((x: string) => x !== t.id) })} />
                {t.name} ({t.maxCovers})</label>
            ))}
          </div>
          <p className="small muted">Seats selected: {tables.filter((t) => approve.pick.includes(t.id)).reduce((s, t) => s + t.maxCovers, 0)}</p>
          <div className="row">
            <button className="btn primary" disabled={!approve.pick.length} onClick={() => act(() => api(`/manage/${rid}/reservations/${approve.id}/approve`, { body: { tableIds: approve.pick } }), 'Request approved')}>Approve</button>
            <button className="btn danger" onClick={() => act(() => api(`/manage/${rid}/reservations/${approve.id}/decline`, { body: { reason: prompt('Reason (sent to guest)') ?? undefined } }), 'Request declined')}>Decline</button>
          </div>
        </Modal>
      )}

      {detail && (
        <Modal title={`${detail.guestName} · ${detail.partySize} · ${detail.localTime}`} onClose={() => setDetail(null)}>
          <div className="row" style={{ marginBottom: 10 }}>
            <span className={`badge ${detail.status}`}>{detail.status}</span><span className="muted">Code {detail.code}</span>
          </div>
          {detail.guest && <p className="small">Visits {detail.guest.visitCount} · no-shows {detail.guest.noShowCount} · spend {money(detail.guest.totalSpendCents)}{detail.guest.notes ? ` · ${detail.guest.notes}` : ''}</p>}
          {detail.status === 'CONFIRMED' && <ModifyForm rid={rid} r={detail} onDone={(m) => act(async () => {}, m)} />}
          <div className="row" style={{ margin: '10px 0' }}>
            {detail.status === 'CONFIRMED' && <button className="btn danger" onClick={() => act(() => api(`/manage/${rid}/reservations/${detail.id}/no-show`, { body: {} }), 'Marked no-show')}>No-show</button>}
            {detail.status === 'CONFIRMED' && <button className="btn" onClick={() => act(() => api(`/manage/${rid}/reservations/${detail.id}/cancel`, { body: { reason: 'Cancelled by restaurant' } }), 'Cancelled')}>Cancel booking</button>}
            {detail.payments.filter((p: any) => ['NO_SHOW_FEE', 'LATE_CANCEL_FEE', 'DEPOSIT'].includes(p.kind) && p.status === 'CAPTURED').map((p: any) => (
              <button key={p.id} className="btn" onClick={() => { const reason = prompt('Reason for waiving'); if (reason) act(() => api(`/manage/${rid}/payments/${p.id}/waive`, { body: { reason } }), 'Fee waived'); }}>
                Waive {p.kind.replace(/_/g, ' ').toLowerCase()} {money(p.amountCents)}
              </button>
            ))}
          </div>
          <h3>History</h3>
          <ul className="small">{events.map((e) => <li key={e.id}>{new Date(e.createdAt).toLocaleString()} — {e.type.replace('_', ' ')}</li>)}</ul>
        </Modal>
      )}
    </div>
  );
}

function ModifyForm({ rid, r, onDone }: { rid: string; r: any; onDone: (m: string) => void }) {
  const [time, setTime] = useState(r.localTime); const [party, setParty] = useState(r.partySize); const [err, setErr] = useState('');
  return (
    <div className="row">
      <input type="time" step={900} value={time} onChange={(e) => setTime(e.target.value)} />
      <input type="number" min={1} style={{ width: 70 }} value={party} onChange={(e) => setParty(Number(e.target.value))} />
      <button className="btn" onClick={async () => {
        try { await api(`/manage/${rid}/reservations/${r.id}`, { method: 'PATCH', body: { time, partySize: party } }); onDone('Reservation updated'); } catch (e: any) { setErr(e.message); }
      }}>Change</button>
      {err && <span className="err">{err}</span>}
    </div>
  );
}
