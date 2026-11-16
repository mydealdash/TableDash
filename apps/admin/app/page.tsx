'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, clearSession, getToken, money } from '@/lib/api';

const TABS = ['Overview', 'Restaurants', 'Requested restaurants', 'Users', 'Reviews', 'Payments & disputes', 'Audit log'] as const;
type Tab = (typeof TABS)[number];
const RAW_RA = process.env.NEXT_PUBLIC_RESTAURANT_APP_URL ?? 'http://localhost:3001';
const RESTAURANT_APP = RAW_RA.startsWith('http') ? RAW_RA : `https://${RAW_RA}`;

export default function Admin() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('Overview');
  const [ready, setReady] = useState(false);
  useEffect(() => { if (!getToken()) router.replace('/login'); else setReady(true); }, [router]);
  if (!ready) return null;
  return (
    <div className="shell">
      <nav className="side">
        <div className="brand">Table<span>Dash</span> <small style={{ fontWeight: 400, fontSize: 12 }}>admin</small></div>
        {TABS.map((t) => <a key={t} href="#" className={tab === t ? 'active' : ''} onClick={(e) => { e.preventDefault(); setTab(t); }}>{t}</a>)}
        <div className="foot"><button className="btn sm" onClick={() => { clearSession(); router.replace('/login'); }}>Sign out</button></div>
      </nav>
      <main className="main">
        {tab === 'Overview' && <Overview />}
        {tab === 'Restaurants' && <Restaurants />}
        {tab === 'Requested restaurants' && <Demand />}
        {tab === 'Users' && <Users />}
        {tab === 'Reviews' && <Reviews />}
        {tab === 'Payments & disputes' && <Payments />}
        {tab === 'Audit log' && <Audit />}
      </main>
    </div>
  );
}

function Overview() {
  const [s, setS] = useState<any>(null);
  useEffect(() => { api('/admin/stats').then(setS); }, []);
  if (!s) return <div className="muted">Loading…</div>;
  return (
    <div><h1>Platform overview</h1>
      <div className="kpi">
        <div className="card">Restaurants live<b>{s.restaurants.live} / {s.restaurants.total}</b></div>
        <div className="card">Diners<b>{s.diners}</b></div>
        <div className="card">Reservations (30d)<b>{s.last30d.reservations}</b></div>
        <div className="card">Covers (30d)<b>{s.last30d.covers}</b></div>
        <div className="card">Billable network covers (30d)<b>{s.last30d.networkCovers}</b></div>
        <div className="card">No-shows (30d)<b>{s.last30d.noShows}</b></div>
        <div className="card">Reviews to moderate<b>{s.flaggedReviews}</b></div>
      </div>
    </div>
  );
}

function Restaurants() {
  const [rows, setRows] = useState<any[]>([]);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<any>(null);
  const [creating, setCreating] = useState(false);
  const [msg, setMsg] = useState('');
  const load = useCallback(() => api(`/admin/restaurants?q=${encodeURIComponent(q)}`).then(setRows), [q]);
  useEffect(() => { load(); }, [load]);
  const open = async (id: string) => setSel(await api(`/admin/restaurants/${id}`));
  return (
    <div className="grid2" style={{ gridTemplateColumns: '1.4fr 1fr' }}>
      <div>
        <div className="spread" style={{ marginBottom: 12 }}>
          <h1 style={{ margin: 0 }}>Restaurants</h1>
          <div className="row"><input placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />
            <button className="btn primary" onClick={() => { setCreating(true); setSel(null); }}>Onboard restaurant</button></div>
        </div>
        {msg && <p className="ok">{msg}</p>}
        <table className="list"><thead><tr><th>Name</th><th>City</th><th>Plan</th><th>Status</th><th>Rating</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id} className="click" onClick={() => { setCreating(false); open(r.id); }}>
              <td><b>{r.name}</b><div className="small muted">{r.slug}</div></td><td>{r.city}</td><td>{r.plan}</td>
              <td><span className={`badge ${r.status === 'LIVE' ? 'COMPLETED' : r.status === 'SUSPENDED' ? 'NO_SHOW' : 'REQUESTED'}`}>{r.status}</span></td>
              <td>{r.ratingAvg} ({r.ratingCount})</td></tr>))}</tbody></table>
      </div>
      <div>
        {creating && <Onboard onDone={(r) => { setCreating(false); setMsg(`${r.name} created`); load(); open(r.id); }} />}
        {sel && (
          <div className="card form">
            <h2>{sel.name}</h2>
            <div className="small muted">{sel.address} · {sel.timezone}</div>
            <div className="cols">
              <label>Status<select value={sel.status} onChange={async (e) => { await api(`/admin/restaurants/${sel.id}`, { method: 'PATCH', body: { status: e.target.value } }); open(sel.id); load(); }}>
                {['ONBOARDING', 'LIVE', 'PAUSED', 'SUSPENDED'].map((s) => <option key={s}>{s}</option>)}</select></label>
              <label>Plan<select value={sel.plan} onChange={async (e) => { await api(`/admin/restaurants/${sel.id}`, { method: 'PATCH', body: { status: sel.status, plan: e.target.value } }); open(sel.id); load(); }}>
                {['BASIC', 'CORE', 'PRO'].map((s) => <option key={s}>{s}</option>)}</select></label>
            </div>
            <h3>Staff</h3>
            <ul className="small">{sel.staff.map((s: any) => <li key={s.id}>{s.name} · {s.email} · {s.role}</li>)}</ul>
            <h3>Billable network covers</h3>
            <ul className="small">{sel.billing.length ? sel.billing.map((b: any) => <li key={b.month}>{b.month}: {b.covers}</li>) : <li>None yet</li>}</ul>
            <button className="btn" onClick={async () => {
              const { token } = await api(`/admin/restaurants/${sel.id}/impersonate`, { body: {} });
              window.open(`${RESTAURANT_APP}/login#impersonate=${token}&rid=${sel.id}`, '_blank');
            }}>Open as support (audited)</button>
          </div>
        )}
      </div>
    </div>
  );
}

