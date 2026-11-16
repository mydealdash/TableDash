'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, money, timeIn, todayIn } from '@/lib/api';
import { useRealtime } from '@/lib/realtime';
import { Modal } from '@/components/Modal';
import { BookingForm } from '@/components/BookingForm';
import { useRestaurant } from '../context';

const STATUS_FILL: Record<string, string> = {
  AVAILABLE: 'var(--st-available)', SEATED: 'var(--st-seated)', APPETIZER: 'var(--st-course)', ENTREE: 'var(--st-course)',
  DESSERT: 'var(--st-course)', CHECK_DROPPED: 'var(--st-check)', PAID: 'var(--st-paid)', BUSSING: 'var(--st-bussing)', OUT_OF_SERVICE: '#e5e7eb',
};
const COURSE_FLOW = ['SEATED', 'APPETIZER', 'ENTREE', 'DESSERT', 'CHECK_DROPPED', 'PAID', 'BUSSING'] as const;
const label = (s: string) => s.replace('_', ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

export default function HostStand() {
  const { rid, timezone, onlineBookingEnabled, refreshMeta, role } = useRestaurant();
  const [date] = useState(() => todayIn(timezone));
  const [floor, setFloor] = useState<any>(null);
  const [book, setBook] = useState<any[]>([]);
  const [waitlist, setWaitlist] = useState<any[]>([]);
  const [tab, setTab] = useState<'upcoming' | 'seated' | 'waitlist' | 'done'>('upcoming');
  const [selRes, setSelRes] = useState<any>(null);
  const [selWait, setSelWait] = useState<any>(null);
  const [selTable, setSelTable] = useState<any>(null);
  const [roomId, setRoomId] = useState<string>('all');
  const [modal, setModal] = useState<null | 'book' | 'walkin' | 'wait'>(null);
  const [msg, setMsg] = useState('');
  const [suggested, setSuggested] = useState<string[]>([]);

  const load = useCallback(async () => {
    const [f, b, w] = await Promise.all([api(`/manage/${rid}/floor`), api(`/manage/${rid}/reservations?date=${date}`), api(`/manage/${rid}/waitlist`)]);
    setFloor(f); setBook(b); setWaitlist(w);
  }, [rid, date]);
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);
  useRealtime(rid, () => load());

  // Best-fit suggestion for the selected party (TBL-03).
  useEffect(() => {
    setSuggested([]);
    if (selRes) api(`/manage/${rid}/suggest-tables?reservationId=${selRes.id}`).then((s) => setSuggested(s.tableIds)).catch(() => {});
    else if (selWait) api(`/manage/${rid}/suggest-tables?party=${selWait.partySize}`).then((s) => setSuggested(s.tableIds)).catch(() => {});
  }, [selRes, selWait, rid]);

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 3500); };
  const run = async (fn: () => Promise<any>, ok: string) => {
    try { await fn(); flash(ok); setSelRes(null); setSelWait(null); setSelTable(null); await load(); } catch (e: any) { flash(`⚠ ${e.message}`); }
  };

  const groups = useMemo(() => ({
    upcoming: book.filter((r) => ['CONFIRMED', 'REQUESTED'].includes(r.status)),
    seated: book.filter((r) => r.status === 'SEATED'),
    done: book.filter((r) => ['COMPLETED', 'NO_SHOW', 'CANCELLED', 'DECLINED'].includes(r.status)),
  }), [book]);
  const covers = book.filter((r) => ['CONFIRMED', 'SEATED', 'COMPLETED'].includes(r.status)).reduce((s, r) => s + r.partySize, 0);
  const tables = (floor?.tables ?? []).filter((t: any) => roomId === 'all' || t.roomId === roomId);
  const tableName = (id: string) => floor?.tables.find((t: any) => t.id === id)?.name ?? '?';

  function clickTable(t: any) {
    if (selRes) return run(() => api(`/manage/${rid}/reservations/${selRes.id}/seat`, { body: { tableIds: [t.id] } }), `Seated ${selRes.guestName} at ${t.name}`);
    if (selWait) return run(() => api(`/manage/${rid}/waitlist/${selWait.id}/seat`, { body: { tableIds: [t.id] } }), `Seated ${selWait.guestName} at ${t.name}`);
    setSelTable(t);
  }

  if (!floor) return <div className="muted">Loading floor…</div>;
  const w = Math.max(640, ...floor.tables.map((t: any) => t.x + t.width + 40));
  const h = Math.max(420, ...floor.tables.map((t: any) => t.y + t.height + 40));

  return (
    <div>
      <div className="spread" style={{ marginBottom: 12 }}>
        <div className="row">
          <h1 style={{ margin: 0 }}>Host stand</h1>
          <span className="muted">{date} · {covers} covers · {groups.upcoming.length} upcoming · {waitlist.length} waiting</span>
        </div>
        <div className="row">
          {msg && <span className={msg.startsWith('⚠') ? 'err' : 'ok'}>{msg}</span>}
          {['OWNER', 'MANAGER', 'HOST', 'ADMIN'].includes(role) && (
            <span className={`toggle ${onlineBookingEnabled ? 'on' : ''}`} title="Online booking kill switch (CFG-06)"
              onClick={() => api(`/manage/${rid}/settings/online-booking`, { method: 'PUT', body: { enabled: !onlineBookingEnabled } }).then(refreshMeta)}>
              <span className="sw" /> Online booking {onlineBookingEnabled ? 'on' : 'off'}
            </span>
          )}
          <button className="btn" onClick={() => setModal('wait')}>+ Waitlist</button>
          <button className="btn" onClick={() => setModal('walkin')}>Walk-in</button>
          <button className="btn primary" onClick={() => setModal('book')}>New booking</button>
        </div>
      </div>

      <div className="host">
        <div className="pane">
          <div className="tabs">
            {(['upcoming', 'seated', 'waitlist', 'done'] as const).map((k) => (
              <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
                {label(k)} ({k === 'waitlist' ? waitlist.length : groups[k].length})
              </button>
            ))}
          </div>
          {(selRes || selWait) && (
            <div className="card small" style={{ marginBottom: 8, background: '#fff7ed' }}>
              Click a table on the floor to seat <b>{(selRes ?? selWait).guestName}</b>
              {suggested.length > 0 && <> · suggested: <b>{suggested.map(tableName).join(' + ')}</b></>}
              <div className="row" style={{ marginTop: 6 }}>
                {selRes && selRes.tableIds.length > 0 && (
                  <button className="btn sm primary" onClick={() => run(() => api(`/manage/${rid}/reservations/${selRes.id}/seat`, { body: {} }), 'Seated')}>
                    Seat at {selRes.tableIds.map(tableName).join(' + ')}
                  </button>
                )}
                {suggested.length > 0 && selWait && (
                  <button className="btn sm primary" onClick={() => run(() => api(`/manage/${rid}/waitlist/${selWait.id}/seat`, { body: { tableIds: suggested } }), 'Seated')}>
                    Seat at suggested
                  </button>
                )}
                <button className="btn sm" onClick={() => { setSelRes(null); setSelWait(null); }}>Cancel</button>
              </div>
            </div>
          )}

          {tab === 'waitlist' ? waitlist.map((e) => {
            const waited = Math.round((Date.now() - new Date(e.createdAt).getTime()) / 60000);
            return (
              <div key={e.id} className={`resv ${selWait?.id === e.id ? 'sel' : ''}`} onClick={() => { setSelRes(null); setSelWait(e); }}>
                <div className="spread"><span className="t">{e.guestName} · {e.partySize}</span><span className={`badge ${e.status === 'NOTIFIED' ? 'SEATED' : ''}`}>{e.status === 'NOTIFIED' ? 'Notified' : 'Waiting'}</span></div>
                <div className="small muted">Waited {waited} min · quoted {e.quotedMinutes} min {e.joinedRemotely ? '· joined remotely' : ''}</div>
                {e.notes && <div className="small">{e.notes}</div>}
                <div className="row" style={{ marginTop: 6 }} onClick={(ev) => ev.stopPropagation()}>
                  <button className="btn sm" onClick={() => run(() => api(`/manage/${rid}/waitlist/${e.id}/notify`, { body: {} }), 'Table-ready text sent')}>Text: table ready</button>
                  <button className="btn sm danger" onClick={() => run(() => api(`/manage/${rid}/waitlist/${e.id}/remove`, { body: { status: 'LEFT' } }), 'Removed')}>Left</button>
                </div>
              </div>
            );
          }) : groups[tab].map((r: any) => (
            <div key={r.id} className={`resv ${selRes?.id === r.id ? 'sel' : ''}`}
              onClick={() => { if (r.status === 'CONFIRMED') { setSelWait(null); setSelRes(selRes?.id === r.id ? null : r); } }}>
              <div className="spread">
                <span className="t">{r.localTime} · {r.guestName} · {r.partySize}</span>
                <span className={`badge ${r.status}`}>{label(r.status)}</span>
              </div>
              <div className="row small muted" style={{ gap: 6, marginTop: 4 }}>
                {r.tableIds.length > 0 && <span>Table {r.tableIds.map(tableName).join('+')}</span>}
                <span>{r.channel.toLowerCase()}</span>
                {r.confirmedByGuestAt && <span className="ok">✓ confirmed</span>}
                {r.payments.some((p: any) => p.kind === 'DEPOSIT') && <span>deposit {money(r.payments.find((p: any) => p.kind === 'DEPOSIT').amountCents)}</span>}
                {r.payments.some((p: any) => p.kind === 'CARD_HOLD') && <span>card on file</span>}
              </div>
              {r.guest && (
                <div className="row" style={{ gap: 4, marginTop: 6 }}>
                  {r.guest.isVip && <span className="badge vip">VIP</span>}
                  {r.guest.visitCount > 0 && <span className="badge">{r.guest.visitCount} visits</span>}
                  {r.guest.noShowCount > 0 && <span className="badge NO_SHOW">{r.guest.noShowCount} no-show</span>}
                  {r.guest.allergies && <span className="badge allergy">Allergy: {r.guest.allergies}</span>}
                  {r.guest.tags.map((t: string) => <span key={t} className="badge tag">{t}</span>)}
                </div>
              )}
              {(r.occasion || r.specialRequest) && <div className="small" style={{ marginTop: 4 }}>{r.occasion && <b>{r.occasion}. </b>}{r.specialRequest}</div>}
              {r.status === 'CONFIRMED' && (
                <div className="row" style={{ marginTop: 6 }} onClick={(e) => e.stopPropagation()}>
                  <button className="btn sm danger" onClick={() => run(() => api(`/manage/${rid}/reservations/${r.id}/no-show`, { body: {} }), 'Marked no-show')}>No-show</button>
                  <button className="btn sm" onClick={() => confirm(`Cancel ${r.guestName}'s booking?`) && run(() => api(`/manage/${rid}/reservations/${r.id}/cancel`, { body: { reason: 'Cancelled by restaurant' } }), 'Cancelled')}>Cancel</button>
                </div>
              )}
              {r.status === 'REQUESTED' && (
                <div className="row" style={{ marginTop: 6 }} onClick={(e) => e.stopPropagation()}>
                  <span className="small muted">Large-party request — approve from Reservations to assign tables.</span>
                </div>
              )}
              {r.status === 'SEATED' && (
                <div className="row" style={{ marginTop: 6 }} onClick={(e) => e.stopPropagation()}>
                  <button className="btn sm primary" onClick={() => {
                    const spend = prompt('Check total in dollars (optional)');
                    run(() => api(`/manage/${rid}/reservations/${r.id}/complete`, { body: spend ? { spendCents: Math.round(Number(spend) * 100) } : {} }), 'Table cleared');
                  }}>Paid & leave</button>
                </div>
              )}
            </div>
          ))}
          {tab !== 'waitlist' && groups[tab].length === 0 && <p className="muted">Nothing here.</p>}
          {tab === 'waitlist' && waitlist.length === 0 && <p className="muted">No one waiting.</p>}
        </div>

        <div className="pane">
          <div className="spread" style={{ marginBottom: 8 }}>
            <div className="tabs" style={{ margin: 0, border: 'none' }}>
              <button className={roomId === 'all' ? 'on' : ''} onClick={() => setRoomId('all')}>All rooms</button>
              {floor.rooms.map((r: any) => <button key={r.id} className={roomId === r.id ? 'on' : ''} onClick={() => setRoomId(r.id)}>{r.name}</button>)}
            </div>
            <div className="legend">
              {[['Open', 'available'], ['Reserved soon', 'reserved'], ['Seated', 'seated'], ['In courses', 'course'], ['Check', 'check'], ['Paid', 'paid']].map(([l, k]) =>
                <span key={k}><i style={{ background: `var(--st-${k})` }} />{l}</span>)}
            </div>
          </div>
          <svg className="floor" viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 'auto' }}>
            {tables.map((t: any) => {
              const soon = t.status === 'AVAILABLE' && t.next && new Date(t.next.startsAt).getTime() - Date.now() < 45 * 60000;
              const fill = soon ? 'var(--st-reserved)' : STATUS_FILL[t.status];
              const isSuggested = suggested.includes(t.id);
              const stroke = isSuggested ? 'var(--brand)' : selTable?.id === t.id ? '#1f1b18' : '#bdb8ae';
              const cx = t.x + t.width / 2, cy = t.y + t.height / 2;
              const mins = t.current?.seatedAt ? Math.round((Date.now() - new Date(t.current.seatedAt).getTime()) / 60000) : null;
              return (
                <g key={t.id} style={{ cursor: 'pointer' }} onClick={() => clickTable(t)}>
                  {t.shape === 'round'
                    ? <ellipse cx={cx} cy={cy} rx={t.width / 2} ry={t.height / 2} fill={fill} stroke={stroke} strokeWidth={isSuggested ? 3 : 1.5} />
                    : <rect x={t.x} y={t.y} width={t.width} height={t.height} rx={10} fill={fill} stroke={stroke} strokeWidth={isSuggested ? 3 : 1.5} />}
                  <text x={cx} y={cy - 6} textAnchor="middle" fontSize={15} fontWeight={800} fill="#1d1d1f">{t.name}</text>
                  <text x={cx} y={cy + 10} textAnchor="middle" fontSize={10} fill="#555">
                    {t.current ? `${t.current.guestName.split(' ')[0]} · ${t.current.partySize}` : `${t.minCovers}–${t.maxCovers}`}
                  </text>
                  {mins != null && <text x={cx} y={cy + 23} textAnchor="middle" fontSize={10} fill="#1e40af">{mins}m · {label(t.status)}</text>}
                  {!t.current && t.next && <text x={cx} y={cy + 23} textAnchor="middle" fontSize={10} fill="#9a3412">next {timeIn(t.next.startsAt, timezone)}</text>}
                </g>
              );
            })}
          </svg>
          {selTable && !selRes && !selWait && (
            <div className="card" style={{ marginTop: 12 }}>
              <div className="spread">
                <h2 style={{ margin: 0 }}>Table {selTable.name} <span className="badge">{label(selTable.status)}</span></h2>
                <button className="btn sm" onClick={() => setSelTable(null)}>Close</button>
              </div>
              {selTable.current ? (
                <p>{selTable.current.guestName}, party of {selTable.current.partySize}, seated {timeIn(selTable.current.seatedAt, timezone)}</p>
              ) : <p className="muted">{selTable.minCovers}–{selTable.maxCovers} covers · {selTable.tableType.toLowerCase().replace('_', ' ')}{selTable.next ? ` · next booking ${timeIn(selTable.next.startsAt, timezone)} (${selTable.next.guestName})` : ''}</p>}
              <div className="row">
                {selTable.status !== 'AVAILABLE' && COURSE_FLOW.map((s) => (
                  <button key={s} className={`btn sm ${selTable.status === s ? 'primary' : ''}`}
                    onClick={() => run(() => api(`/manage/${rid}/tables/${selTable.id}/status`, { method: 'PATCH', body: { status: s } }), `Table ${selTable.name}: ${label(s)}`)}>{label(s)}</button>
                ))}
                {selTable.status !== 'AVAILABLE' && (
                  <button className="btn sm primary" onClick={() => run(() => api(`/manage/${rid}/tables/${selTable.id}/status`, { method: 'PATCH', body: { status: 'AVAILABLE' } }), `Table ${selTable.name} cleared`)}>Clear table</button>
                )}
                {selTable.status === 'AVAILABLE' && <button className="btn sm primary" onClick={() => setModal('walkin')}>Seat walk-in here</button>}
                {selTable.status === 'AVAILABLE'
                  ? <button className="btn sm" onClick={() => run(() => api(`/manage/${rid}/tables/${selTable.id}/status`, { method: 'PATCH', body: { status: 'OUT_OF_SERVICE' } }), 'Table blocked')}>Block table</button>
                  : selTable.status === 'OUT_OF_SERVICE' && <button className="btn sm" onClick={() => run(() => api(`/manage/${rid}/tables/${selTable.id}/status`, { method: 'PATCH', body: { status: 'AVAILABLE' } }), 'Table unblocked')}>Unblock</button>}
              </div>
            </div>
          )}
        </div>
      </div>

      {modal === 'book' && <Modal title="New booking" onClose={() => setModal(null)}><BookingForm rid={rid} date={date} onDone={() => { setModal(null); load(); flash('Booked'); }} /></Modal>}
      {modal === 'walkin' && <Modal title={selTable ? `Walk-in at table ${selTable.name}` : 'Seat a walk-in'} onClose={() => setModal(null)}>
        <BookingForm rid={rid} date={date} walkIn tableIds={selTable ? [selTable.id] : undefined} onDone={() => { setModal(null); setSelTable(null); load(); flash('Walk-in seated'); }} />
      </Modal>}
      {modal === 'wait' && <Modal title="Add to waitlist" onClose={() => setModal(null)}><WaitlistForm rid={rid} onDone={() => { setModal(null); setTab('waitlist'); load(); }} /></Modal>}
    </div>
  );
}

