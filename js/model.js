// Navigation math: cross/along components, draft averaging, crab angles, wind leeway.
// Sign convention everywhere: positive cross = toward the ship's STARBOARD side of the course.

const DEG = Math.PI / 180;
const KN = 0.514444;           // m/s per knot
const FT = 0.3048;             // m per foot
const RHO_A = 1.25;            // kg/m³ air (PIANC 2014 uses 1.25)
const RHO_W = 1025;            // kg/m³ sea water

export const norm360 = d => ((d % 360) + 360) % 360;
export const wrap180 = d => ((d + 540) % 360) - 180;

/** Nearest compass point (16-point). */
export function compass16(deg) {
  const pts = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
  return pts[Math.round(norm360(deg) / 22.5) % 16];
}
/** Nearest cardinal (4-point) – used for "setting N / S" style labels. */
export function cardinal4(deg) {
  return ['N','E','S','W'][Math.round(norm360(deg) / 90) % 4];
}

/** Decompose a current (set = direction TOWARD, drift kn) onto a course. */
export function crossAlong(setDeg, driftKn, courseDeg) {
  const rel = (setDeg - courseDeg) * DEG;
  return {
    cross: driftKn * Math.sin(rel),   // + to starboard of course
    along: driftKn * Math.cos(rel),   // + flowing in the course direction (with the ship)
  };
}

/** Human label of the side a positive/negative cross value pushes toward, as a compass cardinal. */
export function crossCardinal(cross, courseDeg) {
  if (Math.abs(cross) < 0.005) return '—';
  const dir = cross >= 0 ? courseDeg + 90 : courseDeg - 90;
  return cardinal4(dir);
}
export function crossSide(cross) {
  if (Math.abs(cross) < 0.005) return 'neither side';
  return cross >= 0 ? 'starboard' : 'port';
}

/** Vector-average a set of {s, d} bins (speed kn, direction deg). Returns {speed, dir}. */
export function vectorAverage(items) {
  const valid = items.filter(b => Number.isFinite(b.s) && Number.isFinite(b.d));
  if (!valid.length) return null;
  let u = 0, v = 0;
  for (const b of valid) { u += b.s * Math.sin(b.d * DEG); v += b.s * Math.cos(b.d * DEG); }
  u /= valid.length; v /= valid.length;
  return { speed: Math.hypot(u, v), dir: norm360(Math.atan2(u, v) / DEG), n: valid.length };
}

/** Crab angle (deg, signed: + means steer to STARBOARD) needed to cancel a cross current. */
export function crabForCross(crossKn, speedKn) {
  if (!(speedKn > 0)) return 0;
  const r = Math.max(-1, Math.min(1, crossKn / speedKn));
  // Current setting to starboard → steer to port (negative heading change).
  return -Math.asin(r) / DEG;
}

export function statusFor(crossMax, caution, limit) {
  const v = Math.abs(crossMax);
  if (!Number.isFinite(v)) return { id: 'nodata', label: 'NO DATA' };
  if (v >= limit) return { id: 'limit', label: 'OVER LIMIT' };
  if (v >= caution) return { id: 'caution', label: 'CAUTION' };
  return { id: 'normal', label: 'NORMAL' };
}

// ---------------------------------------------------------------------------
// Wind leeway model
// ---------------------------------------------------------------------------
// Steady-state balance underway: lateral wind force (Blendermann 1994 coefficients) is
// resisted by the hull's hydrodynamic sway force at a drift (leeway) angle β:
//   Y_wind = ½ ρa · CY(γ) · A_L · W_app²
//   Y_hull = ½ ρw · Lpp · T · V² · [ K · Y'v · β + K · CD · β² ]
// with Clarke (1983) linear sway derivative Y'v = π (T/L)(1 + 0.4 Cb B/T) (per L·T),
// a crossflow drag CD ≈ 0.8 (IALA IWRAP drift model), and Clarke's deep→shallow water
// multiplier K(h/T, B/T) = K0 + K1 (B/T) + K2 (B/T)², F = h/T − 1:
//   K0 = 1 + 0.0775/F² − 0.0110/F³ + 0.000068/F⁵
//   K1 = −0.0643/F + 0.0724/F² − 0.0113/F³ + 0.0000767/F⁵
//   K2 = 0.0342/F   (valid for h/T ≳ 1.2–1.25; clamped here)
// Applying K to the quadratic term as well is a simplification flagged as an assumption.

export function clarkeShallowFactor(hOverT, bOverT) {
  const F = Math.max(hOverT, 1.25) - 1;
  const K0 = 1 + 0.0775 / F ** 2 - 0.0110 / F ** 3 + 0.000068 / F ** 5;
  const K1 = -0.0643 / F + 0.0724 / F ** 2 - 0.0113 / F ** 3 + 0.0000767 / F ** 5;
  const K2 = 0.0342 / F;
  return Math.max(1, K0 + K1 * bOverT + K2 * bOverT * bOverT);
}

/** Blendermann lateral wind-force coefficient for apparent wind angle gamma (deg from bow, 0 = ahead). */
export function blendermannCY(aero, gammaDeg, af, al) {
  const g = Math.abs(wrap180(gammaDeg)) * DEG;        // 0..π
  const CDlAF = g <= Math.PI / 2 ? aero.CDlBow : aero.CDlStern;
  const CDl = CDlAF * (af / al);
  const den = 1 - 0.5 * aero.delta * (1 - CDl / aero.CDt) * Math.sin(2 * g) ** 2;
  return aero.CDt * Math.sin(g) / den;
}