function Onboard({ onDone }: { onDone: (r: any) => void }) {
  const [f, setF] = useState<any>({ name: '', slug: '', cuisine: '', city: 'New York', address: '', lat: 40.73, lng: -73.99, timezone: 'America/New_York', neighborhood: '', plan: 'CORE',
    ownerEmail: '', ownerFirstName: '', ownerLastName: '', ownerTempPassword: '' });
  const [err, setErr] = useState('');
  const field = (k: string, label: string, type = 'text') => <label>{label}<input type={type} value={f[k]} onChange={(e) => setF({ ...f, [k]: type === 'number' ? Number(e.target.value) : e.target.value,
    ...(k === 'name' && !f.slugTouched ? { slug: e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') } : {}) })} /></label>;
  return (
    <form className="card form" onSubmit={async (e) => { e.preventDefault(); setErr('');
      try { const { slugTouched, ...body } = f; onDone(await api('/admin/restaurants', { body })); } catch (e: any) { setErr(e.message); } }}>
      <h2>Onboard a restaurant</h2>
      <div className="cols">{field('name', 'Name')}{field('slug', 'Slug')}{field('cuisine', 'Cuisine')}</div>
      <div className="cols">{field('address', 'Address')}{field('neighborhood', 'Neighborhood')}{field('city', 'City')}</div>
      <div className="cols">{field('lat', 'Latitude', 'number')}{field('lng', 'Longitude', 'number')}{field('timezone', 'Time zone')}
        <label>Plan<select value={f.plan} onChange={(e) => setF({ ...f, plan: e.target.value })}>{['BASIC', 'CORE', 'PRO'].map((p) => <option key={p}>{p}</option>)}</select></label></div>
      <h3>Owner account</h3>
      <div className="cols">{field('ownerEmail', 'Email', 'email')}{field('ownerFirstName', 'First name')}{field('ownerLastName', 'Last name')}{field('ownerTempPassword', 'Temp password')}</div>
      {err && <div className="err">{err}</div>}
      <button className="btn primary">Create (starts in ONBOARDING)</button>
    </form>
  );
}

function Users() {
  const [q, setQ] = useState(''); const [rows, setRows] = useState<any[]>([]);
  useEffect(() => { const t = setTimeout(() => api(`/admin/users?q=${encodeURIComponent(q)}`).then(setRows), 250); return () => clearTimeout(t); }, [q]);
  return (
    <div><div className="spread"><h1>Users</h1><input placeholder="Search name, email, phone" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <table className="list"><thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Role</th><th>Tier</th><th>Points</th><th>Joined</th></tr></thead>
        <tbody>{rows.map((u) => <tr key={u.id}><td>{u.firstName} {u.lastName}{u.deletedAt && <span className="badge NO_SHOW"> deleted</span>}</td><td>{u.email}</td><td>{u.phone}</td>
          <td>{u.platformRole}</td><td>{u.tier}</td><td>{u.points}</td><td className="small">{new Date(u.createdAt).toLocaleDateString()}</td></tr>)}</tbody></table></div>
  );
}

function Reviews() {
  const [status, setStatus] = useState('FLAGGED'); const [rows, setRows] = useState<any[]>([]);
  const load = useCallback(() => api(`/admin/reviews?status=${status}`).then(setRows), [status]);
  useEffect(() => { load(); }, [load]);
  return (
    <div style={{ maxWidth: 860 }}>
      <div className="spread"><h1>Review moderation</h1>
        <select value={status} onChange={(e) => setStatus(e.target.value)}><option>FLAGGED</option><option>PUBLISHED</option><option>REMOVED</option></select></div>
      {rows.map((r) => (
        <div key={r.id} className="card" style={{ marginBottom: 10 }}>
          <div className="spread"><b>{r.restaurant} · {'★'.repeat(r.rating)} · {r.author}</b><span className="small muted">{new Date(r.createdAt).toLocaleDateString()}</span></div>
          <p>{r.text}</p>
          <div className="row">
            {r.status !== 'PUBLISHED' && <button className="btn" onClick={() => api(`/admin/reviews/${r.id}`, { method: 'PATCH', body: { status: 'PUBLISHED' } }).then(load)}>Keep published</button>}
            {r.status !== 'REMOVED' && <button className="btn danger" onClick={() => api(`/admin/reviews/${r.id}`, { method: 'PATCH', body: { status: 'REMOVED' } }).then(load)}>Remove</button>}
          </div>
        </div>
      ))}
      {rows.length === 0 && <p className="muted">Nothing in this queue.</p>}
    </div>
  );
}

function Payments() {
  const [rows, setRows] = useState<any[]>([]); const [ev, setEv] = useState<any>(null);
  const load = () => api('/admin/payments').then(setRows);
  useEffect(() => { load(); }, []);
  return (
    <div className="grid2" style={{ gridTemplateColumns: '1.5fr 1fr' }}>
      <div><h1>Payments & disputes</h1>
        <table className="list"><thead><tr><th>Restaurant</th><th>Guest</th><th>Kind</th><th>Amount</th><th>Platform fee</th><th>Status</th><th></th></tr></thead>
          <tbody>{rows.map((p) => <tr key={p.id}><td>{p.restaurant}<div className="small muted">{p.code}</div></td><td>{p.guest}</td><td className="small">{p.kind}</td>
            <td>{money(p.amountCents)}</td><td>{money(p.platformFeeCents)}</td><td><span className="badge">{p.status}</span></td>
            <td className="row"><button className="btn sm" onClick={async () => setEv(await api(`/admin/payments/${p.id}/evidence`))}>Evidence</button>
              {p.status === 'CAPTURED' && <button className="btn sm danger" onClick={() => api(`/admin/payments/${p.id}`, { method: 'PATCH', body: { status: 'DISPUTED', reason: prompt('Dispute note') ?? undefined } }).then(load)}>Mark disputed</button>}</td></tr>)}</tbody></table>
      </div>
      <div>{ev && (
        <div className="card"><h2>Chargeback evidence</h2>
          <p className="small"><b>Reservation</b> {ev.reservation.code} · {ev.reservation.guestName} · party {ev.reservation.partySize} · {new Date(ev.reservation.startsAt).toLocaleString()} · {ev.reservation.status}</p>
          <p className="small"><b>Policy accepted</b> v{ev.policyAccepted?.version}: {ev.policyAccepted?.text}</p>
          <h3>Timeline</h3>
          <ul className="small">{ev.timeline.map((e: any) => <li key={e.id}>{new Date(e.createdAt).toLocaleString()} — {e.type}</li>)}</ul>
        </div>
      )}</div>
    </div>
  );
}

function Audit() {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => { api('/admin/audit').then(setRows); }, []);
  return (
    <div><h1>Audit log</h1>
      <table className="list"><thead><tr><th>When</th><th>Action</th><th>Entity</th><th>Actor</th><th>Restaurant</th></tr></thead>
        <tbody>{rows.map((a) => <tr key={a.id}><td className="small">{new Date(a.createdAt).toLocaleString()}</td><td>{a.action}</td><td>{a.entity}</td>
          <td className="small muted">{a.actorId?.slice(0, 8)}</td><td className="small muted">{a.restaurantId?.slice(0, 8)}</td></tr>)}</tbody></table></div>
  );
}

/** Restaurants diners asked for with "Tell me when they join": a sales lead list. */
function Demand() {
  const [rows, setRows] = useState<any[] | null>(null);
  useEffect(() => { api('/admin/place-demand').then(setRows).catch(() => setRows([])); }, []);
  return (
    <div style={{ maxWidth: 900 }}>
      <h1>Requested restaurants</h1>
      <p className="muted">Restaurants diners found through Google search and asked to book. When one signs up and links its Google listing, everyone who asked is notified automatically.</p>
      <table className="list"><thead><tr><th>Restaurant</th><th>Address</th><th>Diner requests</th><th>Status</th><th></th></tr></thead>
        <tbody>{(rows ?? []).map((r) => (
          <tr key={r.placeId}><td><b>{r.name ?? r.placeId}</b></td><td className="small">{r.address ?? '—'}</td><td>{r.requests}</td>
            <td>{r.onTableDash ? <span className="badge COMPLETED">On TableDash</span> : <span className="badge REQUESTED">Lead</span>}</td>
            <td>{r.googleMapsUri && <a className="btn sm" href={r.googleMapsUri} target="_blank" rel="noreferrer">Google Maps</a>}</td></tr>
        ))}
        {rows && rows.length === 0 && <tr><td colSpan={5} className="muted">No requests yet.</td></tr>}</tbody></table>
      <p className="small muted">Names and addresses are loaded live from <span translate="no">Google Maps</span>.</p>
    </div>
  );
}
