import { ActivityIndicator, Pressable, ScrollView, Text, View, ViewStyle } from 'react-native';
import { C, s } from '../lib/theme';
import { prettyTime } from '../lib/api';

export function Button({ title, onPress, kind = 'primary', disabled, loading, style }: {
  title: string; onPress: () => void; kind?: 'primary' | 'ghost' | 'danger'; disabled?: boolean; loading?: boolean; style?: ViewStyle;
}) {
  const bg = kind === 'primary' ? C.brand : '#fff';
  const fg = kind === 'primary' ? '#fff' : kind === 'danger' ? C.bad : C.ink;
  return (
    <Pressable onPress={onPress} disabled={disabled || loading} accessibilityRole="button"
      style={({ pressed }) => [{ backgroundColor: bg, borderRadius: 12, paddingVertical: 14, alignItems: 'center', borderWidth: kind === 'primary' ? 0 : 1, borderColor: C.line, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 }, style]}>
      {loading ? <ActivityIndicator color={fg} /> : <Text style={{ color: fg, fontFamily: 'Nunito_700Bold', fontSize: 16 }}>{title}</Text>}
    </Pressable>
  );
}

export function Chip({ label, on, onPress }: { label: string; on?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: on ? C.ink : C.line, backgroundColor: on ? C.ink : '#fff' }}>
      <Text style={{ color: on ? '#fff' : C.ink, fontFamily: 'Nunito_700Bold', fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

export function ChipRow({ children }: { children: React.ReactNode }) {
  return <ScrollView horizontal style={{ flexGrow: 0 }} showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4, alignItems: "center" }}>{children}</ScrollView>;
}

/** Bookable time button, the core affordance of both apps (slot-first booking). */
export function SlotButton({ time, onPress, selected }: { time: string; onPress: () => void; selected?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityLabel={`Book ${prettyTime(time)}`}
      style={({ pressed }) => ({ backgroundColor: selected ? C.ink : C.brand, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10, opacity: pressed ? 0.8 : 1 })}>
      <Text style={{ color: '#fff', fontFamily: 'Nunito_700Bold' }}>{prettyTime(time)}</Text>
    </Pressable>
  );
}

export function Badge({ text, color = C.muted }: { text: string; color?: string }) {
  return <View style={{ borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: color + '1A', alignSelf: 'flex-start' }}><Text style={{ color, fontSize: 11, fontFamily: 'Nunito_800ExtraBold' }}>{text}</Text></View>;
}

export const Empty = ({ text }: { text: string }) => <Text style={[s.muted, { textAlign: 'center', marginTop: 40 }]}>{text}</Text>;
export const Loading = () => <ActivityIndicator style={{ marginTop: 40 }} color={C.brand} />;
