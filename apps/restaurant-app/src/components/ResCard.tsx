import { Pressable, Text, View } from 'react-native';
import { money, label } from '../lib/api';
import { C, RES_COLOR, s } from '../lib/theme';
import { Badge } from './ui';

export function ResCard({ r, tableName, selected, onPress, children }: { r: any; tableName: (id: string) => string; selected?: boolean; onPress?: () => void; children?: React.ReactNode }) {
  const deposit = r.payments?.find((p: any) => p.kind === 'DEPOSIT');
  return (
    <Pressable onPress={onPress} style={[s.card, { marginBottom: 8, borderColor: selected ? C.brand : C.line, borderWidth: selected ? 2 : 1 }]}>
      <View style={[s.row, { justifyContent: 'space-between' }]}>
        <Text style={{ fontSize: 16, fontWeight: '800', flexShrink: 1 }}>{r.localTime} · {r.guestName} · {r.partySize}</Text>
        <Badge text={label(r.status)} color={RES_COLOR[r.status]} />
      </View>
      <Text style={[s.muted, { marginTop: 3 }]}>
        {[r.tableIds?.length ? `Table ${r.tableIds.map(tableName).join('+')}` : null, r.channel.toLowerCase().replace('_', '-'),
          r.confirmedByGuestAt ? '✓ confirmed' : null, deposit ? `deposit ${money(deposit.amountCents)}` : null,
          r.payments?.some((p: any) => p.kind === 'CARD_HOLD') ? 'card on file' : null].filter(Boolean).join(' · ')}
      </Text>
      {r.guest && (
        <View style={[s.row, { flexWrap: 'wrap', gap: 4, marginTop: 6 }]}>
          {r.guest.isVip && <Badge text="VIP" color={C.dark} />}
          {r.guest.visitCount > 0 && <Badge text={`${r.guest.visitCount} visits`} />}
          {r.guest.noShowCount > 0 && <Badge text={`${r.guest.noShowCount} no-show`} color={C.bad} />}
          {!!r.guest.allergies && <Badge text={`Allergy: ${r.guest.allergies}`} color={C.bad} />}
          {r.guest.tags.map((t: string) => <Badge key={t} text={t} color={C.info} />)}
        </View>
      )}
      {(r.occasion || r.specialRequest) && <Text style={[s.body, { marginTop: 4, fontSize: 13 }]}>{r.occasion ? `${r.occasion}. ` : ''}{r.specialRequest ?? ''}</Text>}
      {children}
    </Pressable>
  );
}
