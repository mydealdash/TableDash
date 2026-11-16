import { ActivityIndicator, Modal, Pressable, ScrollView, Text, View, ViewStyle } from 'react-native';
import { C, s } from '../lib/theme';

export function Btn({ title, onPress, kind = 'ghost', small, disabled, loading, style }: {
  title: string; onPress: () => void; kind?: 'primary' | 'ghost' | 'danger' | 'dark'; small?: boolean; disabled?: boolean; loading?: boolean; style?: ViewStyle;
}) {
  const bg = kind === 'primary' ? C.brand : kind === 'dark' ? C.dark : '#fff';
  const fg = kind === 'primary' || kind === 'dark' ? '#fff' : kind === 'danger' ? C.bad : C.ink;
  return (
    <Pressable onPress={onPress} disabled={disabled || loading} hitSlop={4}
      style={({ pressed }) => [{ backgroundColor: bg, borderRadius: 10, paddingVertical: small ? 7 : 12, paddingHorizontal: small ? 10 : 16, alignItems: 'center',
        borderWidth: kind === 'ghost' || kind === 'danger' ? 1 : 0, borderColor: C.line, opacity: disabled ? 0.45 : pressed ? 0.8 : 1 }, style]}>
      {loading ? <ActivityIndicator color={fg} /> : <Text style={{ color: fg, fontWeight: '700', fontSize: small ? 13 : 15 }}>{title}</Text>}
    </Pressable>
  );
}
export function Chip({ label, on, onPress }: { label: string; on?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: on ? C.dark : C.line, backgroundColor: on ? C.dark : '#fff' }}>
      <Text style={{ color: on ? '#fff' : C.ink, fontWeight: '600', fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}
export const Chips = ({ children }: { children: React.ReactNode }) =>
  <ScrollView horizontal style={{ flexGrow: 0 }} showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 4, alignItems: "center" }}>{children}</ScrollView>;
export function Badge({ text, color = C.muted }: { text: string; color?: string }) {
  return <View style={{ borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: color + '1F', alignSelf: 'flex-start' }}><Text style={{ color, fontSize: 11, fontWeight: '800' }}>{text}</Text></View>;
}
export function Sheet({ visible, title, onClose, children }: { visible: boolean; title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: '#0006', justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: C.bg, borderTopLeftRadius: 18, borderTopRightRadius: 18, maxHeight: '90%', width: '100%', maxWidth: 640, alignSelf: 'center' }}>
          <View style={[s.row, { justifyContent: 'space-between', padding: 16, paddingBottom: 6 }]}>
            <Text style={s.h2}>{title}</Text><Btn small title="Close" onPress={onClose} />
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 4, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">{children}</ScrollView>
        </View>
      </View>
    </Modal>
  );
}
export const Loading = () => <ActivityIndicator style={{ marginTop: 40 }} color={C.brand} />;
export const Empty = ({ text }: { text: string }) => <Text style={[s.muted, { textAlign: 'center', marginTop: 30 }]}>{text}</Text>;
