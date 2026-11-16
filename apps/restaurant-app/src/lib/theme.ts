import { StyleSheet } from 'react-native';
// TableDash brand: tomato coral, mint, navy ink. Headings in Nunito.
export const C = {
  bg: '#F4F6F9', card: '#FFFFFF', ink: '#14213D', muted: '#5B6478', line: '#E1E5EC', brand: '#F2522F', dark: '#14213D', mint: '#19B394',
  ok: '#0E9F7E', bad: '#D64545', warn: '#D98200', info: '#3B6FE0',
};
export const STATUS_FILL: Record<string, string> = {
  AVAILABLE: '#E3F7F1', RESERVED: '#FFE6DF', SEATED: '#E1EAFE', APPETIZER: '#ECE7FD', ENTREE: '#ECE7FD', DESSERT: '#ECE7FD',
  CHECK_DROPPED: '#FFF2D6', PAID: '#D9F5EC', BUSSING: '#EEF0F4', OUT_OF_SERVICE: '#E1E5EC',
};
export const RES_COLOR: Record<string, string> = { CONFIRMED: C.brand, REQUESTED: C.warn, SEATED: C.info, COMPLETED: C.ok, CANCELLED: C.muted, DECLINED: C.muted, NO_SHOW: C.bad };
export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  pad: { padding: 16 },
  h1: { fontSize: 26, fontFamily: 'Nunito_900Black', color: C.ink },
  h2: { fontSize: 18, fontFamily: 'Nunito_800ExtraBold', color: C.ink, marginBottom: 6 },
  body: { fontSize: 15, color: C.ink },
  muted: { fontSize: 13, color: C.muted },
  card: { backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.line, padding: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: C.ink },
  label: { fontSize: 12, fontFamily: 'Nunito_800ExtraBold', color: C.muted, marginTop: 10, marginBottom: 4, textTransform: 'uppercase' },
});
