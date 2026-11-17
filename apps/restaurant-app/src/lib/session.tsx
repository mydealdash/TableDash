import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, setToken, store } from './api';

export interface Membership { restaurantId: string; role: string; name: string; slug: string }
export interface Restaurant { id: string; name: string; timezone: string; onlineBookingEnabled: boolean; role: string }
interface Session {
  ready: boolean; user: any | null; memberships: Membership[]; restaurant: Restaurant | null;
  signIn: (email: string, password: string) => Promise<void>; signOut: () => Promise<void>;
  selectRestaurant: (id: string) => Promise<void>; refreshRestaurant: () => Promise<void>;
  can: (...roles: string[]) => boolean;
}
const Ctx = createContext<Session>(null as any);
export const useSession = () => useContext(Ctx);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);

  const load = useCallback(async (rid: string, ms: Membership[], u: any) => {
    const f = await api(`/manage/${rid}/floor`);
    const role = ms.find((m) => m.restaurantId === rid)?.role ?? (u?.platformRole === 'ADMIN' ? 'ADMIN' : 'READ_ONLY');
    setRestaurant({ id: rid, name: f.restaurant.name, timezone: f.restaurant.timezone, onlineBookingEnabled: f.restaurant.onlineBookingEnabled, role });
    await store.set('tdr_restaurant', rid);
  }, []);

  useEffect(() => { (async () => {
    const t = await store.get('tdr_token');
    if (t) {
      setToken(t);
      try {
        const me = await api('/auth/me');
        setUser(me.user); setMemberships(me.memberships);
        const last = await store.get('tdr_restaurant');
        const rid = me.memberships.find((m: Membership) => m.restaurantId === last)?.restaurantId ?? me.memberships[0]?.restaurantId;
        if (rid) await load(rid, me.memberships, me.user);
      } catch (e: any) {
        if (e?.status === 401 || e?.status === 403) { setToken(null); await store.del('tdr_token'); }
      }
    }
    setReady(true);
  })(); }, [load]);

  const signIn = async (email: string, password: string) => {
    const res = await api('/auth/login', { body: { email, password }, timeoutMs: 90000 });
    if (!res.memberships?.length) throw new Error('This account is not linked to a restaurant.');
    setToken(res.token); await store.set('tdr_token', res.token);
    setUser(res.user); setMemberships(res.memberships);
    try {
      await load(res.memberships[0].restaurantId, res.memberships, res.user);
    } catch (e: any) {
      throw new Error(`Signed in, but couldn't open ${res.memberships[0].name}: ${e.message}`);
    }
  };
  const signOut = async () => { setToken(null); await store.del('tdr_token'); setUser(null); setMemberships([]); setRestaurant(null); };
  const selectRestaurant = (id: string) => load(id, memberships, user);
  const refreshRestaurant = async () => { if (restaurant) await load(restaurant.id, memberships, user); };
  const can = (...roles: string[]) => !!restaurant && (restaurant.role === 'ADMIN' || roles.includes(restaurant.role));

  return <Ctx.Provider value={{ ready, user, memberships, restaurant, signIn, signOut, selectRestaurant, refreshRestaurant, can }}>{children}</Ctx.Provider>;
}

export const FLOOR = ['OWNER', 'MANAGER', 'HOST'];
export const MANAGERS = ['OWNER', 'MANAGER'];
