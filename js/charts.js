// Lightweight canvas charts + SVG compass helpers. No external libraries.

const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const COLORS = () => ({
  text: css('--color-text'), muted: css('--color-muted'), grid: css('--color-grid'),
  blue: css('--color-blue'), orange: css('--color-orange'), primary: css('--color-primary'),
  amber: css('--color-amber'), red: css('--color-red'), green: css('--color-green'), card: css('--color-card'),
  text2: css('--color-text-2'),
});
const FONT = '600 11px "Barlow Condensed", sans-serif';
const FONT_BODY = '500 12px Barlow, sans-serif';

function setup(canvas) {
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(200, Math.round(rect.width)), h = Math.max(80, Math.round(rect.height));
  if (canvas.width !== w * dpr || canvas.height !== h * dpr) { canvas.width = w * dpr; canvas.height = h * dpr; }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return { ctx, w, h };
}

import { hhmm, portCeilHour, portMidnight, portMonthDay, PORT_TZ } from './time.js';
const dayLbl = d => new Intl.DateTimeFormat('en-US', { timeZone: PORT_TZ, weekday: 'short', month: 'short', day: 'numeric' }).format(d);

function timeTicks(t0, t1, w) {
  const span = t1 - t0, hours = span / 36e5;
  let stepH = hours <= 26 ? 3 : hours <= 80 ? 12 : hours <= 200 ? 24 : 120;
  if (w < 360 && stepH === 3) stepH = 6;
  const ticks = [];
  // Ticks sit on port-local hour marks (00/06/12/18 ET etc.), DST-safe because each step re-derives the wall clock.
  let d = stepH >= 24 ? portMidnight(new Date(t0), 0) : portCeilHour(new Date(t0), stepH);
  if (d.getTime() < t0) d = stepH >= 24 ? portMidnight(d, 1) : portCeilHour(new Date(d.getTime() + 60e3), stepH);
  for (let i = 0; i < 200 && d.getTime() <= t1; i++) {
    ticks.push(d.getTime());
    d = stepH >= 24 ? portMidnight(d, stepH / 24) : portCeilHour(new Date(d.getTime() + 60e3), stepH);
  }
  return { ticks, stepH };
}

/**
 * Time-series line chart with optional ±bands.
 * opts: { series:[{pts:[{t:Date,v}], color}], t0, t1, yMin, yMax, bands:{caution, limit}, zeroLabels:[top,bottom],
 *         unit, now, scrub (ms or null), onScrub(ms) }
 */
