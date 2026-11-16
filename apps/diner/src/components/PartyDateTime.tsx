import { Text, View } from 'react-native';
import { Chip, ChipRow } from './ui';
import { localDate, prettyDate, prettyTime } from '../lib/api';
import { s } from '../lib/theme';

export interface PDT { party: number; date: string; time: string }
const TIMES = ['11:30', '12:00', '12:30', '13:00', '17:00', '17:30', '18:00', '18:30', '19:00', '19:30', '20:00', '20:30', '21:00', '21:30'];

/** Party size, date and time pickers as chip rows (one-handed, no modal pickers). */
export function PartyDateTime({ value, onChange }: { value: PDT; onChange: (v: PDT) => void }) {
  return (
    <View>
      <Text style={s.label}>Party</Text>
      <ChipRow>{Array.from({ length: 10 }, (_, i) => i + 1).map((n) => <Chip key={n} label={`${n}${n === 10 ? '+' : ''}`} on={value.party === n} onPress={() => onChange({ ...value, party: n })} />)}</ChipRow>
      <Text style={s.label}>Date</Text>
      <ChipRow>{Array.from({ length: 21 }, (_, i) => localDate(i)).map((d, i) => (
        <Chip key={d} label={i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : prettyDate(d)} on={value.date === d} onPress={() => onChange({ ...value, date: d })} />
      ))}</ChipRow>
      <Text style={s.label}>Time</Text>
      <ChipRow>{TIMES.map((t) => <Chip key={t} label={prettyTime(t)} on={value.time === t} onPress={() => onChange({ ...value, time: t })} />)}</ChipRow>
    </View>
  );
}
