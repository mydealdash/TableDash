'use client';
const RAW_API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
export const API_URL = RAW_API.startsWith('http') ? RAW_API : `https://${RAW_API}`;

export class ApiError extends Error {
  constructor(public status: number, message: string, public body?: any) { super(message); }
}

export function getToken() { return typeof window === 'undefined' ? null : localStorage.getItem('td_admin_token'); }
export function setSession(token: string, memberships: Membership[], user: any) {
  localStorage.setItem('td_admin_token', token);
  localStorage.setItem('td_admin_memberships', JSON.stringify(memberships));
  localStorage.setItem('td_admin_user', JSON.stringify(user));
}
export function clearSession() { ['td_admin_token', 'td_admin_memberships', 'td_admin_user'].forEach((k) => localStorage.removeItem(k)); }
export function getMemberships(): Membership[] { try { return JSON.parse(localStorage.getItem('td_admin_memberships') ?? '[]'); } catch { return []; } }
export function getUser(): any { try { return JSON.parse(localStorage.getItem('td_admin_user') ?? 'null'); } catch { return null; } }
export interface Membership { restaurantId: string; role: string; name: string; slug: string }

export async function api<T = any>(path: string, init: { method?: string; body?: unknown; raw?: boolean } = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_URL}/v1${path}`, {
    method: init.method ?? (init.body ? 'POST' : 'GET'),
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  if (res.status === 401 && typeof window !== 'undefined' && !path.startsWith('/auth')) {
    clearSession(); window.location.href = '/login';
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg = Array.isArray(body.message) ? body.message.join(', ') : body.message ?? res.statusText;
    throw new ApiError(res.status, msg, body);
  }
  if (init.raw) return (await res.text()) as any;
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

export const money = (cents?: number | null) => (cents == null ? '—' : `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`);
export const todayIn = (tz: string) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
export const timeIn = (iso: string, tz: string) => new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
export const addDays = (d: string, n: number) => { const [y, m, dd] = d.split('-').map(Number); return new Date(Date.UTC(y, m - 1, dd + n)).toISOString().slice(0, 10); };