export function lineChart(canvas, o) {
  const { ctx, w, h } = setup(canvas);
  const C = COLORS();
  const padL = 34, padR = 10, padT = 18, padB = 22;
  const x = t => padL + ((t - o.t0) / (o.t1 - o.t0)) * (w - padL - padR);
  const y = v => padT + (1 - (v - o.yMin) / (o.yMax - o.yMin)) * (h - padT - padB);
  const plotW = w - padL - padR;

  // bands
  if (o.bands) {
    const { caution, limit } = o.bands;
    ctx.fillStyle = 'rgba(251,191,36,0.10)';
    if (o.yMax > caution) ctx.fillRect(padL, y(Math.min(o.yMax, limit)), plotW, y(caution) - y(Math.min(o.yMax, limit)));
    if (o.yMin < -caution) ctx.fillRect(padL, y(-caution), plotW, y(Math.max(o.yMin, -limit)) - y(-caution));
    ctx.fillStyle = 'rgba(248,113,113,0.12)';
    if (o.yMax > limit) ctx.fillRect(padL, y(o.yMax), plotW, y(limit) - y(o.yMax));
    if (o.yMin < -limit) ctx.fillRect(padL, y(-limit), plotW, y(o.yMin) - y(-limit));
    ctx.strokeStyle = 'rgba(251,191,36,0.55)'; ctx.setLineDash([4, 4]); ctx.lineWidth = 1;
    for (const v of [caution, -caution]) if (v < o.yMax && v > o.yMin) { ctx.beginPath(); ctx.moveTo(padL, y(v)); ctx.lineTo(w - padR, y(v)); ctx.stroke(); }
    ctx.setLineDash([]);
    ctx.fillStyle = C.amber; ctx.font = FONT; ctx.textAlign = 'right';
    if (caution < o.yMax) ctx.fillText(`CAUTION ${caution.toFixed(0)} KN`, w - padR - 2, y(caution) - 3);
  }
  // grid + y labels
  ctx.font = FONT; ctx.fillStyle = C.muted; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  const ystep = o.yStep || ((o.yMax - o.yMin) > 3 ? 1 : 0.5);
  for (let v = Math.ceil(o.yMin / ystep) * ystep; v <= o.yMax + 1e-9; v += ystep) {
    ctx.strokeStyle = Math.abs(v) < 1e-9 ? C.text2 : C.grid; ctx.lineWidth = Math.abs(v) < 1e-9 ? 1 : 1;
    ctx.beginPath(); ctx.moveTo(padL, y(v)); ctx.lineTo(w - padR, y(v)); ctx.stroke();
    ctx.fillText(Math.abs(v) < 1e-9 ? '0' : v.toFixed(ystep < 1 ? 1 : 0), padL - 6, y(v));
  }
  // zero labels (SETTING N / S)
  if (o.zeroLabels) {
    ctx.textAlign = 'left'; ctx.fillStyle = C.muted;
    ctx.fillText(o.zeroLabels[0], padL + 4, padT - 7);
    ctx.fillText(o.zeroLabels[1], padL + 4, h - padB + 9);
  }
  // x ticks
  const { ticks, stepH } = timeTicks(o.t0, o.t1, w);
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = C.muted;
  for (const t of ticks) {
    ctx.strokeStyle = C.grid; ctx.beginPath(); ctx.moveTo(x(t), padT); ctx.lineTo(x(t), h - padB); ctx.stroke();
    const d = new Date(t);
    ctx.fillText(stepH >= 24 ? portMonthDay(d) : hhmm(d), x(t), h - 6);
  }
  // series
  for (const s of o.series) {
    if (!s.pts || !s.pts.length) continue;
    ctx.strokeStyle = s.color; ctx.lineWidth = s.width || 2; ctx.lineJoin = 'round'; ctx.setLineDash(s.dash || []);
    ctx.beginPath();
    let pen = false, prevT = 0;
    for (const p of s.pts) {
      if (!Number.isFinite(p.v)) { pen = false; continue; }
      const px = x(p.t.getTime()), py = y(Math.max(o.yMin, Math.min(o.yMax, p.v)));
      if (pen && p.t.getTime() - prevT > (s.gapMs || 40 * 60e3)) pen = false;
      if (!pen) { ctx.moveTo(px, py); pen = true; } else ctx.lineTo(px, py);
      prevT = p.t.getTime();
    }
    ctx.stroke(); ctx.setLineDash([]);
    if (o.bands) { // over-limit highlight
      ctx.strokeStyle = C.red; ctx.lineWidth = 3; ctx.beginPath(); let on = false;
      for (const p of s.pts) {
        if (!Number.isFinite(p.v) || Math.abs(p.v) < o.bands.limit) { on = false; continue; }
        const px = x(p.t.getTime()), py = y(Math.max(o.yMin, Math.min(o.yMax, p.v)));
        if (!on) { ctx.moveTo(px, py); on = true; } else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
  }
  // now line
  if (o.now && o.now >= o.t0 && o.now <= o.t1) {
    ctx.strokeStyle = C.text2; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(x(o.now), padT); ctx.lineTo(x(o.now), h - padB); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = C.text2; ctx.font = FONT; ctx.textAlign = 'center'; ctx.fillText('NOW', x(o.now), padT - 6);
  }
  // scrub
  if (o.scrub) {
    ctx.strokeStyle = C.primary; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x(o.scrub), padT); ctx.lineTo(x(o.scrub), h - padB); ctx.stroke();
    for (const s of o.series) {
      const p = nearest(s.pts, o.scrub); if (!p) continue;
      ctx.fillStyle = s.color; ctx.beginPath(); ctx.arc(x(p.t.getTime()), y(Math.max(o.yMin, Math.min(o.yMax, p.v))), 4, 0, Math.PI * 2); ctx.fill();
    }
  }
  canvas._map = { x, padL, padR, w };
}

export function nearest(pts, ms) {
  if (!pts || !pts.length) return null;
  let best = null, bd = Infinity;
  for (const p of pts) { const d = Math.abs(p.t.getTime() - ms); if (d < bd) { bd = d; best = p; } }
  return bd < 45 * 60e3 ? best : null;
}

/** Convert a pointer x position on the canvas to a time (ms). */
export function timeAt(canvas, clientX, t0, t1) {
  const r = canvas.getBoundingClientRect();
  const padL = 34, padR = 10;
  const f = Math.max(0, Math.min(1, (clientX - r.left - padL) / (r.width - padL - padR)));
  return t0 + f * (t1 - t0);
}

/** Set & drift stick plot: one stick per sample, pointing toward set, length ∝ drift. */
export function stickPlot(canvas, o) {
  const { ctx, w, h } = setup(canvas);
  const C = COLORS();
  const padL = 34, padR = 10, padT = 10, padB = 22;
  const x = t => padL + ((t - o.t0) / (o.t1 - o.t0)) * (w - padL - padR);
  const cy = (h - padB + padT) / 2;
  const scaleKn = o.scaleKn || 1;
  const pxPerKn = (h - padT - padB) / 2 / scaleKn;
  ctx.strokeStyle = C.text2; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(padL, cy); ctx.lineTo(w - padR, cy); ctx.stroke();
  ctx.font = FONT; ctx.fillStyle = C.muted; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  ctx.fillText(`${scaleKn} kn`, padL - 6, padT + 4); ctx.fillText('N', padL - 6, cy - 8); ctx.fillText('S', padL - 6, cy + 10);
  const { ticks, stepH } = timeTicks(o.t0, o.t1, w);
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  for (const t of ticks) { const d = new Date(t); ctx.fillText(stepH >= 24 ? portMonthDay(d) : hhmm(d), x(t), h - 6); }
  const pts = o.pts || [];
  const maxSticks = Math.floor((w - padL - padR) / 3);
  const step = Math.max(1, Math.ceil(pts.length / maxSticks));
  ctx.strokeStyle = o.color; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = 0; i < pts.length; i += step) {
    const p = pts[i]; if (!Number.isFinite(p.s)) continue;
    const px = x(p.t.getTime());
    const len = Math.min(p.s, scaleKn * 1.2) * pxPerKn;
    const rad = p.d * Math.PI / 180;
    ctx.moveTo(px, cy); ctx.lineTo(px + len * Math.sin(rad), cy - len * Math.cos(rad));
  }
  ctx.stroke();
}

