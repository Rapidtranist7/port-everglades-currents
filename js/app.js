// App shell: state, data refresh, routing, event handling, chart mounting.
import * as N from './noaa.js';
import * as V from './views.js';
import { buoyState, windNow, historySeries, historyStats, effectiveCourse, interp } from './compute.js';
import { lineChart, stickPlot, predictionChart, timeAt, nearest } from './charts.js';
import { SHIP_PRESETS } from './ships.js';
import * as M from './model.js';
import { store, PERSISTENT } from './storage.js';

const REFRESH_MS = 6 * 60 * 1000;
const DEFAULTS = {
  course: 270, direction: 'inbound', draftFt: 28, speedSea: 12, speedB2: 10,
  caution: 1.0, limit: 2.0, theme: 'auto', depthSea: 118, depthB2: 55, windGain: 1.0,
  ship: 'off', condition: 'loaded',
  custom: { lpp: 235, beam: 35, cb: 0.70, alLoaded: 6000, alBallast: 6500 },
};

const state = {
  settings: { ...DEFAULTS, ...(store.get('pe.settings') || {}), custom: { ...DEFAULTS.custom, ...((store.get('pe.settings') || {}).custom || {}) } },
  ui: { tab: 'now', detail: null, detailMode: 'profile', histMetric: 'cross', histRange: '24h', scrub: null },
  raw: { sea: null, b2: null }, buoys: { sea: null, b2: null },
  windSeries: [], wind: null, wl: [], wlPred: [], hilo: { south: [], tb: [] }, met: {},
  preds: {}, predsDay: null, history: {}, errors: {},
  lastUpdate: null, nextPullMs: REFRESH_MS, refreshing: false, refreshCount: 0, persistent: PERSISTENT,
};

const root = document.getElementById('app');
const tabsEl = document.getElementById('tabs');

// ---------------------------------------------------------------------------
// Data refresh
// ---------------------------------------------------------------------------
async function safe(label, fn) {
  try { const r = await fn(); delete state.errors[label]; return r; }
  catch (e) { state.errors[label] = `${label}: ${e.message || e}`; console.warn(label, e); return null; }
}

async function loadBuoy(b, full) {
  const raw = state.raw[b.key] || { bins: [], latest: {}, rt24: [] };
  if (!raw.bins.length) {
    const meta = await safe(b.key, () => N.fetchBins(b.id));
    if (meta) { raw.bins = meta.bins; }
    if (!raw.bins.length) raw.bins = Array.from({ length: b.key === 'sea' ? 16 : 10 }, (_, i) => ({ num: i + 1, depthFt: 11.2 + i * 3.28 }));
  }
  const draft = state.settings.draftFt;
  const rt24 = await safe(b.key, () => N.fetchCurrents(b.id, b.rtBin, { range: 24 }));
  if (rt24) raw.rt24 = rt24;
  // Bins within the draft refresh every pull; deeper bins every third pull (18 min).
  const bins = raw.bins.filter(x => full || x.depthFt <= draft + 0.5 || state.refreshCount % 3 === 0);
  const results = await Promise.all(bins.map(x => safe(b.key, () => N.fetchCurrents(b.id, x.num, { date: 'latest' }))));
  results.forEach((r, i) => { if (r && r.length) raw.latest[bins[i].num] = r[r.length - 1]; });
  state.raw[b.key] = raw;
}

async function loadPredictions(force) {
  const today = new Date().toDateString();
  if (!force && state.predsDay === today && Object.keys(state.preds).length) return;
  const begin = new Date(); begin.setDate(begin.getDate() - 1); begin.setHours(0, 0, 0, 0);
  const end = new Date(begin); end.setDate(end.getDate() + 3);
  await Promise.all(N.STATIONS.predictions.map(async p => {
    const [series, events] = await Promise.all([
      safe('pred-' + p.id, () => N.fetchCurrentPredictions(p.id, begin, end, '30')),
      safe('pred-' + p.id, () => N.fetchCurrentPredictions(p.id, begin, end, 'MAX_SLACK')),
    ]);
    if (series) state.preds[p.id] = { series, events: events || [] };
  }));
  const hiloEnd = new Date(begin); hiloEnd.setDate(hiloEnd.getDate() + 3);
  const [south, tb] = await Promise.all([
    safe('hilo', () => N.fetchTidePredictions(N.STATIONS.met.id, begin, hiloEnd, 'hilo')),
    safe('hilo', () => N.fetchTidePredictions(N.STATIONS.tideSecondary.id, begin, hiloEnd, 'hilo')),
  ]);
  if (south) state.hilo.south = south; if (tb) state.hilo.tb = tb;
  state.predsDay = today;
}

