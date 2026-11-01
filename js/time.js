// Port-local time helpers. All NOAA data is fetched in GMT and displayed in the port's zone,
// so the app reads the same on a phone in Fort Lauderdale, a laptop elsewhere, or a test machine.
export const PORT_TZ = 'America/New_York';
const pad = n => String(n).padStart(2, '0');
const fmt = new Intl.DateTimeFormat('en-US', { timeZone: PORT_TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

/** Calendar parts of an instant in port time. */
export function portParts(d) {
  const p = {}; for (const x of fmt.formatToParts(d)) if (x.type !== 'literal') p[x.type] = +x.value;
  return { y: p.year, m: p.month, d: p.day, h: p.hour % 24, min: p.minute };
}
export const hhmm = d => { if (!d) return '—'; const p = portParts(d); return `${pad(p.h)}:${pad(p.min)}`; };
export const portHour = d => portParts(d).h;
export const portDayKey = d => { const p = portParts(d); return `${p.y}-${pad(p.m)}-${pad(p.d)}`; };
export function portMonthDay(d) { return new Intl.DateTimeFormat('en-US', { timeZone: PORT_TZ, month: 'short', day: 'numeric' }).format(d); }
export function zone() {
  try { return new Intl.DateTimeFormat('en-US', { timeZone: PORT_TZ, timeZoneName: 'short' }).formatToParts(new Date()).find(p => p.type === 'timeZoneName').value; } catch { return 'ET'; }
}
/** Instant for a port-local wall-clock time (handles DST by two-step offset correction). */
export function portDate(y, m, d, h = 0, min = 0) {
  let guess = Date.UTC(y, m - 1, d, h, min);
  for (let i = 0; i < 2; i++) {
    const p = portParts(new Date(guess));
    const asUTC = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min);
    guess += Date.UTC(y, m - 1, d, h, min) - asUTC;
  }
  return new Date(guess);
}
/** Port-local midnight of the day containing d, shifted by `days`. */
export function portMidnight(d, days = 0) {
  const p = portParts(d);
  return portDate(p.y, p.m, p.d + days, 0, 0);
}
/** Next port-local whole hour at or after d that is a multiple of stepH (0,6,12,18 for stepH 6). */
export function portCeilHour(d, stepH) {
  const p = portParts(d);
  const hrs = p.h + p.min / 60;
  return portDate(p.y, p.m, p.d, Math.ceil(hrs / stepH) * stepH, 0); // hour 24 rolls into the next day
}
