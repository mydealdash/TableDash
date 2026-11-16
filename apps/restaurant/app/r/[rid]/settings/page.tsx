'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, money } from '@/lib/api';
import { useRestaurant } from '../context';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const TABS = ['Profile', 'Google listing', 'Shifts & pacing', 'Floor plan', 'Turn times', 'Policies', 'Closures', 'Staff'] as const;

export default function Settings() {
  const { rid, refreshMeta } = useRestaurant();
  const [tab, setTab] = useState<(typeof TABS)[number]>('Profile');
  const [s, setS] = useState<any>(null);
  const [msg, setMsg] = useState('');
  const load = useCallback(() => api(`/manage/${rid}/settings`).then(setS), [rid]);
  useEffect(() => { load(); }, [load]);
  const save = async (fn: () => Promise<any>, ok = 'Saved') => {
    try { await fn(); setMsg(ok); await load(); refreshMeta(); } catch (e: any) { setMsg(`⚠ ${e.message}`); }
    setTimeout(() => setMsg(''), 3000);
  };
  if (!s) return <div className="muted">Loading…</div>;

  return (
    <div style={{ maxWidth: 1000 }}>
      <div className="spread"><h1>Settings</h1>{msg && <span className={msg.startsWith('⚠') ? 'err' : 'ok'}>{msg}</span>}</div>
      <div className="tabs">{TABS.map((t) => <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t}</button>)}</div>
      {tab === 'Profile' && <Profile r={s.restaurant} onSave={(body) => save(() => api(`/manage/${rid}/settings/profile`, { method: 'PATCH', body }))} />}
      {tab === 'Google listing' && <GoogleListing rid={rid} name={s.restaurant.name} save={save} />}
      {tab === 'Shifts & pacing' && <Shifts rid={rid} shifts={s.shifts} save={save} />}
      {tab === 'Floor plan' && <Floor rid={rid} rooms={s.rooms} tables={s.tables} save={save} />}
      {tab === 'Turn times' && <Turns rid={rid} rows={s.turnTimes} save={save} />}
      {tab === 'Policies' && <Policies rid={rid} policies={s.policies} save={save} />}
      {tab === 'Closures' && <Closures rid={rid} rows={s.closures} save={save} />}
      {tab === 'Staff' && <Staff rid={rid} save={save} />}
    </div>
  );
}

function Profile({ r, onSave }: { r: any; onSave: (b: any) => void }) {
  const [f, setF] = useState({ ...r, photos: r.photos.join('\n'), features: r.features.join(', ') });
  const set = (k: string, v: any) => setF((x: any) => ({ ...x, [k]: v }));
  const num = (k: string) => <input type="number" value={f[k]} onChange={(e) => set(k, Number(e.target.value))} />;
  return (
    <div className="card form">
      <div className="cols">
        <label>Name<input value={f.name} onChange={(e) => set('name', e.target.value)} /></label>
        <label>Cuisine<input value={f.cuisine} onChange={(e) => set('cuisine', e.target.value)} /></label>
        <label>Price band<select value={f.priceBand} onChange={(e) => set('priceBand', Number(e.target.value))}>{[1, 2, 3, 4].map((n) => <option key={n} value={n}>{'$'.repeat(n)}</option>)}</select></label>
        <label>Neighborhood<input value={f.neighborhood} onChange={(e) => set('neighborhood', e.target.value)} /></label>
      </div>
      <label>Description<textarea value={f.description} onChange={(e) => set('description', e.target.value)} /></label>
      <div className="cols">
        <label>Address<input value={f.address} onChange={(e) => set('address', e.target.value)} /></label>
        <label>Phone<input value={f.phone ?? ''} onChange={(e) => set('phone', e.target.value)} /></label>
        <label>Menu URL<input value={f.menuUrl ?? ''} onChange={(e) => set('menuUrl', e.target.value)} /></label>
      </div>
      <label>Features (comma separated)<input value={f.features} onChange={(e) => set('features', e.target.value)} /></label>
      <label>Photo URLs (one per line)<textarea value={f.photos} onChange={(e) => set('photos', e.target.value)} /></label>
      <h3>Booking rules</h3>
      <div className="cols">
        <label>Booking window (days){num('bookingWindowDays')}</label>
        <label>Max party online{num('maxPartyOnline')}</label>
        <label>Max party by request{num('largePartyRequestMax')}</label>
        <label>Checkout hold (min){num('holdMinutes')}</label>
        <label>No-show grace (min){num('graceMinutes')}</label>
        <label>Bookings per diner per day{num('maxActiveBookingsPerDiner')}</label>
      </div>
      <button className="btn primary" onClick={() => onSave({
        name: f.name, cuisine: f.cuisine, priceBand: f.priceBand, neighborhood: f.neighborhood, description: f.description, address: f.address,
        phone: f.phone || undefined, menuUrl: f.menuUrl || undefined, photos: f.photos.split('\n').map((x: string) => x.trim()).filter(Boolean),
        features: f.features.split(',').map((x: string) => x.trim()).filter(Boolean), bookingWindowDays: f.bookingWindowDays, maxPartyOnline: f.maxPartyOnline,
        largePartyRequestMax: f.largePartyRequestMax, holdMinutes: f.holdMinutes, graceMinutes: f.graceMinutes, maxActiveBookingsPerDiner: f.maxActiveBookingsPerDiner,
      })}>Save profile</button>
    </div>
  );
}

