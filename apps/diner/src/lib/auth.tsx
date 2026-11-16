import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, loadToken, saveToken } from './api';
import { registerForPush } from './push';

export interface User { id: string; firstName: string; lastName: string; email?: string | null; phone?: string | null; tier: 'STANDARD' | 'GOLD'; points: number; dietaryNotes?: string | null }
interface AuthCtx { user: User | null; ready: boolean; signIn: (token: string, user: User) => Promise<void>; signOut: () => Promise<void>; refresh: () => Promise<void> }
const Ctx = createContext<AuthCtx>(null as any);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const refresh = useCallback(async () => {
    try { setUser(await api('/me')); } catch { await saveToken(null); setUser(null); }
  }, []);
  useEffect(() => { (async () => { if (await loadToken()) await refresh(); setReady(true); })(); }, [refresh]);
  const signIn = async (token: string, u: User) => {
    await saveToken(token); setUser(u);
    registerForPush().then((pushToken) => pushToken && api('/me', { method: 'PATCH', body: { pushToken } })).catch(() => {});
  };
  const signOut = async () => { await saveToken(null); setUser(null); };
  return <Ctx.Provider value={{ user, ready, signIn, signOut, refresh }}>{children}</Ctx.Provider>;
}
