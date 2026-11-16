/**
 * Timezone helpers. Restaurants configure shifts in local wall-clock time;
 * everything is stored in UTC. Uses Intl only (no tz library needed).
 */
function tzOffsetMinutes(utc: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p = Object.fromEntries(dtf.formatToParts(utc).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return Math.round((asUtc - utc.getTime()) / 60000);
}

/** Local date ("2026-11-20") + local time ("19:30") in `timeZone` → UTC Date. */
export function localToUtc(date: string, time: string, timeZone: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  let off = tzOffsetMinutes(new Date(guess), timeZone);
  let utc = guess - off * 60000;
  const off2 = tzOffsetMinutes(new Date(utc), timeZone);
  if (off2 !== off) utc = guess - off2 * 60000;
  return new Date(utc);
}

/** UTC Date → { date: "YYYY-MM-DD", time: "HH:mm", dow: 0..6 } in `timeZone`. */
export function utcToLocal(d: Date, timeZone: string) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', weekday: 'short',
  });
  const p = Object.fromEntries(dtf.formatToParts(d).map((x) => [x.type, x.value]));
  const dows = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}`, dow: dows.indexOf(p.weekday) };
}

export function dayOfWeek(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

export function minutesToTime(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

export const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
export const isTime = (s: string) => /^\d{2}:\d{2}$/.test(s);
