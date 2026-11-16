/**
 * Availability engine (spec BKG-01, CFG-01..06).
 *
 * Pure and deterministic: given a restaurant's configuration and what is already
 * occupied (reservations + live holds), compute bookable slots for a date and party.
 * The booking service calls the same function inside a per-restaurant/day lock,
 * so what search shows and what commit checks can never disagree.
 */
import { dayOfWeek, localToUtc, minutesToTime, timeToMinutes } from '../common/time';

export interface EngineTable {
  id: string; name: string; minCovers: number; maxCovers: number; tableType: string;
  combinableWith: string[]; onlineBookable: boolean; status: string;
}
export interface EngineShift {
  id: string; name: string; daysOfWeek: number[]; startTime: string; endTime: string; slotInterval: number;
  maxCoversPerSlot: number | null; maxPartiesPerSlot: number | null; onlineEnabled: boolean;
}
export interface EngineTurnTime { minParty: number; maxParty: number; minutes: number }
export interface Occupancy { startsAt: Date; endsAt: Date; tableIds: string[]; partySize: number; countsForPacing: boolean }

export interface EngineConfig {
  timezone: string;
  onlineBookingEnabled: boolean;
  bookingWindowDays: number;
  maxPartyOnline: number;
  tables: EngineTable[];
  shifts: EngineShift[];
  turnTimes: EngineTurnTime[];
  closedDates: string[];
}

export interface SlotQuery {
  date: string;              // local YYYY-MM-DD
  partySize: number;
  tableType?: string | null; // restrict to a seating area
  online: boolean;           // diner/partner channel (true) vs staff (false)
  now: Date;
  fromTime?: string;         // optional local window
  toTime?: string;
  leadMinutes?: number;      // earliest bookable offset from now (online only)
}

export interface Slot {
  time: string;              // local HH:mm
  startsAt: string;          // ISO UTC
  endsAt: string;
  shiftId: string;
  shiftName: string;
  available: boolean;
  tableIds: string[];        // suggested assignment when available
  tableTypes: string[];      // seating areas that can take this party at this time
  reason?: 'PAST' | 'PACING' | 'NO_TABLE' | 'OFFLINE';
}

export const DEFAULT_TURN = (party: number) => (party <= 2 ? 90 : party <= 4 ? 105 : party <= 6 ? 120 : 150);

export function turnMinutes(turnTimes: EngineTurnTime[], party: number): number {
  const t = turnTimes.find((x) => party >= x.minParty && party <= x.maxParty);
  return t ? t.minutes : DEFAULT_TURN(party);
}

const overlaps = (aS: number, aE: number, bS: number, bE: number) => aS < bE && bS < aE;

/** Tables free over [start, end) given occupancies. */
function busyTableIds(occ: Occupancy[], start: number, end: number): Set<string> {
  const busy = new Set<string>();
  for (const o of occ) {
    if (overlaps(start, end, o.startsAt.getTime(), o.endsAt.getTime())) o.tableIds.forEach((t) => busy.add(t));
  }
  return busy;
}

/**
 * Best-fit table assignment: the smallest single table that fits, else the smallest
 * combinable pair. Leaves bigger tables free for bigger parties later in the night.
 */
export function assignTables(
  tables: EngineTable[], busy: Set<string>, party: number, opts: { online: boolean; tableType?: string | null },
): string[] | null {
  const usable = tables.filter((t) =>
    !busy.has(t.id) && t.status !== 'OUT_OF_SERVICE' && (!opts.online || t.onlineBookable) &&
    (!opts.tableType || t.tableType === opts.tableType));

  const singles = usable.filter((t) => party >= t.minCovers && party <= t.maxCovers)
    .sort((a, b) => a.maxCovers - b.maxCovers || a.name.localeCompare(b.name));
  if (singles.length) return [singles[0].id];

  const byId = new Map(usable.map((t) => [t.id, t]));
  let best: { ids: string[]; cap: number } | null = null;
  for (const a of usable) {
    for (const bid of a.combinableWith) {
      const b = byId.get(bid);
      if (!b || b.id <= a.id) continue; // each pair once; both must be usable
      const cap = a.maxCovers + b.maxCovers;
      const min = Math.max(a.minCovers, b.minCovers);
      if (party <= cap && party >= min && (!best || cap < best.cap)) best = { ids: [a.id, b.id], cap };
    }
  }
  return best ? best.ids : null;
}

export function computeSlots(cfg: EngineConfig, occ: Occupancy[], q: SlotQuery): Slot[] {
  if (cfg.closedDates.includes(q.date)) return [];
  const dow = dayOfWeek(q.date);
  const turn = turnMinutes(cfg.turnTimes, q.partySize);
  const lead = (q.online ? q.leadMinutes ?? 15 : 0) * 60000;
  const slots: Slot[] = [];

  for (const shift of cfg.shifts) {
    if (!shift.daysOfWeek.includes(dow)) continue;
    const startMin = timeToMinutes(shift.startTime);
    const endMin = timeToMinutes(shift.endTime);
    for (let m = startMin; m <= endMin; m += shift.slotInterval) {
      const time = minutesToTime(m);
      if (q.fromTime && time < q.fromTime) continue;
      if (q.toTime && time > q.toTime) continue;
      const start = localToUtc(q.date, time, cfg.timezone);
      const end = new Date(start.getTime() + turn * 60000);
      const base = { time, startsAt: start.toISOString(), endsAt: end.toISOString(), shiftId: shift.id, shiftName: shift.name };

      if (start.getTime() < q.now.getTime() + lead) { slots.push({ ...base, available: false, tableIds: [], tableTypes: [], reason: 'PAST' }); continue; }
      if (q.online && (!cfg.onlineBookingEnabled || !shift.onlineEnabled)) {
        slots.push({ ...base, available: false, tableIds: [], tableTypes: [], reason: 'OFFLINE' }); continue;
      }

      // Pacing (CFG-02): covers AND parties starting in this slot, whichever cap is hit first.
      const sameSlot = occ.filter((o) => o.countsForPacing && o.startsAt.getTime() === start.getTime());
      const covers = sameSlot.reduce((s, o) => s + o.partySize, 0);
      if ((shift.maxCoversPerSlot != null && covers + q.partySize > shift.maxCoversPerSlot) ||
          (shift.maxPartiesPerSlot != null && sameSlot.length + 1 > shift.maxPartiesPerSlot)) {
        slots.push({ ...base, available: false, tableIds: [], tableTypes: [], reason: 'PACING' }); continue;
      }

      const busy = busyTableIds(occ, start.getTime(), end.getTime());
      const assigned = assignTables(cfg.tables, busy, q.partySize, { online: q.online, tableType: q.tableType });
      const types = [...new Set(cfg.tables.map((t) => t.tableType))].filter((tt) =>
        assignTables(cfg.tables, busy, q.partySize, { online: q.online, tableType: tt }) !== null);
      slots.push(assigned
        ? { ...base, available: true, tableIds: assigned, tableTypes: types }
        : { ...base, available: false, tableIds: [], tableTypes: [], reason: 'NO_TABLE' });
    }
  }
  return slots.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}
