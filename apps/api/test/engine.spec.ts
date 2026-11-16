import { assignTables, computeSlots, EngineConfig, Occupancy } from '../src/availability/engine';
import { localToUtc } from '../src/common/time';

const T = (id: string, min: number, max: number, extra: Partial<any> = {}) => ({
  id, name: id, minCovers: min, maxCovers: max, tableType: 'DINING_ROOM', combinableWith: [], onlineBookable: true, status: 'AVAILABLE', ...extra,
});
const cfg = (over: Partial<EngineConfig> = {}): EngineConfig => ({
  timezone: 'America/New_York', onlineBookingEnabled: true, bookingWindowDays: 30, maxPartyOnline: 8,
  tables: [T('a', 1, 2), T('b', 2, 4, { combinableWith: ['c'] }), T('c', 2, 4, { combinableWith: ['b'] })],
  shifts: [{ id: 's', name: 'Dinner', daysOfWeek: [0, 1, 2, 3, 4, 5, 6], startTime: '18:00', endTime: '20:00', slotInterval: 30, maxCoversPerSlot: 10, maxPartiesPerSlot: null, onlineEnabled: true }],
  turnTimes: [], closedDates: [], ...over,
});
const DATE = '2030-06-14';
const NOW = new Date('2030-06-01T12:00:00Z');

describe('availability engine', () => {
  it('generates slots per interval in local time and converts to UTC', () => {
    const slots = computeSlots(cfg(), [], { date: DATE, partySize: 2, online: true, now: NOW });
    expect(slots.map((s) => s.time)).toEqual(['18:00', '18:30', '19:00', '19:30', '20:00']);
    expect(slots[0].startsAt).toBe(localToUtc(DATE, '18:00', 'America/New_York').toISOString());
    expect(slots[0].startsAt).toBe('2030-06-14T22:00:00.000Z'); // EDT = UTC-4
  });

  it('picks the smallest fitting table (best fit)', () => {
    const [s] = computeSlots(cfg(), [], { date: DATE, partySize: 2, online: true, now: NOW, fromTime: '19:00', toTime: '19:00' });
    expect(s.tableIds).toEqual(['a']);
  });

  it('combines tables when no single table fits', () => {
    expect(assignTables(cfg().tables, new Set(), 7, { online: true })).toEqual(['b', 'c']);
    expect(assignTables(cfg().tables, new Set(['c']), 7, { online: true })).toBeNull();
  });

  it('blocks tables occupied over the turn window', () => {
    const start = localToUtc(DATE, '18:00', 'America/New_York');
    const occ: Occupancy[] = [{ startsAt: start, endsAt: new Date(start.getTime() + 90 * 60000), tableIds: ['a', 'b', 'c'], partySize: 2, countsForPacing: true }];
    const slots = computeSlots(cfg(), occ, { date: DATE, partySize: 2, online: true, now: NOW });
    expect(slots.find((s) => s.time === '18:30')!.available).toBe(false);
    expect(slots.find((s) => s.time === '19:30')!.available).toBe(true); // 18:00 + 90 min
  });

  it('applies cover AND party pacing caps', () => {
    const start = localToUtc(DATE, '19:00', 'America/New_York');
    const occ: Occupancy[] = [{ startsAt: start, endsAt: start, tableIds: [], partySize: 9, countsForPacing: true }];
    const c = cfg();
    expect(computeSlots(c, occ, { date: DATE, partySize: 2, online: true, now: NOW, fromTime: '19:00', toTime: '19:00' })[0].reason).toBe('PACING');
    c.shifts[0].maxCoversPerSlot = null; c.shifts[0].maxPartiesPerSlot = 1;
    expect(computeSlots(c, occ, { date: DATE, partySize: 2, online: true, now: NOW, fromTime: '19:00', toTime: '19:00' })[0].reason).toBe('PACING');
  });

  it('respects closures, online switch, table types and past times', () => {
    expect(computeSlots(cfg({ closedDates: [DATE] }), [], { date: DATE, partySize: 2, online: true, now: NOW })).toEqual([]);
    expect(computeSlots(cfg({ onlineBookingEnabled: false }), [], { date: DATE, partySize: 2, online: true, now: NOW })[0].reason).toBe('OFFLINE');
    expect(computeSlots(cfg({ onlineBookingEnabled: false }), [], { date: DATE, partySize: 2, online: false, now: NOW })[0].available).toBe(true);
    expect(computeSlots(cfg(), [], { date: DATE, partySize: 2, online: true, now: NOW, tableType: 'PATIO' })[0].reason).toBe('NO_TABLE');
    expect(computeSlots(cfg(), [], { date: DATE, partySize: 2, online: true, now: new Date('2030-06-15T00:00:00Z') })[0].reason).toBe('PAST');
  });
});