async function refresh(full = false) {
  if (state.refreshing) return;
  state.refreshing = true; render();
  const now = new Date();
  const p0 = new Date(now.getTime() - 26 * 36e5), p1 = new Date(now.getTime() + 26 * 36e5);
  await Promise.all([
    ...N.STATIONS.buoys.map(b => loadBuoy(b, full)),
    safe('wind', () => N.fetchWind(24)).then(w => { if (w) state.windSeries = w; }),
    safe('water level', () => N.fetchWaterLevel(30)).then(w => { if (w) state.wl = w; }),
    safe('tide predictions', () => N.fetchTidePredictions(N.STATIONS.met.id, p0, p1, '6')).then(w => { if (w) state.wlPred = w; }),
    safe('pressure', () => N.fetchLatest('air_pressure')).then(v => { if (v) state.met.pressure = v; }),
    safe('water temp', () => N.fetchLatest('water_temperature')).then(v => { if (v) state.met.wtemp = v; }),
    safe('air temp', () => N.fetchLatest('air_temperature')).then(v => { if (v) state.met.atemp = v; }),
    loadPredictions(false),
  ]);
  state.refreshCount++;
  state.lastUpdate = new Date();
  state.nextPullMs = REFRESH_MS;
  state.refreshing = false;
  if (state.history['24h'] || state.ui.tab === 'history') state.history['24h'] = null; // rebuild from fresh rt24
  recompute();
  render();
}

function recompute() {
  state.wind = windNow(state.windSeries);
  for (const b of N.STATIONS.buoys) state.buoys[b.key] = buoyState(b, state.raw[b.key], state.settings, state.wind);
}

