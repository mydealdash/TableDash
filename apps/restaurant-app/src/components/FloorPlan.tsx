import Svg, { Ellipse, G, Rect, Text as SvgText } from 'react-native-svg';
import { STATUS_FILL, C } from '../lib/theme';
import { label, timeIn } from '../lib/api';

/** Live floor plan drawn from table geometry. Tap a table to seat or manage it. */
export function FloorPlan({ tables, timezone, selectedId, suggested, onPress }: {
  tables: any[]; timezone: string; selectedId?: string; suggested: string[]; onPress: (t: any) => void;
}) {
  const w = Math.max(560, ...tables.map((t) => t.x + t.width + 30));
  const h = Math.max(380, ...tables.map((t) => t.y + t.height + 30));
  return (
    <Svg width="100%" height="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMin meet">
      {tables.map((t) => {
        const soon = t.status === 'AVAILABLE' && t.next && new Date(t.next.startsAt).getTime() - Date.now() < 45 * 60000;
        const fill = soon ? STATUS_FILL.RESERVED : STATUS_FILL[t.status] ?? '#fff';
        const sug = suggested.includes(t.id);
        const stroke = sug ? C.brand : selectedId === t.id ? C.dark : "#B9C2D3";
        const sw = sug || selectedId === t.id ? 3 : 1.5;
        const cx = t.x + t.width / 2, cy = t.y + t.height / 2;
        const mins = t.current?.seatedAt ? Math.round((Date.now() - new Date(t.current.seatedAt).getTime()) / 60000) : null;
        return (
          <G key={t.id} onPress={() => onPress(t)}>
            {t.shape === 'round'
              ? <Ellipse cx={cx} cy={cy} rx={t.width / 2} ry={t.height / 2} fill={fill} stroke={stroke} strokeWidth={sw} />
              : <Rect x={t.x} y={t.y} width={t.width} height={t.height} rx={10} fill={fill} stroke={stroke} strokeWidth={sw} />}
            <SvgText x={cx} y={cy - 6} textAnchor="middle" fontSize={16} fontFamily="Nunito_800ExtraBold" fill={C.ink}>{t.name}</SvgText>
            <SvgText x={cx} y={cy + 10} textAnchor="middle" fontSize={10} fontFamily="Nunito_700Bold" fill="#5B6478">
              {t.current ? `${t.current.guestName.split(' ')[0]} · ${t.current.partySize}` : `${t.minCovers}–${t.maxCovers}`}
            </SvgText>
            {mins != null && <SvgText x={cx} y={cy + 23} textAnchor="middle" fontSize={10} fontFamily="Nunito_700Bold" fill={C.info}>{mins}m · {label(t.status)}</SvgText>}
            {!t.current && t.next && <SvgText x={cx} y={cy + 23} textAnchor="middle" fontSize={10} fontFamily="Nunito_700Bold" fill={C.brand}>next {timeIn(t.next.startsAt, timezone)}</SvgText>}
          </G>
        );
      })}
    </Svg>
  );
}