/** Flood/ebb prediction curve: positive = flood. */
export function predictionChart(canvas, o) {
  const { ctx, w, h } = setup(canvas);
  const C = COLORS();
  const padL = 34, padR = 10, padT = 14, padB = 22;
  const x = t => padL + ((t - o.t0) / (o.t1 - o.t0)) * (w - padL - padR);
  const maxV = Math.max(0.5, Math.ceil(o.maxV * 2) / 2);
  const y = v => padT + (1 - (v + maxV) / (2 * maxV)) * (h - padT - padB);
  ctx.strokeStyle = C.grid; ctx.font = FONT; ctx.fillStyle = C.muted; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (const v of [maxV, 0, -maxV]) { ctx.strokeStyle = v === 0 ? C.text2 : C.grid; ctx.beginPath(); ctx.moveTo(padL, y(v)); ctx.lineTo(w - padR, y(v)); ctx.stroke(); ctx.fillText(v === 0 ? '0' : Math.abs(v).toFixed(1), padL - 6, y(v)); }
  const { ticks } = timeTicks(o.t0, o.t1, w);
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  for (const t of ticks) { ctx.strokeStyle = C.grid; ctx.beginPath(); ctx.moveTo(x(t), padT); ctx.lineTo(x(t), h - padB); ctx.stroke(); ctx.fillText(hhmm(new Date(t)), x(t), h - 6); }
  // fill
  const pts = o.pts || [];
  if (pts.length) {
    ctx.beginPath(); ctx.moveTo(x(pts[0].t.getTime()), y(0));
    for (const p of pts) ctx.lineTo(x(p.t.getTime()), y(p.v));
    ctx.lineTo(x(pts[pts.length - 1].t.getTime()), y(0)); ctx.closePath();
    ctx.fillStyle = 'rgba(79,179,217,0.18)'; ctx.fill();
    ctx.strokeStyle = C.primary; ctx.lineWidth = 2; ctx.beginPath();
    pts.forEach((p, i) => i ? ctx.lineTo(x(p.t.getTime()), y(p.v)) : ctx.moveTo(x(p.t.getTime()), y(p.v)));
    ctx.stroke();
  }
  // slack markers
  ctx.fillStyle = C.text2; ctx.font = FONT; ctx.textAlign = 'center';
  for (const s of o.slacks || []) { const px = x(s.getTime()); if (px < padL || px > w - padR) continue; ctx.beginPath(); ctx.arc(px, y(0), 3, 0, 7); ctx.fill(); ctx.fillText(hhmm(s), px, padT - 3); }
  if (o.now >= o.t0 && o.now <= o.t1) { ctx.strokeStyle = C.text2; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(x(o.now), padT); ctx.lineTo(x(o.now), h - padB); ctx.stroke(); ctx.setLineDash([]); }
  ctx.fillStyle = C.muted; ctx.textAlign = 'left'; ctx.fillText('FLOOD', padL + 4, padT + 10); ctx.fillText('EBB', padL + 4, h - padB - 4);
}

