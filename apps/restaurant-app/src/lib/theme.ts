import { StyleSheet } from 'react-native';
export const C = {
  bg: '#f4f2ee', card: '#ffffff', ink: '#1d1d1f', muted: '#6b6b70', line: '#e4e0d8', brand: '#c2410c', dark: '#1f1b18',
  ok: '#15803d', bad: '#b91c1c', warn: '#b45309', info: '#1d4ed8',
};
export const STATUS_FILL: Record<string, string> = {
  AVAILABLE: '#e8f5ec', RESERVED: '#ffedd5', SEATED: '#dbeafe', APPETIZER: '#ede9fe', ENTREE: '#ede9fe', DESSERT: '#ede9fe',
  CHECK_DROPPED: '#fef3c7', PAID: '#dcfce7', BUSSING: '#f3f4f6', OUT_OF_SERVICE: '#e5e7eb',
};
export const RES_COLOR: Record<string, string> = { CONFIRMED: C.brand, REQUESTED: C.warn, SEATED: C.info, COMPLETED: C.ok, CANCELLED: C.muted, DECLINED: C.muted, NO_SHOW: C.bad };
export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  pad: { padding: 16 },
  h1: { fontSize: 24, fontWeight: '800', color: C.ink },
  h2: { fontSize: 17, fontWeight: '700', color: C.ink, marginBottom: 6 },
  body: { fontSize: 15, color: C.ink },
  muted: { fontSize: 13, color: C.muted },
  card: { backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.line, padding: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: C.line, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: C.ink },
  label: { fontSize: 12, fontWeight: '700', color: C.muted, marginTop: 10, marginBottom: 4, textTransform: 'uppercase' },
});
