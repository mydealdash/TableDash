import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const RAW_API: string = process.env.EXPO_PUBLIC_API_URL ?? (Constants.expoConfig?.extra as any)?.apiUrl ?? 'http://localhost:4000';
export const API_URL = RAW_API.startsWith('http') ? RAW_API : `https://${RAW_API}`;

export const store = Platform.OS === 'web'
  ? { get: async (k: string) => localStorage.getItem(k), set: async (k: string, v: string) => localStorage.setItem(k, v), del: async (k: string) => localStorage.removeItem(k) }
  : { get: (k: string) => SecureStore.getItemAsync(k), set: (k: string, v: string) => SecureStore.setItemAsync(k, v), del: (k: string) => SecureStore.deleteItemAsync(k) };

let token: string | null = null;
export const setToken = (t: string | null) => { token = t; };
export const getToken = () => token;

export class ApiError extends Error { constructor(public status: number, message: string, public body?: any) { super(message); } }

export async function api<T = any>(path: string, init: { method?: string; body?: unknown; raw?: boolean } = {}): Promise<T> {
  const res = await fetch(`${API_URL}/v1${path}`, {
    method: init.method ?? (init.body !== undefined ? 'POST' : 'GET'),
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    let data: any = {}; try { data = JSON.parse(text); } catch {}
    throw new ApiError(res.status, Array.isArray(data.message) ? data.message.join(', ') : data.message ?? 'Request failed', data);
  }
  if (init.raw) return text as any;
  return (text ? JSON.parse(text) : null) as T;
}

export const money = (c?: number | null) => (c == null ? '—' : `$${(c / 100).toFixed(c % 100 ? 2 : 0)}`);
export const todayIn = (tz: string) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
export const timeIn = (iso: string, tz: string) => new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
export const addDays = (d: string, n: number) => { const [y, m, dd] = d.split('-').map(Number); return new Date(Date.UTC(y, m - 1, dd + n)).toISOString().slice(0, 10); };
export const prettyDate = (d: string) => { const [y, m, dd] = d.split('-').map(Number); return new Date(y, m - 1, dd).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); };
export const label = (s: string) => s.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
