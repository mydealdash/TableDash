'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useRestaurant } from '../context';

export default function Reviews() {
  const { rid } = useRestaurant();
  const [rows, setRows] = useState<any[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const load = () => api(`/manage/${rid}/reviews`).then(setRows).catch(() => setRows([]));
  useEffect(() => { load(); }, [rid]);
  const avg = rows.length ? (rows.reduce((s, r) => s + r.rating, 0) / rows.length).toFixed(1) : '—';
  return (
    <div style={{ maxWidth: 820 }}>
      <div className="spread"><h1>Reviews</h1><span className="muted">{rows.length} reviews · average {avg} ★</span></div>
      {rows.map((r) => (
        <div key={r.id} className="card" style={{ marginBottom: 10 }}>
          <div className="spread">
            <b>{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)} · {r.author}</b>
            <span className="row small muted">{new Date(r.createdAt).toLocaleDateString()} {r.status !== 'PUBLISHED' && <span className="badge NO_SHOW">{r.status}</span>}</span>
          </div>
          <div className="small muted">{[r.foodRating && `Food ${r.foodRating}`, r.serviceRating && `Service ${r.serviceRating}`, r.ambienceRating && `Ambience ${r.ambienceRating}`].filter(Boolean).join(' · ')}</div>
          <p>{r.text}</p>
          {r.reply ? <div className="small" style={{ background: '#faf8f4', padding: 10, borderRadius: 8 }}><b>Your reply:</b> {r.reply}</div> : (
            <div className="row">
              <input style={{ flex: 1 }} placeholder="Write a public reply" value={draft[r.id] ?? ''} onChange={(e) => setDraft({ ...draft, [r.id]: e.target.value })} />
              <button className="btn primary" disabled={!draft[r.id]} onClick={() => api(`/manage/${rid}/reviews/${r.id}/reply`, { body: { reply: draft[r.id] } }).then(load)}>Reply</button>
              {r.status === 'PUBLISHED' && <button className="btn" onClick={() => api(`/manage/${rid}/reviews/${r.id}/flag`, { body: {} }).then(load)}>Flag</button>}
            </div>
          )}
        </div>
      ))}
      {rows.length === 0 && <p className="muted">No reviews yet. Diners can review after a completed visit.</p>}
    </div>
  );
}
