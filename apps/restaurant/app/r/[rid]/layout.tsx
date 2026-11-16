'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { api, clearSession, getMemberships, getToken, getUser, Membership } from '@/lib/api';
import { Ctx } from './context';

const NAV = [
  ['host', 'Host stand'], ['reservations', 'Reservations'], ['guests', 'Guestbook'],
  ['reviews', 'Reviews'], ['reports', 'Reports'], ['settings', 'Settings'],
] as const;

export default function RestaurantLayout({ children, params }: { children: React.ReactNode; params: { rid: string } }) {
  const router = useRouter();
  const path = usePathname();
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [meta, setMeta] = useState<{ name: string; timezone: string; onlineBookingEnabled: boolean } | null>(null);
  const [user, setUser] = useState<any>(null);

  const refreshMeta = useCallback(() => {
    api(`/manage/${params.rid}/floor`).then((f) => setMeta(f.restaurant)).catch(() => router.replace('/login'));
  }, [params.rid, router]);

  useEffect(() => {
    if (!getToken()) { router.replace('/login'); return; }
    setMemberships(getMemberships()); setUser(getUser());
    localStorage.setItem('td_last_restaurant', params.rid);
    refreshMeta();
  }, [params.rid, refreshMeta, router]);

  if (!meta) return <div className="main muted">Loading…</div>;
  const role = memberships.find((m) => m.restaurantId === params.rid)?.role ?? (user?.platformRole === 'ADMIN' ? 'ADMIN' : 'READ_ONLY');
  const section = path.split('/')[3];

  return (
    <Ctx.Provider value={{ rid: params.rid, ...meta, role, refreshMeta }}>
      <div className="shell">
        <nav className="side">
          <div className="logo" style={{ padding: '4px 8px 18px', color: '#fff' }}><img src="/mark.svg" alt="" /><div>Table<span className="dash">Dash</span><small>for Restaurants</small></div></div>
          {memberships.length > 1 && (
            <select value={params.rid} onChange={(e) => router.push(`/r/${e.target.value}/${section ?? 'host'}`)}>
              {memberships.map((m) => <option key={m.restaurantId} value={m.restaurantId}>{m.name}</option>)}
            </select>
          )}
          {NAV.map(([href, label]) => (
            <Link key={href} href={`/r/${params.rid}/${href}`} className={section === href ? 'active' : ''}>{label}</Link>
          ))}
          <div className="foot">
            <div style={{ color: '#fff', fontWeight: 600 }}>{meta.name}</div>
            <div>{user?.firstName} · {role}</div>
            <button className="btn sm" style={{ marginTop: 8 }} onClick={() => { clearSession(); router.replace('/login'); }}>Sign out</button>
          </div>
        </nav>
        <main className="main">{children}</main>
      </div>
    </Ctx.Provider>
  );
}