async function ensureHistory(range) {
  const existing = state.history[range];
  if (existing && !existing.error && (existing.pts || existing.loading)) return;
  const h = { loading: true, pts: {}, stats: {} };
  state.history[range] = h; render();
  const hours = { '24h': 24, '3d': 72, '7d': 168, '30d': 720 }[range];
  const end = new Date(), begin = new Date(end.getTime() - hours * 36e5);
  await Promise.all(N.STATIONS.buoys.map(async b => {
    let pts;
    if (range === '24h' && state.raw[b.key] && state.raw[b.key].rt24.length) pts = state.raw[b.key].rt24;
    else pts = await safe('history ' + b.key, () => N.fetchCurrents(b.id, b.rtBin, { begin_date: N.fmtApiDate(begin), end_date: N.fmtApiDate(end) }));
    h.pts[b.key] = pts || [];
  }));
  h.loading = false; h.t0 = begin.getTime(); h.t1 = end.getTime();
  const course = effectiveCourse(state.settings);
  for (const b of N.STATIONS.buoys) h.stats[b.key] = historyStats(h.pts[b.key], course, state.settings.caution);
  if (!Object.values(h.pts).some(p => p.length)) h.error = 'NOAA returned no history for this range.';
  render();
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
function applyTheme() {
  const t = state.settings.theme;
  const hour = new Date().getHours();
  const systemDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const dark = t === 'night' || (t === 'auto' && (systemDark || hour < 7 || hour >= 18));
  document.documentElement.dataset.theme = dark ? 'night' : 'day';
}

function render() {
  applyTheme();
  const { tab, detail } = state.ui;
  const scrollY = window.scrollY;
  let html;
  if (tab === 'now') html = detail ? V.detailView(state) : V.nowView(state);
  else if (tab === 'history') html = V.historyView(state);
  else if (tab === 'tide') html = V.tideView(state);
  else html = V.settingsView(state);
  root.innerHTML = html;
  tabsEl.innerHTML = V.tabBar(tab);
  mountCharts();
  if (render.keepScroll) window.scrollTo(0, scrollY); else window.scrollTo(0, 0);
  render.keepScroll = true;
}

function mountCharts() {
  const course = effectiveCourse(state.settings);
  const { caution, limit } = state.settings;
  const colors = { sea: getComputedStyle(document.documentElement).getPropertyValue('--color-blue').trim(), b2: getComputedStyle(document.documentElement).getPropertyValue('--color-orange').trim() };

  // Detail 24 h
  const d24 = document.getElementById('detail24');
  if (d24) {
    const key = d24.dataset.buoy, raw = state.raw[key];
    const pts = historySeries(raw ? raw.rt24 : [], course, 'cross');
    const t1 = Date.now(), t0 = t1 - 24 * 36e5;
    const maxAbs = Math.max(1.2, ...pts.map(p => Math.abs(p.v)));
    const yMax = Math.min(3, Math.ceil(maxAbs * 2) / 2);
    const right = M.cardinal4(course + 90), left = M.cardinal4(course - 90);
    const draw = scrub => lineChart(d24, { series: [{ pts, color: colors[key] }], t0, t1, yMin: -yMax, yMax, yStep: 0.5, bands: { caution, limit }, zeroLabels: [`SETTING ${right}`, `SETTING ${left}`], scrub });
    draw(null);
    attachScrub(d24, t0, t1, ms => { draw(ms); const p = nearest(pts, ms); const el = document.getElementById('detail24-readout'); if (el) el.textContent = p ? `${V.hhmm(p.t)} · ${V.kn(p.v)} kn cross setting ${M.crossCardinal(p.v, course)}` : V.hhmm(new Date(ms)); });
    const st = document.getElementById('detail24stick');
    if (st) stickPlot(st, { pts: raw ? raw.rt24 : [], t0, t1, color: colors[key], scaleKn: Math.max(0.25, Math.ceil(Math.max(0, ...(raw ? raw.rt24 : []).map(p => p.s)) * 4) / 4) });
  }

  // History
  const hc = document.getElementById('histChart');
  if (hc) {
    const h = state.history[state.ui.histRange];
    if (h && !h.loading) {
      const metric = state.ui.histMetric;
      const series = N.STATIONS.buoys.map(b => ({ pts: historySeries(h.pts[b.key], course, metric), color: colors[b.key] }));
      const all = series.flatMap(s => s.pts.map(p => Math.abs(p.v)));
      const maxAbs = Math.max(metric === 'drift' ? 0.5 : 1.2, ...all);
      const yMax = Math.ceil(maxAbs * 2) / 2;
      const yMin = metric === 'drift' ? 0 : -yMax;
      const right = M.cardinal4(course + 90), left = M.cardinal4(course - 90);
      const zl = metric === 'cross' ? [`SETTING ${right}`, `SETTING ${left}`] : metric === 'along' ? [`FLOWING ${state.settings.direction === 'outbound' ? 'OUTBOUND' : 'INBOUND'}`, `FLOWING ${state.settings.direction === 'outbound' ? 'INBOUND' : 'OUTBOUND'}`] : null;
      const draw = scrub => lineChart(hc, { series, t0: h.t0, t1: h.t1, yMin, yMax, yStep: yMax > 2 ? 1 : 0.5, bands: metric === 'cross' ? { caution, limit } : null, zeroLabels: zl, scrub });
      draw(null);
      attachScrub(hc, h.t0, h.t1, ms => {
        draw(ms);
        const el = document.getElementById('histReadout');
        if (el) el.innerHTML = `${V.hhmm(new Date(ms))} ${new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · ` + N.STATIONS.buoys.map((b, i) => { const p = nearest(series[i].pts, ms); return `<span class="c-${b.color}">${b.name}</span> ${p ? V.kn(p.v) + (metric === 'cross' ? ' ' + M.crossCardinal(p.v, course) : metric === 'along' ? (p.v >= 0 ? ' with' : ' against') : '') : '—'}`; }).join(' · ');
      });
      const scale = Math.max(0.25, Math.ceil(Math.max(0, ...N.STATIONS.buoys.flatMap(b => h.pts[b.key].map(p => p.s))) * 4) / 4);
      const s1 = document.getElementById('stickSea'), s2 = document.getElementById('stickB2');
      if (s1) stickPlot(s1, { pts: h.pts.sea, t0: h.t0, t1: h.t1, color: colors.sea, scaleKn: scale });
      if (s2) stickPlot(s2, { pts: h.pts.b2, t0: h.t0, t1: h.t1, color: colors.b2, scaleKn: scale });
    }
  }

  // Tide chart
  const tc = document.getElementById('tideChart');
  if (tc) {
    const now = Date.now(), t0 = now - 26 * 36e5, t1 = now + 26 * 36e5;
    const obs = state.wl, pred = state.wlPred;
    const vals = [...obs.map(p => p.v), ...pred.map(p => p.v)];
    const yMin = Math.floor(Math.min(-0.5, ...vals)), yMax = Math.ceil(Math.max(3, ...vals));
    lineChart(tc, { series: [{ pts: pred, color: getComputedStyle(document.documentElement).getPropertyValue('--color-muted').trim(), width: 1.5, gapMs: 20 * 60e3, dash: [5, 4] }, { pts: obs, color: getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim(), width: 2.5 }], t0, t1, yMin, yMax, yStep: 1, now });
  }
  for (const p of N.STATIONS.predictions) {
    const c = document.getElementById('pred-' + p.id); const d = state.preds[p.id];
    if (c && d) {
      const now = Date.now(), t0 = now - 2 * 36e5, t1 = now + 24 * 36e5;
      const pts = d.series.filter(s => s.t.getTime() >= t0 - 36e5 && s.t.getTime() <= t1 + 36e5);
      predictionChart(c, { pts, t0, t1, now, maxV: Math.max(0.5, ...pts.map(s => Math.abs(s.v))), slacks: d.events.filter(e => e.type === 'slack').map(e => e.t) });
    }
  }
}

function attachScrub(canvas, t0, t1, cb) {
  let active = false;
  const move = e => { if (!active && e.type !== 'pointerdown') return; cb(timeAt(canvas, e.clientX, t0, t1)); };
  canvas.addEventListener('pointerdown', e => { active = true; canvas.setPointerCapture(e.pointerId); move(e); });
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', () => { active = false; });
  canvas.addEventListener('pointercancel', () => { active = false; });
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------
function saveSettings() { store.set('pe.settings', state.settings); }

function setSetting(key, value) {
  const s = state.settings;
  if (key === 'ship') {
    s.ship = value;
    const p = SHIP_PRESETS.find(x => x.id === value);
    if (p && !p.hasBallast) s.condition = 'loaded';
  } else if (['direction', 'condition', 'theme'].includes(key)) s[key] = value;
  else {
    const n = parseFloat(value);
    if (!Number.isFinite(n)) return;
    s[key] = n;
  }
  saveSettings(); recompute();
  if (key === 'caution' || key === 'course' || key === 'direction') state.history = {};
  render.keepScroll = true; render();
  if (state.ui.tab === 'history') ensureHistory(state.ui.histRange);
}

document.addEventListener('click', e => {
  const el = e.target.closest('[data-action], [data-setting][data-value]');
  if (!el) return;
  if (el.dataset.setting && el.dataset.value != null) { setSetting(el.dataset.setting, el.dataset.value); return; }
  const a = el.dataset.action, v = el.dataset.value;
  render.keepScroll = false;
  if (a === 'tab') { state.ui.tab = v; state.ui.detail = null; render(); if (v === 'history') ensureHistory(state.ui.histRange); }
  else if (a === 'detail') { state.ui.detail = el.dataset.buoy; render(); }
  else if (a === 'back') { state.ui.detail = null; render(); }
  else if (a === 'detailMode') { state.ui.detailMode = v; render.keepScroll = true; render(); }
  else if (a === 'histMetric') { state.ui.histMetric = v; render.keepScroll = true; render(); }
  else if (a === 'histRange') { state.ui.histRange = v; render.keepScroll = true; render(); ensureHistory(v); }
  else if (a === 'refresh') { refresh(true); }
  else if (a === 'exportCsv') { exportCsv(); }
  else if (a === 'resetSettings') { state.settings = { ...DEFAULTS, custom: { ...DEFAULTS.custom } }; saveSettings(); recompute(); state.history = {}; render(); }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.matches('[data-action="detail"]')) e.target.click();
});
document.addEventListener('change', e => {
  const el = e.target;
  if (el.matches('select[data-setting]')) setSetting(el.dataset.setting, el.value);
  else if (el.matches('input[data-setting]')) setSetting(el.dataset.setting, el.value);
  else if (el.matches('input[data-custom]')) {
    const n = parseFloat(el.value); if (!Number.isFinite(n)) return;
    state.settings.custom[el.dataset.custom] = n; saveSettings(); recompute(); render.keepScroll = true; render();
  }
});

function exportCsv() {
  const h = state.history[state.ui.histRange];
  if (!h || h.loading) return;
  const course = effectiveCourse(state.settings);
  const rows = [['time_local', 'buoy', 'station', 'depth_ft', 'speed_kn', 'set_deg_true', 'cross_kn_pos_starboard', 'along_kn_pos_with_ship', 'course_deg']];
  for (const b of N.STATIONS.buoys) {
    const depth = (state.raw[b.key] && state.raw[b.key].bins.find(x => x.num === b.rtBin) || {}).depthFt;
    for (const p of h.pts[b.key] || []) {
      const ca = M.crossAlong(p.d, p.s, course);
      rows.push([p.t.toISOString().slice(0, 16).replace('T', ' '), b.name, b.id, Math.round(depth || 14), p.s.toFixed(2), p.d.toFixed(0), ca.cross.toFixed(3), ca.along.toFixed(3), course]);
    }
  }
  const blob = new Blob([rows.map(r => r.join(',')).join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `port-everglades-currents-${state.ui.histRange}.csv`; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ---------------------------------------------------------------------------
// Timers
// ---------------------------------------------------------------------------
setInterval(() => {
  if (state.refreshing) return;
  state.nextPullMs -= 1000;
  if (state.nextPullMs <= 0) { refresh(false); return; }
  const sub = root.querySelector('.hdr .sub');
  if (sub && state.lastUpdate) sub.innerHTML = V.subline(state);
}, 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden && state.lastUpdate && Date.now() - state.lastUpdate.getTime() > REFRESH_MS) refresh(false); });
window.addEventListener('resize', () => mountCharts());
if (window.matchMedia) window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => render());

recompute();
render();
refresh(true);