// ---------------------------------------------------------------------------
// SVG helpers
// ---------------------------------------------------------------------------
const P = (cx, cy, r, deg) => [cx + r * Math.sin(deg * Math.PI / 180), cy - r * Math.cos(deg * Math.PI / 180)];
function arrowPath(cx, cy, len, deg, head = 7) {
  const [tx, ty] = P(cx, cy, len, deg);
  const [bx, by] = P(cx, cy, Math.max(0, len - head), deg);
  const [l1x, l1y] = P(bx, by, head * 0.7, deg - 90), [l2x, l2y] = P(bx, by, head * 0.7, deg + 90);
  return `M${cx},${cy} L${bx},${by} M${l1x},${l1y} L${tx},${ty} L${l2x},${l2y}`;
}

/** Mini compass with the channel band (course axis) and a set/drift arrow. */
export function miniCompass({ setDeg, driftKn, course, color, scaleKn = 0.5, size = 136 }) {
  const c = size / 2, r = c - 2;
  const len = Math.min(r - 12, (driftKn / scaleKn) * (r - 12)) || 0;
  const band = (() => { const [x1, y1] = P(c, c, r - 4, course), [x2, y2] = P(c, c, r - 4, course + 180); return `M${x1},${y1} L${x2},${y2}`; })();
  const [ax, ay] = P(c, c, r - 10, course);
  const lbl = (deg, txt, dy = 4) => { const [x, y] = P(c, c, r - 16, deg); return `<text x="${x}" y="${y + dy}" text-anchor="middle" font-size="12" font-weight="700" fill="var(--color-text-2)" font-family="Barlow Condensed">${txt}</text>`; };
  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-label="Set ${Math.round(setDeg)}° at ${driftKn.toFixed(2)} kn">
  <circle cx="${c}" cy="${c}" r="${r}" fill="var(--color-inset)" stroke="var(--color-border-strong)"/>
  <path d="${band}" stroke="rgba(79,179,217,0.18)" stroke-width="22" stroke-linecap="butt"/>
  ${lbl(0, 'N', 4)}${lbl(90, 'E', 4)}${lbl(180, 'S', 4)}${lbl(270, 'W', 4)}
  <path d="${arrowPath(P(c, c, r - 6, course + 180)[0], P(c, c, r - 6, course + 180)[1], 10, course, 8)}" stroke="var(--color-primary)" stroke-width="2.5" fill="none" stroke-linecap="round"/>
  ${Number.isFinite(setDeg) && len > 1 ? `<path d="${arrowPath(c, c, len, setDeg, 9)}" stroke="${color}" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>` : ''}
  <circle cx="${c}" cy="${c}" r="4.5" fill="var(--color-text)"/>
</svg>`;
}

/** Large compass rose with a ring at ringKn and the set/drift arrow. */
export function compassRose({ setDeg, driftKn, color, ringKn = 1, size = 240, course }) {
  const c = size / 2, r = c - 6;
  const scale = Math.max(ringKn, driftKn * 1.1);
  const len = (driftKn / scale) * (r - 18);
  const ringR = (ringKn / scale) * (r - 18);
  let ticks = '';
  for (let d = 0; d < 360; d += 10) { const [x1, y1] = P(c, c, r, d), [x2, y2] = P(c, c, r - (d % 30 ? 5 : 10), d); ticks += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="var(--color-text-2)" stroke-width="${d % 90 ? 1 : 2}"/>`; }
  const lbl = (deg, t) => { const [x, y] = P(c, c, r - 22, deg); return `<text x="${x}" y="${y + 5}" text-anchor="middle" font-size="14" font-weight="700" fill="var(--color-text-2)" font-family="Barlow Condensed">${t}</text>`; };
  const band = Number.isFinite(course) ? (() => { const [x1, y1] = P(c, c, r - 30, course), [x2, y2] = P(c, c, r - 30, course + 180); return `<path d="M${x1},${y1} L${x2},${y2}" stroke="rgba(79,179,217,0.14)" stroke-width="26"/>`; })() : '';
  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="Set ${Math.round(setDeg)}° drift ${driftKn.toFixed(2)} kn">
  <circle cx="${c}" cy="${c}" r="${r}" fill="var(--color-inset)" stroke="var(--color-border-strong)"/>${band}${ticks}
  <circle cx="${c}" cy="${c}" r="${ringR}" fill="none" stroke="var(--color-border-strong)" stroke-dasharray="3 4"/>
  <text x="${c + 4}" y="${c - ringR - 4}" font-size="11" fill="var(--color-muted)" font-family="Barlow Condensed" font-weight="600">${ringKn} KN</text>
  ${lbl(0, 'N')}${lbl(90, 'E')}${lbl(180, 'S')}${lbl(270, 'W')}
  ${Number.isFinite(setDeg) && len > 1 ? `<path d="${arrowPath(c, c, len, setDeg, 12)}" stroke="${color}" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>` : ''}
  <circle cx="${c}" cy="${c}" r="5" fill="var(--color-text)"/>