/**
 * Apparent wind from true wind (FROM direction, kn) and ship course/speed (kn).
 * Returns speed (kn) and the relative angle gamma (deg from bow, + = wind from starboard side).
 */
export function apparentWind(windFromDeg, windKn, courseDeg, speedKn) {
  // Wind velocity vector points TOWARD windFrom+180.
  const toward = (windFromDeg + 180) * DEG;
  const wx = windKn * Math.sin(toward), wy = windKn * Math.cos(toward);
  const sx = speedKn * Math.sin(courseDeg * DEG), sy = speedKn * Math.cos(courseDeg * DEG);
  const ax = wx - sx, ay = wy - sy;                    // apparent wind velocity (toward)
  const speed = Math.hypot(ax, ay);
  const towardDeg = norm360(Math.atan2(ax, ay) / DEG);
  const fromDeg = norm360(towardDeg + 180);
  const gamma = wrap180(fromDeg - courseDeg);         // + → wind comes from starboard
  return { speed, fromDeg, gamma };
}

/**
 * Leeway estimate.
 * @param {object} o
 *  windFromDeg, windKn, gustKn, courseDeg, speedKn,
 *  ship {lpp, beam, cb, al, af, aero}, draftFt, depthFt, gain (multiplier on wind speed, default 1)
 */
export function windLeeway(o) {
  const ship = o.ship;
  if (!ship || !(o.windKn >= 0)) return null;
  const gain = o.gain ?? 1;
  const T = Math.max(1, (o.draftFt || 30) * FT);
  const h = Math.max(T * 1.25, (o.depthFt || 100) * FT);
  const L = ship.lpp, B = ship.beam;
  const V = Math.max(0, o.speedKn) * KN;
  const K = clarkeShallowFactor(h / T, B / T);
  const Yv = Math.PI * (T / L) * (1 + 0.4 * ship.cb * B / T);
  const CD = 0.8;

  // Cross & along components of the TRUE wind over the ground, relative to course.
  const towardRel = (o.windFromDeg + 180 - o.courseDeg) * DEG;
  const crossWind = o.windKn * gain * Math.sin(towardRel);   // + pushes toward starboard
  const alongWind = o.windKn * gain * Math.cos(towardRel);   // + blowing with the ship (from astern)

  function solve(windKn) {
    const app = apparentWind(o.windFromDeg, windKn * gain, o.courseDeg, o.speedKn);
    const Wa = app.speed * KN;
    const CY = blendermannCY(ship.aero, app.gamma, ship.af, ship.al);
    const Ywind = 0.5 * RHO_A * CY * ship.al * Wa * Wa;        // N, magnitude
    const pushToStarboard = app.gamma < 0;                       // wind from port → pushed to starboard
    if (V < 0.5 * KN) {
      return { betaDeg: NaN, app, CY, Ywind, pushToStarboard, leewayKn: NaN };
    }
    const q = 0.5 * RHO_W * L * T * V * V;                        // N
    const a = K * CD, b = K * Yv, c = Ywind / q;
    const beta = (-b + Math.sqrt(b * b + 4 * a * c)) / (2 * a);  // rad, ≥ 0
    const betaDeg = beta / DEG * (pushToStarboard ? 1 : -1);     // signed: + leeway toward starboard
    return { betaDeg, app, CY, Ywind, pushToStarboard, leewayKn: o.speedKn * Math.sin(beta) * (pushToStarboard ? 1 : -1) };
  }

  const steady = solve(o.windKn);
  const gust = o.gustKn > o.windKn ? solve(o.gustKn) : steady;

  // Stopped-ship equilibrium drift (Richardson 1997): v = W·sqrt((ρa/ρw)(Cda·Aa)/(Cdw·Aw)).
  const Aw = L * T;
  const stoppedFrac = Math.sqrt((RHO_A / RHO_W) * (ship.aero.CDt * ship.al) / (CD * K * Aw));
  const stoppedDriftKn = o.windKn * gain * stoppedFrac;

  return {
    steady, gust, crossWind, alongWind,
    pushToStarboard: steady.pushToStarboard,
    // Heading correction (deg, signed + = steer to starboard) to hold the course against leeway:
    headingCorr: Number.isFinite(steady.betaDeg) ? -steady.betaDeg : NaN,
    headingCorrGust: Number.isFinite(gust.betaDeg) ? -gust.betaDeg : NaN,
    stoppedDriftKn, shallowFactor: K, hOverT: h / T, Yv, lowSpeed: V < 0.5 * KN,
  };
}

/** Combine current crab + wind correction into headings. */
export function headingsToSteer({ courseDeg, crossKn, speedKn, wind }) {
  const crab = crabForCross(crossKn, speedKn);      // + starboard
  const hdgCurrent = norm360(courseDeg + crab);
  let hdgWind = null, hdgWindGust = null;
  if (wind && Number.isFinite(wind.headingCorr)) {
    hdgWind = norm360(courseDeg + crab + wind.headingCorr);
    hdgWindGust = norm360(courseDeg + crab + wind.headingCorrGust);
  }
  return { crab, hdgCurrent, hdgWind, hdgWindGust };
}

export const ftToM = ft => ft * FT;
export const mToFt = m => m / FT;
