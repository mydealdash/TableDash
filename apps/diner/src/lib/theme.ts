import { StyleSheet } from 'react-native';
export const C = { bg: '#faf8f5', card: '#ffffff', ink: '#1d1d1f', muted: '#6b6b70', line: '#ebe7e0', brand: '#c2410c', brandSoft: '#fff1e6', ok: '#15803d', bad: '#b91c1c', gold: '#b7791f' };
export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  pad: { padding: 16 },
  h1: { fontSize: 26, fontWeight: '800', color: C.ink, letterSpacing: -0.5 },
  h2: { fontSize: 18, fontWeight: '700', color: C.ink, marginBottom: 8 },
  body: { fontSize: 15, color: C.ink, lineHeight: 21 },
  muted: { fontSize: 13, color: C.muted },
  card: { backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.line, padding: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: C.line, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, fontSize: 15, color: C.ink },
  label: { fontSize: 12, fontWeight: '700', color: C.muted, marginBottom: 4, marginTop: 10, textTransform: 'uppercase', letterSpacing: 0.4 },
  err: { color: C.bad, marginTop: 8 },
});