</svg>`;
}

/** Wind compass: arrow points DOWNWIND (direction the wind blows toward). */
export function windCompass({ fromDeg, speedKn, size = 120 }) {
  const c = size / 2, r = c - 2;
  const toward = fromDeg + 180;
  const lbl = (deg, t) => { const [x, y] = P(c, c, r - 14, deg); return `<text x="${x}" y="${y + 4}" text-anchor="middle" font-size="11" font-weight="700" fill="var(--color-text-2)" font-family="Barlow Condensed">${t}</text>`; };
  const len = Math.min(r - 14, 14 + speedKn * 1.2);
  const [sx, sy] = P(c, c, len * 0.45, fromDeg);
  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="Wind from ${Math.round(fromDeg)}° at ${Math.round(speedKn)} knots">
  <circle cx="${c}" cy="${c}" r="${r}" fill="var(--color-inset)" stroke="var(--color-border-strong)"/>
  ${lbl(0, 'N')}${lbl(90, 'E')}${lbl(180, 'S')}${lbl(270, 'W')}
  ${Number.isFinite(fromDeg) ? `<path d="${arrowPath(sx, sy, len, toward, 11)}" stroke="var(--color-text)" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>` : ''}
</svg>`;
}

/** Small direction arrow (points toward deg). */
export function dirArrow(deg, color = 'var(--color-blue)', size = 22) {
  const c = size / 2;
  return `<svg class="arrow" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true"><path d="${arrowPath(P(c, c, 8, deg + 180)[0], P(c, c, 8, deg + 180)[1], 16, deg, 7)}" stroke="${color}" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

/**
 * Plan-view ship diagram. The ship travels along the course (drawn left = course direction when
 * inbound, i.e. course 270 → bow points left). Set arrows (current) and wind arrows are drawn in
 * geographic orientation relative to the course axis: "up" on the diagram = starboard side.
 */
export function shipDiagram({ course, heading, setDeg, driftKn, windFrom, windKn, inbound, color }) {
  const W = 640, H = 224;
  const cy = 120;
  // Diagram frame: course axis horizontal, bow to the LEFT. Starboard side is UP for a westbound ship (course 270: right-hand side = north = up).
  // Convert a geographic direction into a diagram angle: 0 = toward bow (left), 90 = toward starboard (up).
  const rel = deg => ((deg - course) + 540) % 360 - 180;   // -180..180, + = starboard
  const toXY = (relDeg, len) => [-len * Math.cos(relDeg * Math.PI / 180), -len * Math.sin(relDeg * Math.PI / 180)];
  const arrow = (x, y, relDeg, len, stroke, sw = 3) => {
    const [dx, dy] = toXY(relDeg, len); const ex = x + dx, ey = y + dy;
    const ang = Math.atan2(dy, dx);
    const hx1 = ex - 9 * Math.cos(ang - 0.5), hy1 = ey - 9 * Math.sin(ang - 0.5);
    const hx2 = ex - 9 * Math.cos(ang + 0.5), hy2 = ey - 9 * Math.sin(ang + 0.5);
    return `<path d="M${x},${y} L${ex},${ey} M${hx1},${hy1} L${ex},${ey} L${hx2},${hy2}" stroke="${stroke}" stroke-width="${sw}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
  };
  const crab = ((heading - course) + 540) % 360 - 180;   // + = heading to starboard of course
  // Ship outline (bow left), rotated by crab (positive crab turns the bow toward starboard = up → negative screen rotation).
  const shipLen = 380, shipB = 50, sx = 350, sy = cy;
  const hull = `M${sx - shipLen / 2},${sy} L${sx - shipLen / 2 + 60},${sy - shipB / 2} L${sx + shipLen / 2 - 20},${sy - shipB / 2} Q${sx + shipLen / 2},${sy - shipB / 2} ${sx + shipLen / 2},${sy - shipB / 2 + 10} L${sx + shipLen / 2},${sy + shipB / 2 - 10} Q${sx + shipLen / 2},${sy + shipB / 2} ${sx + shipLen / 2 - 20},${sy + shipB / 2} L${sx - shipLen / 2 + 60},${sy + shipB / 2} Z`;
  const house = `<rect x="${sx + shipLen / 2 - 70}" y="${sy - 16}" width="34" height="32" rx="6" fill="none" stroke="#fff" stroke-width="2.5"/>`;
  const rot = crab * 4; // SVG rotation is clockwise; + crab (to starboard = up) lifts the left-pointing bow. ×4 exaggeration.
  const bandTop = [cy - 90, cy - 44], bandBot = [cy + 44, cy + 90];
  const inBand = (x, band, relDeg, len, stroke, sw) => {
    const [dx, dy] = toXY(relDeg, len);
    const y0 = dy < 0 ? band[1] : band[0];
    const x0 = x - dx / 2;
    return arrow(x0, y0, relDeg, len, stroke, sw);
  };
  const setArrows = Number.isFinite(setDeg) && driftKn > 0.02
    ? [[150, bandTop], [330, bandTop], [490, bandTop], [150, bandBot], [490, bandBot]].map(([x, b]) => inBand(x, b, rel(setDeg), 44, color, 4)).join('') : '';
  const windArrows = Number.isFinite(windFrom) && windKn > 0.5
    ? [[240, bandTop], [580, bandTop]].map(([x, b]) => inBand(x, b, rel(windFrom + 180), 30 + Math.min(16, windKn * 0.6), 'var(--color-muted)', 3.5)).join('') : '';
  const headingLine = `<g transform="rotate(${rot} ${sx} ${sy})"><path d="M${sx},${sy} L${sx - shipLen / 2 - 150},${sy}" stroke="var(--color-primary)" stroke-width="4" stroke-dasharray="10 6"/><path d="M${sx - shipLen / 2 - 150},${sy} l14,-7 v14 z" fill="var(--color-primary)"/></g>`;
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block" role="img" aria-label="Ship diagram">
  <line x1="10" y1="${cy}" x2="${W - 10}" y2="${cy}" stroke="var(--color-text-2)" stroke-width="2" stroke-dasharray="10 8" opacity="0.7"/>
  ${setArrows}${windArrows}${headingLine}
  <g transform="rotate(${rot} ${sx} ${sy})"><path d="${hull}" fill="#15202b" stroke="#fff" stroke-width="4" stroke-linejoin="round"/>${house}</g>
  <text x="14" y="22" font-family="Barlow Condensed" font-weight="700" font-size="22" fill="var(--color-text-2)" letter-spacing="2">${inbound ? 'INBOUND' : 'OUTBOUND'} ◀</text>
  <text x="${W - 14}" y="22" text-anchor="end" font-family="Barlow Condensed" font-weight="700" font-size="22" fill="var(--color-text-2)" letter-spacing="2">${inbound ? 'SEAWARD' : 'HARBOR'}</text>
</svg>`;
}
