import { StyleSheet } from 'react-native';
// TableDash brand: tomato coral, mint, navy ink. Headings in Nunito (rounded), body in the system font.
export const C = { bg: '#F7F8FA', card: '#FFFFFF', ink: '#14213D', muted: '#5B6478', line: '#E6E8EE', brand: '#F2522F', brandSoft: '#FFF0EC', mint: '#19B394', mintSoft: '#E5F7F2', ok: '#0E9F7E', bad: '#D64545', gold: '#D99100' };
export const F = { black: 'Nunito_900Black', extra: 'Nunito_800ExtraBold', bold: 'Nunito_700Bold' };
export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  pad: { padding: 16 },
  h1: { fontSize: 28, fontFamily: 'Nunito_900Black', color: C.ink, letterSpacing: -0.5 },
  h2: { fontSize: 19, fontFamily: 'Nunito_800ExtraBold', color: C.ink, marginBottom: 8 },
  body: { fontSize: 15, color: C.ink, lineHeight: 21 },
  muted: { fontSize: 13, color: C.muted },
  card: { backgroundColor: C.card, borderRadius: 18, borderWidth: 1, borderColor: C.line, padding: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: C.line, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 11, fontSize: 15, color: C.ink },
  label: { fontSize: 12, fontFamily: 'Nunito_800ExtraBold', color: C.muted, marginBottom: 4, marginTop: 10, textTransform: 'uppercase', letterSpacing: 0.4 },
  err: { color: C.bad, marginTop: 8 },
});
