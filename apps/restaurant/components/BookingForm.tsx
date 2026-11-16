'use client';
import { useState } from 'react';
import { api } from '@/lib/api';

/** Phone booking or walk-in (seat now) entered by the host. */
export function BookingForm({ rid, date, defaultTime, walkIn, tableIds, onDone }: {
  rid: string; date: string; defaultTime?: string; walkIn?: boolean; tableIds?: string[]; onDone: () => void;
}) {
  const [f, setF] = useState({ guestName: '', guestPhone: '', guestEmail: '', partySize: 2, time: defaultTime ?? '19:00', date, specialRequest: '', occasion: '' });
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const [force, setForce] = useState(false);
  const set = (k: string, v: any) => setF((x) => ({ ...x, [k]: v }));
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr('');
    try {
      await api(`/manage/${rid}/reservations`, { body: {
        ...f, partySize: Number(f.partySize), guestPhone: f.guestPhone || undefined, guestEmail: f.guestEmail || undefined,
        specialRequest: f.specialRequest || undefined, occasion: f.occasion || undefined, seatNow: !!walkIn, tableIds: tableIds?.length ? tableIds : undefined, force,
      } });
      onDone();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  return (
    <form className="form" onSubmit={submit}>
      <div className="cols">
        <label>Guest name<input required value={f.guestName} onChange={(e) => set('guestName', e.target.value)} /></label>
        <label>Phone<input value={f.guestPhone} onChange={(e) => set('guestPhone', e.target.value)} placeholder="+15551234567" /></label>
      </div>
      <div className="cols">
        <label>Party<input type="number" min={1} max={200} value={f.partySize} onChange={(e) => set('partySize', e.target.value)} /></label>
        {!walkIn && <label>Date<input type="date" value={f.date} onChange={(e) => set('date', e.target.value)} /></label>}
        {!walkIn && <label>Time<input type="time" step={900} value={f.time} onChange={(e) => set('time', e.target.value)} /></label>}
      </div>
      {!walkIn && <label>Email<input type="email" value={f.guestEmail} onChange={(e) => set('guestEmail', e.target.value)} /></label>}
      <div className="cols">
        <label>Occasion<select value={f.occasion} onChange={(e) => set('occasion', e.target.value)}>
          <option value="">—</option>{['Birthday', 'Anniversary', 'Date night', 'Business', 'Celebration'].map((o) => <option key={o}>{o}</option>)}</select></label>
        <label>Notes<input value={f.specialRequest} onChange={(e) => set('specialRequest', e.target.value)} /></label>
      </div>
      {tableIds?.length ? <div className="small muted">Table selected on the floor plan.</div> : null}
      <label className="check"><input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} /> Override availability (overbook)</label>
      {err && <div className="err">{err}</div>}
      <button className="btn primary" disabled={busy}>{walkIn ? 'Seat walk-in' : 'Book'}</button>
    </form>
  );
}