function Shifts({ rid, shifts, save }: { rid: string; shifts: any[]; save: any }) {
  const blank = { name: '', daysOfWeek: [1, 2, 3, 4, 5], startTime: '17:00', endTime: '21:30', slotInterval: 15, maxCoversPerSlot: '', maxPartiesPerSlot: '', onlineEnabled: true };
  const [edit, setEdit] = useState<any>(null);
  const body = (x: any) => ({ name: x.name, daysOfWeek: x.daysOfWeek, startTime: x.startTime, endTime: x.endTime, slotInterval: Number(x.slotInterval),
    maxCoversPerSlot: x.maxCoversPerSlot === '' || x.maxCoversPerSlot == null ? undefined : Number(x.maxCoversPerSlot),
    maxPartiesPerSlot: x.maxPartiesPerSlot === '' || x.maxPartiesPerSlot == null ? undefined : Number(x.maxPartiesPerSlot), onlineEnabled: x.onlineEnabled });
  return (
    <div>
      <table className="list">
        <thead><tr><th>Shift</th><th>Days</th><th>Seatings</th><th>Interval</th><th>Pacing (covers / parties per slot)</th><th>Online</th><th></th></tr></thead>
        <tbody>{shifts.map((x) => (
          <tr key={x.id}><td><b>{x.name}</b></td><td>{x.daysOfWeek.map((d: number) => DAYS[d]).join(' ')}</td><td>{x.startTime}–{x.endTime}</td>
            <td>{x.slotInterval} min</td><td>{x.maxCoversPerSlot ?? '∞'} / {x.maxPartiesPerSlot ?? '∞'}</td><td>{x.onlineEnabled ? 'Yes' : 'No'}</td>
            <td><button className="btn sm" onClick={() => setEdit({ ...x, maxCoversPerSlot: x.maxCoversPerSlot ?? '', maxPartiesPerSlot: x.maxPartiesPerSlot ?? '' })}>Edit</button>{' '}
              <button className="btn sm danger" onClick={() => save(() => api(`/manage/${rid}/settings/shifts/${x.id}`, { method: 'DELETE' }), 'Shift removed')}>Delete</button></td></tr>
        ))}</tbody>
      </table>
      <button className="btn" style={{ marginTop: 10 }} onClick={() => setEdit(blank)}>+ Add shift</button>
      {edit && (
        <div className="card form" style={{ marginTop: 12 }}>
          <div className="cols">
            <label>Name<input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></label>
            <label>First seating<input type="time" value={edit.startTime} onChange={(e) => setEdit({ ...edit, startTime: e.target.value })} /></label>
            <label>Last seating<input type="time" value={edit.endTime} onChange={(e) => setEdit({ ...edit, endTime: e.target.value })} /></label>
            <label>Interval<select value={edit.slotInterval} onChange={(e) => setEdit({ ...edit, slotInterval: e.target.value })}>{[15, 30, 60].map((n) => <option key={n}>{n}</option>)}</select></label>
            <label>Max covers / slot<input type="number" value={edit.maxCoversPerSlot} onChange={(e) => setEdit({ ...edit, maxCoversPerSlot: e.target.value })} /></label>
            <label>Max parties / slot<input type="number" value={edit.maxPartiesPerSlot} onChange={(e) => setEdit({ ...edit, maxPartiesPerSlot: e.target.value })} /></label>
          </div>
          <div className="row">{DAYS.map((d, i) => (
            <label key={d} className="check"><input type="checkbox" checked={edit.daysOfWeek.includes(i)}
              onChange={(e) => setEdit({ ...edit, daysOfWeek: e.target.checked ? [...edit.daysOfWeek, i].sort() : edit.daysOfWeek.filter((x: number) => x !== i) })} />{d}</label>
          ))}<label className="check"><input type="checkbox" checked={edit.onlineEnabled} onChange={(e) => setEdit({ ...edit, onlineEnabled: e.target.checked })} />Bookable online</label></div>
          <div className="row">
            <button className="btn primary" onClick={() => save(() => edit.id ? api(`/manage/${rid}/settings/shifts/${edit.id}`, { method: 'PATCH', body: body(edit) }) : api(`/manage/${rid}/settings/shifts`, { body: body(edit) })).then(() => setEdit(null))}>Save shift</button>
            <button className="btn" onClick={() => setEdit(null)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Floor-plan editor (TBL-01): drag tables to position them; edit capacity, type and combinations. */
function Floor({ rid, rooms, tables, save }: { rid: string; rooms: any[]; tables: any[]; save: any }) {
  const [pos, setPos] = useState<Record<string, { x: number; y: number }>>({});
  const [drag, setDrag] = useState<{ id: string; dx: number; dy: number } | null>(null);
  const [sel, setSel] = useState<any>(null);
  const [newRoom, setNewRoom] = useState('');
  const P = (t: any) => pos[t.id] ?? { x: t.x, y: t.y };
  const svgPoint = (e: React.MouseEvent<SVGSVGElement>) => { const r = e.currentTarget.getBoundingClientRect(); const scale = 800 / r.width; return { x: (e.clientX - r.left) * scale, y: (e.clientY - r.top) * scale }; };
  const dirty = Object.keys(pos).length > 0;
  return (
    <div className="grid2" style={{ gridTemplateColumns: '1.6fr 1fr' }}>
      <div>
        <svg viewBox="0 0 800 500" style={{ width: '100%', background: '#fff', border: '1px solid var(--line)', borderRadius: 10, touchAction: 'none' }}
          onMouseMove={(e) => { if (!drag) return; const p = svgPoint(e); setPos({ ...pos, [drag.id]: { x: Math.max(0, Math.round((p.x - drag.dx) / 10) * 10), y: Math.max(0, Math.round((p.y - drag.dy) / 10) * 10) } }); }}
          onMouseUp={() => setDrag(null)} onMouseLeave={() => setDrag(null)}>
          {tables.map((t) => { const p = P(t); return (
            <g key={t.id} style={{ cursor: 'move' }} onMouseDown={(e) => { const m = svgPoint(e as any); setDrag({ id: t.id, dx: m.x - p.x, dy: m.y - p.y }); setSel({ ...t, combinableWith: [...t.combinableWith] }); }}>
              {t.shape === 'round' ? <ellipse cx={p.x + t.width / 2} cy={p.y + t.height / 2} rx={t.width / 2} ry={t.height / 2} fill={sel?.id === t.id ? '#ffedd5' : '#f5f3ef'} stroke="#a8a29e" />
                : <rect x={p.x} y={p.y} width={t.width} height={t.height} rx={8} fill={sel?.id === t.id ? '#ffedd5' : '#f5f3ef'} stroke="#a8a29e" />}
              <text x={p.x + t.width / 2} y={p.y + t.height / 2 + 4} textAnchor="middle" fontSize={13} fontWeight={700}>{t.name} ({t.maxCovers})</text>
            </g>); })}
        </svg>
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn primary" disabled={!dirty} onClick={() => save(() => Promise.all(Object.entries(pos).map(([id, p]) => api(`/manage/${rid}/settings/tables/${id}`, { method: 'PATCH', body: p }))), 'Layout saved').then(() => setPos({}))}>Save layout</button>
          <button className="btn" onClick={() => setSel({ name: '', minCovers: 1, maxCovers: 4, tableType: 'DINING_ROOM', roomId: rooms[0]?.id ?? null, shape: 'rect', width: 90, height: 90, x: 20, y: 20, combinableWith: [], onlineBookable: true })}>+ Add table</button>
          <span className="small muted">Drag tables to arrange the floor.</span>
        </div>
        <h3 style={{ marginTop: 16 }}>Rooms</h3>
        <div className="row">{rooms.map((r) => <span key={r.id} className="badge">{r.name} <a href="#" onClick={(e) => { e.preventDefault(); save(() => api(`/manage/${rid}/settings/rooms/${r.id}`, { method: 'DELETE' })); }}>×</a></span>)}
          <input placeholder="New room" value={newRoom} onChange={(e) => setNewRoom(e.target.value)} />
          <button className="btn sm" disabled={!newRoom} onClick={() => save(() => api(`/manage/${rid}/settings/rooms`, { body: { name: newRoom } })).then(() => setNewRoom(''))}>Add room</button></div>
      </div>
      {sel && (
        <div className="card form">
          <h2>{sel.id ? `Table ${sel.name}` : 'New table'}</h2>
          <div className="cols">
            <label>Name<input value={sel.name} onChange={(e) => setSel({ ...sel, name: e.target.value })} /></label>
            <label>Min covers<input type="number" value={sel.minCovers} onChange={(e) => setSel({ ...sel, minCovers: Number(e.target.value) })} /></label>
            <label>Max covers<input type="number" value={sel.maxCovers} onChange={(e) => setSel({ ...sel, maxCovers: Number(e.target.value) })} /></label>
          </div>
          <div className="cols">
            <label>Seating area<select value={sel.tableType} onChange={(e) => setSel({ ...sel, tableType: e.target.value })}>{['DINING_ROOM', 'BAR', 'PATIO', 'COUNTER'].map((t) => <option key={t}>{t}</option>)}</select></label>
            <label>Room<select value={sel.roomId ?? ''} onChange={(e) => setSel({ ...sel, roomId: e.target.value || null })}><option value="">—</option>{rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
            <label>Shape<select value={sel.shape} onChange={(e) => setSel({ ...sel, shape: e.target.value })}><option value="rect">Square</option><option value="round">Round</option></select></label>
            <label>Width<input type="number" value={sel.width} onChange={(e) => setSel({ ...sel, width: Number(e.target.value) })} /></label>
          </div>
          <label className="check"><input type="checkbox" checked={sel.onlineBookable} onChange={(e) => setSel({ ...sel, onlineBookable: e.target.checked })} />Bookable online</label>
          <div><div className="small muted" style={{ fontWeight: 600 }}>Can combine with</div>
            <div className="row">{tables.filter((t) => t.id !== sel.id).map((t) => (
              <label key={t.id} className="check"><input type="checkbox" checked={sel.combinableWith.includes(t.id)}
                onChange={(e) => setSel({ ...sel, combinableWith: e.target.checked ? [...sel.combinableWith, t.id] : sel.combinableWith.filter((x: string) => x !== t.id) })} />{t.name}</label>
            ))}</div></div>
          <div className="row">
            <button className="btn primary" onClick={() => {
              const { id, restaurantId, status, statusChangedAt, currentReservationId, ...body } = sel;
              save(() => id ? api(`/manage/${rid}/settings/tables/${id}`, { method: 'PATCH', body }) : api(`/manage/${rid}/settings/tables`, { body })).then(() => setSel(null));
            }}>Save table</button>
            {sel.id && <button className="btn danger" onClick={() => confirm('Delete this table?') && save(() => api(`/manage/${rid}/settings/tables/${sel.id}`, { method: 'DELETE' }), 'Table deleted').then(() => setSel(null))}>Delete</button>}
          </div>
        </div>
      )}
    </div>
  );
}

function Turns({ rid, rows, save }: { rid: string; rows: any[]; save: any }) {
  const [r, setR] = useState(rows.map(({ minParty, maxParty, minutes }) => ({ minParty, maxParty, minutes })));
  return (
    <div className="card form" style={{ maxWidth: 520 }}>
      <p className="muted small">How long a table is held for each party size. Drives availability and waitlist quotes.</p>
      {r.map((x, i) => (
        <div key={i} className="row">
          Party <input type="number" style={{ width: 60 }} value={x.minParty} onChange={(e) => setR(r.map((y, j) => j === i ? { ...y, minParty: Number(e.target.value) } : y))} />
          to <input type="number" style={{ width: 60 }} value={x.maxParty} onChange={(e) => setR(r.map((y, j) => j === i ? { ...y, maxParty: Number(e.target.value) } : y))} />
          → <input type="number" style={{ width: 70 }} value={x.minutes} onChange={(e) => setR(r.map((y, j) => j === i ? { ...y, minutes: Number(e.target.value) } : y))} /> min
          <button className="btn sm" onClick={() => setR(r.filter((_, j) => j !== i))}>×</button>
        </div>
      ))}
      <div className="row">
        <button className="btn" onClick={() => setR([...r, { minParty: 1, maxParty: 2, minutes: 90 }])}>+ Row</button>
        <button className="btn primary" onClick={() => save(() => api(`/manage/${rid}/settings/turn-times`, { method: 'PUT', body: { rows: r } }))}>Save turn times</button>
      </div>
    </div>
  );
}

function Policies({ rid, policies, save }: { rid: string; policies: any[]; save: any }) {
  const active = policies.find((p) => p.active) ?? {};
  const [f, setF] = useState({ cancelCutoffHours: active.cancelCutoffHours ?? 24, depositType: active.depositType ?? 'NONE', depositAmountCents: active.depositAmountCents ?? 0,
    noShowFeeCents: active.noShowFeeCents ?? 0, lateCancelFeeCents: active.lateCancelFeeCents ?? 0, minPartyForDeposit: active.minPartyForDeposit ?? 1, text: active.text ?? '' });
  const dollars = (k: keyof typeof f) => <input type="number" step="0.01" value={(f[k] as number) / 100} onChange={(e) => setF({ ...f, [k]: Math.round(Number(e.target.value) * 100) })} />;
  return (
    <div className="grid2">
      <div className="card form">
        <h2>Publish a new policy version</h2>
        <p className="small muted">Existing bookings keep the version the guest accepted.</p>
        <div className="cols">
          <label>Cancel cutoff (hours)<input type="number" value={f.cancelCutoffHours} onChange={(e) => setF({ ...f, cancelCutoffHours: Number(e.target.value) })} /></label>
          <label>Card / deposit<select value={f.depositType} onChange={(e) => setF({ ...f, depositType: e.target.value })}>
            <option value="NONE">None</option><option value="CARD_HOLD">Card hold</option><option value="DEPOSIT_PER_PERSON">Deposit per person</option><option value="DEPOSIT_PER_PARTY">Deposit per party</option></select></label>
          <label>Applies from party of<input type="number" value={f.minPartyForDeposit} onChange={(e) => setF({ ...f, minPartyForDeposit: Number(e.target.value) })} /></label>
        </div>
        <div className="cols">
          <label>Deposit ($){dollars('depositAmountCents')}</label>
          <label>No-show fee / person ($){dollars('noShowFeeCents')}</label>
          <label>Late cancel fee / person ($){dollars('lateCancelFeeCents')}</label>
        </div>
        <label>Policy text shown to diners<textarea value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} /></label>
        <button className="btn primary" onClick={() => save(() => api(`/manage/${rid}/settings/policies`, { body: f }), 'Policy published')}>Publish</button>
      </div>
      <div className="card"><h2>History</h2>
        {policies.map((p) => (
          <div key={p.id} style={{ borderBottom: '1px solid var(--line)', padding: '8px 0' }}>
            <b>v{p.version}</b> {p.active && <span className="badge COMPLETED">Active</span>} <span className="small muted">{new Date(p.createdAt).toLocaleDateString()}</span>
            <div className="small">{p.depositType.replace(/_/g, ' ').toLowerCase()} · deposit {money(p.depositAmountCents)} · no-show {money(p.noShowFeeCents)}/pp · cutoff {p.cancelCutoffHours}h</div>
            <div className="small muted">{p.text}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Closures({ rid, rows, save }: { rid: string; rows: any[]; save: any }) {
  const [date, setDate] = useState(''); const [reason, setReason] = useState('');
  return (
    <div className="card form" style={{ maxWidth: 520 }}>
      <p className="small muted">Closed dates take the restaurant off online availability (holidays, private events).</p>
      {rows.map((c) => <div key={c.id} className="spread"><span>{c.date} — {c.reason ?? 'Closed'}</span><button className="btn sm" onClick={() => save(() => api(`/manage/${rid}/settings/closures/${c.id}`, { method: 'DELETE' }))}>Remove</button></div>)}
      <div className="row"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /><input placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        <button className="btn primary" disabled={!date} onClick={() => save(() => api(`/manage/${rid}/settings/closures`, { body: { date, reason: reason || undefined } }))}>Add closure</button></div>
    </div>
  );
}

function Staff({ rid, save }: { rid: string; save: any }) {
  const [rows, setRows] = useState<any[]>([]);
  const [f, setF] = useState({ email: '', firstName: '', lastName: '', role: 'HOST', tempPassword: '' });
  const load = () => api(`/manage/${rid}/settings/staff`).then(setRows).catch(() => setRows([]));
  useEffect(() => { load(); }, [rid]);
  return (
    <div>
      <table className="list"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th></th></tr></thead>
        <tbody>{rows.map((m) => <tr key={m.id}><td>{m.firstName} {m.lastName}</td><td>{m.email}</td><td>{m.role}</td>
          <td><button className="btn sm danger" onClick={() => save(() => api(`/manage/${rid}/settings/staff/${m.id}`, { method: 'DELETE' }), 'Removed').then(load)}>Remove</button></td></tr>)}</tbody></table>
      <div className="card form" style={{ marginTop: 12, maxWidth: 640 }}>
        <h3>Invite staff (owners only)</h3>
        <div className="cols">
          <label>Email<input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
          <label>First name<input value={f.firstName} onChange={(e) => setF({ ...f, firstName: e.target.value })} /></label>
          <label>Last name<input value={f.lastName} onChange={(e) => setF({ ...f, lastName: e.target.value })} /></label>
          <label>Role<select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>{['OWNER', 'MANAGER', 'HOST', 'SERVER', 'MARKETING', 'READ_ONLY'].map((r) => <option key={r}>{r}</option>)}</select></label>
          <label>Temporary password<input value={f.tempPassword} onChange={(e) => setF({ ...f, tempPassword: e.target.value })} /></label>
        </div>
        <button className="btn primary" onClick={() => save(() => api(`/manage/${rid}/settings/staff`, { body: { ...f, tempPassword: f.tempPassword || undefined } }), 'Staff added').then(load)}>Add</button>
      </div>
    </div>
  );
}

/** Link the restaurant to its Google listing so diners see live Google rating, reviews and photos. */
function GoogleListing({ rid, name, save }: { rid: string; name: string; save: any }) {
  const [cur, setCur] = useState<any>(null);
  const [q, setQ] = useState(name);
  const [results, setResults] = useState<any[] | null>(null);
  const [err, setErr] = useState('');
  const load = () => api(`/manage/${rid}/settings/google`).then(setCur).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, [rid]);
  if (!cur) return <div className="muted">{err || 'Loading…'}</div>;
  if (!cur.configured) return <div className="card">Google integration isn't switched on for this platform yet. An administrator needs to set <code>GOOGLE_MAPS_API_KEY</code> on the API.</div>;
  return (
    <div className="grid2">
      <div className="card form">
        <h2>Linked listing</h2>
        {cur.placeId ? <>
          {cur.listing ? <p>★ {cur.listing.rating ?? '—'} from {cur.listing.userRatingCount ?? 0} Google reviews · {cur.listing.photos} photos shown in the diner app</p> : <p className="muted">Linked, but Google returned no details right now.</p>}
          <div className="row">
            {cur.listing?.googleMapsUri && <a className="btn" href={cur.listing.googleMapsUri} target="_blank" rel="noreferrer">Open in Google Maps</a>}
            <button className="btn danger" onClick={() => save(() => api(`/manage/${rid}/settings/google`, { method: 'PUT', body: { placeId: null } }), 'Unlinked').then(load)}>Unlink</button>
          </div>
        </> : <p className="muted">Not linked. Search for your restaurant on Google and pick the right result.</p>}
        <p className="small muted">Diners see your Google rating, up to 5 Google reviews and your Google photos, loaded live from Google with the attribution Google requires. TableDash stores only the Google place ID.</p>
      </div>
      <div className="card form">
        <h2>Find on Google</h2>
        <div className="row"><input style={{ flex: 1 }} value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn primary" onClick={async () => { setErr(''); try { setResults((await api(`/manage/${rid}/settings/google/search?q=${encodeURIComponent(q)}`)).results); } catch (e: any) { setErr(e.message); } }}>Search</button></div>
        {err && <div className="err">{err}</div>}
        {results?.length === 0 && <p className="muted">No matches. Try adding the street or neighborhood.</p>}
        {results?.map((r) => (
          <div key={r.placeId} className="spread" style={{ borderTop: '1px solid var(--line)', paddingTop: 8 }}>
            <div><b>{r.name}</b><div className="small muted">{r.address}{r.rating ? ` · ★ ${r.rating} (${r.userRatingCount})` : ''}</div></div>
            <button className="btn sm" disabled={cur.placeId === r.placeId} onClick={() => save(() => api(`/manage/${rid}/settings/google`, { method: 'PUT', body: { placeId: r.placeId } }), 'Google listing linked').then(() => { setResults(null); load(); })}>
              {cur.placeId === r.placeId ? 'Linked' : 'This is us'}</button>
          </div>
        ))}
        <p className="small muted">Places data © Google · <span translate="no">Google Maps</span></p>
      </div>
    </div>
  );
}
