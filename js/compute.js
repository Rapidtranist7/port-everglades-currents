// Derived quantities for a buoy / the wind, computed from raw data + settings.
import * as M from './model.js';
import { resolveShip, QUICK_CLASSES } from './ships.js';

export function effectiveCourse(settings) {
  return settings.direction === 'outbound' ? M.norm360(settings.course + 180) : settings.course;
}
export function speedFor(settings, buoyKey) {
  return buoyKey === 'sea' ? settings.speedSea : settings.speedB2;
}
export function depthFor(settings, buoyKey) {
  return buoyKey === 'sea' ? settings.depthSea : settings.depthB2;
}

/** Active ship for the wind model, or null when windage is OFF. */
export function activeShip(settings) {
  if (!settings.ship || settings.ship === 'off') return null;
  const quick = QUICK_CLASSES.find(q => q.id === settings.ship);
  if (quick) return resolveShip(quick.presetId, quick.condition, settings.custom);
  return resolveShip(settings.ship, settings.condition, settings.custom);
}

/** Latest wind sample + derived text. */
export function windNow(windSeries) {
  if (!windSeries || !windSeries.length) return null;
  const w = windSeries[windSeries.length - 1];
  return { t: w.t, kn: w.s, dir: w.d, gust: Number.isFinite(w.g) ? w.g : w.s, card: M.compass16(w.d) };
}

/**
 * Compute everything the UI needs for one buoy.
 * buoy: station descriptor; d: { bins:[{num, depthFt}], latest: {num → {t,s,d}}, rt24:[...] }
 */
export function buoyState(buoy, d, settings, wind) {
  const course = effectiveCourse(settings);
  const speed = speedFor(settings, buoy.key);
  const draft = settings.draftFt;
  const out = { buoy, course, speed, draft, ok: false };
  if (!d || !d.bins || !d.bins.length) return out;

  const rt = d.latest[buoy.rtBin];
  const profile = d.bins.map(b => {
    const s = d.latest[b.num];
    if (!s) return { ...b, s: NaN, d: NaN, t: null, cross: NaN, along: NaN, inDraft: b.depthFt <= draft + 0.5 };
    const ca = M.crossAlong(s.d, s.s, course);
    return { ...b, s: s.s, d: s.d, t: s.t, cross: ca.cross, along: ca.along, inDraft: b.depthFt <= draft + 0.5 };
  });
  const inDraft = profile.filter(p => p.inDraft && Number.isFinite(p.s));
  const avg = M.vectorAverage(inDraft);
  out.profile = profile;
  out.rt = rt ? { ...rt, depthFt: (d.bins.find(b => b.num === buoy.rtBin) || {}).depthFt, ...M.crossAlong(rt.d, rt.s, course) } : null;
  out.avg = avg ? { ...avg, ...M.crossAlong(avg.dir, avg.speed, course), n: avg.n } : null;
  if (!out.rt && !out.avg) return out;
  out.ok = true;

  const crossRT = out.rt ? out.rt.cross : NaN;
  const crossAvg = out.avg ? out.avg.cross : crossRT;
  out.crossMax = [crossRT, crossAvg].filter(Number.isFinite).reduce((a, b) => Math.abs(b) > Math.abs(a) ? b : a, 0);
  out.status = M.statusFor(out.crossMax, settings.caution, settings.limit);
  out.headlineCross = out.crossMax; // larger of the 14 ft bin and the draft average, same value that drives status
  out.headlineCard = M.crossCardinal(out.headlineCross, course);

  // Heading from the draft-averaged cross current (falls back to RT).
  const crossUsed = Number.isFinite(crossAvg) ? crossAvg : crossRT;
  out.crossUsed = crossUsed;
  out.crossUsedCard = M.crossCardinal(crossUsed, course);
  out.alongUsed = out.avg ? out.avg.along : (out.rt ? out.rt.along : NaN);

  const ship = activeShip(settings);
  out.ship = ship;
  out.wind = null;
  if (wind) {
    const wrel = M.crossAlong(wind.dir + 180, wind.kn, course); // treat wind "toward" like a set
    out.windCross = wrel.cross; out.windAlong = wrel.along;
    if (ship) {
      out.wind = M.windLeeway({
        windFromDeg: wind.dir, windKn: wind.kn, gustKn: wind.gust, courseDeg: course, speedKn: speed,
        ship, draftFt: draft, depthFt: depthFor(settings, buoy.key), gain: settings.windGain,
      });
    }
  }
  out.headings = M.headingsToSteer({ courseDeg: course, crossKn: crossUsed, speedKn: speed, wind: out.wind });
  out.headingsRT = M.headingsToSteer({ courseDeg: course, crossKn: crossRT, speedKn: speed, wind: null });
  out.otherSpeeds = [10, 12, 14].map(v => {
    let w = null;
    if (ship && wind) w = M.windLeeway({ windFromDeg: wind.dir, windKn: wind.kn, gustKn: wind.gust, courseDeg: course, speedKn: v, ship, draftFt: draft, depthFt: depthFor(settings, buoy.key), gain: settings.windGain });
    return { speed: v, ...M.headingsToSteer({ courseDeg: course, crossKn: crossUsed, speedKn: v, wind: w }) };
  });
  return out;
}

/** Series of cross/along/drift for a buoy's RT-bin history. */
export function historySeries(pts, course, metric) {
  return (pts || []).map(p => {
    const ca = M.crossAlong(p.d, p.s, course);
    return { t: p.t, v: metric === 'cross' ? ca.cross : metric === 'along' ? ca.along : p.s };
  });
}

export function historyStats(pts, course, caution) {
  const rows = (pts || []).map(p => ({ t: p.t, ...M.crossAlong(p.d, p.s, course), s: p.s }));
  if (!rows.length) return null;
  const over = rows.filter(r => Math.abs(r.cross) >= caution).length;
  const strongest = rows.reduce((a, b) => Math.abs(b.cross) > Math.abs(a.cross) ? b : a, rows[0]);
  return { n: rows.length, pctOver: (100 * over) / rows.length, strongest };
}

/** Interpolate a {t,v} series at time ms. */
export function interp(series, ms) {
  if (!series || !series.length) return NaN;
  let lo = 0, hi = series.length - 1;
  if (ms <= series[0].t.getTime()) return series[0].v;
  if (ms >= series[hi].t.getTime()) return series[hi].v;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (series[mid].t.getTime() <= ms) lo = mid; else hi = mid; }
  const a = series[lo], b = series[hi];
  const f = (ms - a.t.getTime()) / (b.t.getTime() - a.t.getTime());
  return a.v + f * (b.v - a.v);
}
