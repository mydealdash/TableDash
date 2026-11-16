'use client';
import { useEffect, useState } from 'react';
import { api, money } from '@/lib/api';
import { useRestaurant } from '../context';

export default function Guestbook() {
  const { rid, timezone } = useRestaurant();
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<any[]>([]);
  const [sel, setSel] = useState<any>(null);
  const [edit, setEdit] = useState<any>(null);
  const [saved, setSaved] = useState('');

  useEffect(() => { const t = setTimeout(() => api(`/manage/${rid}/guests?q=${encodeURIComponent(q)}`).then(setRows), 250); return () => clearTimeout(t); }, [q, rid]);
  const open = async (id: string) => { const g = await api(`/manage/${rid}/guests/${id}`); setSel(g); setEdit({ tags: g.tags.join(', '), notes: g.notes, allergies: g.allergies, isVip: g.isVip }); setSaved(''); };

  return (
    <div className="grid2" style={{ gridTemplateColumns: '1.3fr 1fr' }}>
      <div>
        <div className="spread" style={{ marginBottom: 12 }}>
          <h1 style={{ margin: 0 }}>Guestbook</h1>
          <div className="row">
            <input placeholder="Search name, phone, email" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 240 }} />
            <button className="btn" onClick={async () => {
              const csv = await api(`/manage/${rid}/guests-export.csv`, { raw: true });
              const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'guests.csv'; a.click();
            }}>Export</button>
          </div>
        </div>
        <table className="list">
          <thead><tr><th>Guest</th><th>Visits</th><th>No-shows</th><th>Spend</th><th>Last visit</th></tr></thead>
          <tbody>
            {rows.map((g) => (
              <tr key={g.id} className="click" onClick={() => open(g.id)}>
                <td><b>{g.firstName} {g.lastName}</b> {g.isVip && <span className="badge vip">VIP</span>}
                  <div className="row" style={{ gap: 4, marginTop: 3 }}>{g.tags.map((t: string) => <span key={t} className="badge tag">{t}</span>)}</div></td>
                <td>{g.visitCount}</td><td>{g.noShowCount}</td><td>{money(g.totalSpendCents)}</td>
                <td className="small">{g.lastVisitAt ? new Date(g.lastVisitAt).toLocaleDateString() : '—'}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={5} className="muted">No guests found.</td></tr>}
          </tbody>
        </table>
      </div>
      <div>
        {sel ? (
          <div className="card form">
            <h2>{sel.firstName} {sel.lastName}</h2>
            <div className="small muted">{sel.phone} · {sel.email} · marketing {sel.marketingConsent ? 'opted in' : 'not opted in'}</div>
            <div className="kpi" style={{ margin: 0 }}>
              <div className="card">Visits<b>{sel.visitCount}</b></div><div className="card">No-shows<b>{sel.noShowCount}</b></div>
              <div className="card">Avg spend<b>{money(sel.visitCount ? Math.round(sel.totalSpendCents / sel.visitCount) : 0)}</b></div>
            </div>
            <label className="check"><input type="checkbox" checked={edit.isVip} onChange={(e) => setEdit({ ...edit, isVip: e.target.checked })} /> VIP</label>
            <label>Tags (comma separated)<input value={edit.tags} onChange={(e) => setEdit({ ...edit, tags: e.target.value })} /></label>
            <label>Allergies & dietary<input value={edit.allergies} onChange={(e) => setEdit({ ...edit, allergies: e.target.value })} /></label>
            <label>Notes<textarea value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} /></label>
            <div className="row">
              <button className="btn primary" onClick={async () => {
                await api(`/manage/${rid}/guests/${sel.id}`, { method: 'PATCH', body: { ...edit, tags: edit.tags.split(',').map((t: string) => t.trim()).filter(Boolean) } });
                setSaved('Saved'); open(sel.id); api(`/manage/${rid}/guests?q=${encodeURIComponent(q)}`).then(setRows);
              }}>Save</button>
              <span className="ok">{saved}</span>
            </div>
            <h3>Visit history</h3>
            <table className="list">
              <tbody>{sel.history.map((r: any) => (
                <tr key={r.id}><td className="small">{new Intl.DateTimeFormat('en-US', { timeZone: timezone, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(r.startsAt))}</td>
                  <td>{r.partySize}</td><td><span className={`badge ${r.status}`}>{r.status}</span></td><td className="small">{money(r.spendCents)}</td></tr>
              ))}</tbody>
            </table>
          </div>
        ) : <div className="card muted">Select a guest to see their profile, preferences and history.</div>}
      </div>
    </div>
  );
}
