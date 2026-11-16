'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, setSession } from '@/lib/api';

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('host+osteria-lume@tabledash.dev');
  const [password, setPassword] = useState('password123');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  // Support impersonation from the admin console: #impersonate=<token>&rid=<restaurantId>
  useEffect(() => {
    const h = new URLSearchParams(window.location.hash.slice(1));
    const token = h.get('impersonate'); const rid = h.get('rid');
    if (token && rid) {
      setSession(token, [], { firstName: 'Support', platformRole: 'ADMIN' });
      history.replaceState(null, '', '/login');
      router.replace(`/r/${rid}/host`);
    }
  }, [router]);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr('');
    try {
      const res = await api('/auth/login', { body: { email, password } });
      if (!res.memberships.length && res.user.platformRole !== 'ADMIN') throw new Error('This account is not linked to a restaurant.');
      setSession(res.token, res.memberships, res.user);
      router.replace('/');
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  return (
    <div className="login">
      <form className="card form" style={{ width: 360 }} onSubmit={submit}>
        <h1>Table<span style={{ color: 'var(--brand)' }}>Dash</span> for Restaurants</h1>
        <label>Email<input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required /></label>
        <label>Password<input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required /></label>
        {err && <div className="err">{err}</div>}
        <button className="btn primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <p className="small muted">Demo: host+&lt;slug&gt;@tabledash.dev, owner+&lt;slug&gt;@tabledash.dev or manager@tabledash.dev · password123</p>
      </form>
    </div>
  );
}
