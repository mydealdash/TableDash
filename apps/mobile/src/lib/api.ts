import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

export const API_URL: string = process.env.EXPO_PUBLIC_API_URL ?? (Constants.expoConfig?.extra as any)?.apiUrl ?? 'http://localhost:4000';
let token: string | null = null;

export async function loadToken() { token = await SecureStore.getItemAsync('td_token'); return token; }
export async function saveToken(t: string | null) {
  token = t;
  if (t) await SecureStore.setItemAsync('td_token', t); else await SecureStore.deleteItemAsync('td_token');
}
export const hasToken = () => !!token;

export class ApiError extends Error { constructor(public status: number, message: string, public body?: any) { super(message); } }

export async function api<T = any>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`${API_URL}/v1${path}`, {
    method: init.method ?? (init.body !== undefined ? 'POST' : 'GET'),
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(res.status, Array.isArray(data?.message) ? data.message.join(', ') : data?.message ?? 'Something went wrong', data);
  return data as T;
}

export const randomKey = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
export const money = (c: number) => `$${(c / 100).toFixed(c % 100 ? 2 : 0)}`;
export const price = (n: number) => '$'.repeat(n);

export function localDate(offsetDays = 0) {
  const d = new Date(); d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function prettyDate(date: string) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
export function prettyTime(t: string) {
  const [h, m] = t.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}
export function inZone(iso: string, tz: string) {
  const d = new Date(iso);
  return {
    date: new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(d),
    label: new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(d),
  };
}