function WaitlistForm({ rid, onDone }: { rid: string; onDone: () => void }) {
  const [f, setF] = useState({ guestName: '', guestPhone: '', partySize: 2, notes: '' });
  const [quote, setQuote] = useState<number | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    api(`/restaurants/${rid}/waitlist/quote?party=${f.partySize}`).then((q) => setQuote(q.quotedMinutes)).catch(() => setQuote(null));
  }, [rid, f.partySize]);
  return (
    <form className="form" onSubmit={async (e) => {
      e.preventDefault(); setErr('');
      try { await api(`/manage/${rid}/waitlist`, { body: { ...f, partySize: Number(f.partySize), notes: f.notes || undefined } }); onDone(); } catch (e: any) { setErr(e.message); }
    }}>
      <div className="cols">
        <label>Name<input required value={f.guestName} onChange={(e) => setF({ ...f, guestName: e.target.value })} /></label>
        <label>Mobile<input required value={f.guestPhone} onChange={(e) => setF({ ...f, guestPhone: e.target.value })} placeholder="+15551234567" /></label>
        <label>Party<input type="number" min={1} value={f.partySize} onChange={(e) => setF({ ...f, partySize: Number(e.target.value) })} /></label>
      </div>
      <label>Notes<input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="High chair, patio if possible…" /></label>
      <div className="muted">Suggested quote: <b>{quote == null ? '—' : `${quote} min`}</b></div>
      {err && <div className="err">{err}</div>}
      <button className="btn primary">Add to waitlist</button>
    </form>
  );
}
