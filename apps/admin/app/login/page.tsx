'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, setSession } from '@/lib/api';

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('admin@tabledash.dev');
  const [password, setPassword] = useState('password123');
  const [err, setErr] = useState('');
  return (
    <div className="login">
      <form className="card form" style={{ width: 340 }} onSubmit={async (e) => {
        e.preventDefault(); setErr('');
        try {
          const res = await api('/auth/login', { body: { email, password } });
          if (res.user.platformRole !== 'ADMIN') throw new Error('Platform admins only');
          setSession(res.token, [], res.user); router.replace('/');
        } catch (e: any) { setErr(e.message); }
      }}>
        <h1>TableDash Admin</h1>
        <label>Email<input value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        {err && <div className="err">{err}</div>}
        <button className="btn primary">Sign in</button>
      </form>
    </div>
  );
}
