// HTML templates for each screen. Pure functions: (state) → html string.
import * as M from './model.js';
import { SHIP_PRESETS, QUICK_CLASSES } from './ships.js';
import { STATIONS } from './noaa.js';
import { effectiveCourse, interp } from './compute.js';
import { miniCompass, compassRose, windCompass, dirArrow, shipDiagram } from './charts.js';

export const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const hhmm = d => d ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : '—';
export const kn = (v, dp = 2) => Number.isFinite(v) ? Math.abs(v).toFixed(dp) : '—';
export const deg3 = d => Number.isFinite(d) ? String(Math.round(M.norm360(d)) % 360).padStart(3, '0') + '°' : '—';
export const degS = d => Number.isFinite(d) ? Math.round(M.norm360(d)) + '°' : '—';
export const ft = (v, dp = 2) => Number.isFinite(v) ? v.toFixed(dp) : '—';
export function zone() {
  try { return new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', timeZoneName: 'short' }).formatToParts(new Date()).find(p => p.type === 'timeZoneName').value; } catch { return 'ET'; }
}
export function ago(d, now = Date.now()) {
  if (!d) return '';
  const m = Math.round((now - d.getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60); return `${h} h ${m % 60} min ago`;
}
export function inHours(ms, now = Date.now()) {
  const m = Math.max(0, Math.round((ms - now) / 60000));
  const h = Math.floor(m / 60);
  return h ? `in ${h} h ${m % 60} min` : `in ${m} min`;
}
const crabTxt = crab => `${Math.abs(crab).toFixed(1)}° crab${Math.abs(crab) < 0.05 ? '' : crab > 0 ? ' to starboard' : ' to port'}`;
const dayTime = d => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) + ' at ' + hhmm(d);
const buoyColor = b => b.color === 'blue' ? 'var(--color-blue)' : 'var(--color-orange)';
const sideWord = (cross, course) => cross > 0 ? 'starboard' : 'port';
const dirName = settings => settings.direction === 'outbound' ? 'outbound' : 'inbound';

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------
export function header(state) {
  const { lastUpdate, nextPullMs, refreshing } = state;
  const next = nextPullMs > 0 ? `${Math.floor(nextPullMs / 60000)}:${String(Math.floor((nextPullMs % 60000) / 1000)).padStart(2, '0')}` : 'now';
  return `<header class="hdr">
    <div><h1>Port Everglades</h1>
      <div class="sub">${lastUpdate ? `Updated <b>${hhmm(lastUpdate)} ${zone()}</b> · next pull in ${next}` : (refreshing ? 'Loading NOAA data…' : 'Waiting for data')}</div></div>
    <button class="iconbtn ${refreshing ? 'spin' : ''}" data-action="refresh" aria-label="Refresh now">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/></svg>
    </button></header>`;
}

export function windageControl(state, compact) {
  const s = state.settings;
  const active = s.ship && s.ship !== 'off';
  const groups = {};
  for (const p of SHIP_PRESETS) (groups[p.group] ||= []).push(p);
  const opts = [`<option value="off" ${!active ? 'selected' : ''}>Off — current only</option>`,
    `<optgroup label="Quick classes">${QUICK_CLASSES.map(q => `<option value="${q.id}" ${s.ship === q.id ? 'selected' : ''}>${q.id} windage · ${esc(q.hint)}</option>`).join('')}</optgroup>`,
    ...Object.entries(groups).map(([g, ps]) => `<optgroup label="${esc(g)}">${ps.map(p => `<option value="${p.id}" ${s.ship === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</optgroup>`)].join('');
  const preset = SHIP_PRESETS.find(p => p.id === s.ship);
  const showCond = preset && preset.hasBallast;
  return `<div class="windage">
    <div class="row" style="gap:12px">
      <div class="lbl" style="width:${compact ? '64px' : '72px'};line-height:1.25">Ship<br>windage</div>
      <div class="select ${active ? 'accent' : ''}" style="flex:1"><select data-setting="ship" aria-label="Ship windage">${opts}</select></div>
    </div>
    ${showCond ? `<div class="seg sm mt2" role="group" aria-label="Loading condition">
      <button data-setting="condition" data-value="loaded" aria-pressed="${s.condition !== 'ballast'}">Loaded</button>
      <button data-setting="condition" data-value="ballast" aria-pressed="${s.condition === 'ballast'}">Ballast</button></div>` : ''}
  </div>`;
}

const statusPill = (st, extra = '') => `<span class="pill ${st.id}">${st.label}${extra}</span>`;

// ---------------------------------------------------------------------------
// NOW
// ---------------------------------------------------------------------------
export function nowView(state) {
  const { settings, wind } = state;
  const course = effectiveCourse(settings);
  const buoys = STATIONS.buoys.map(b => state.buoys[b.key]);
  const ship = buoys[0] && buoys[0].ship;
  const windLine = (bs) => {
    if (!wind) return `<span class="lbl">Wind</span> no South Port wind data`;
    const side = bs.windCross > 0 ? 'starboard' : 'port';
    return `<span><span class="lbl">Wind</span> ${kn(bs.windCross, 0)} kn across, to ${side}</span><span>gusts ${kn(wind.gust, 0)}</span>`;
  };
  const buoyCard = bs => {
    if (!bs.ok) return `<section class="card buoy-card clickable fade-in" data-action="detail" data-buoy="${bs.buoy.key}">
      <div class="title"><div class="name"><span class="dot ${bs.buoy.color}"></span><span class="h2">${bs.buoy.name}</span></div>${statusPill({ id: 'nodata', label: 'NO DATA' })}</div>
      <div class="body" style="grid-column:1/3"><div class="hint">No current reading yet from ${bs.buoy.noaaName} (${bs.buoy.id.toUpperCase()}). ${esc(state.errors[bs.buoy.key] || '')}</div></div><div class="chev">›</div></section>`;
    const h = bs.headings;
    const withWind = h.hdgWind != null ? `<div class="r2 withwind"><span><span class="lbl">With wind</span> ${rangeHdg(h.hdgWind, h.hdgWindGust)}</span><span>${windCorrTxt(bs)}</span></div>` : '';
    return `<section class="card buoy-card clickable fade-in" data-action="detail" data-buoy="${bs.buoy.key}" role="button" tabindex="0" aria-label="${bs.buoy.name} details">
      <div class="title"><div class="name"><span class="dot ${bs.buoy.color}"></span><span class="h2">${bs.buoy.name}</span></div>${statusPill(bs.status)}</div>
      <div class="mini compass-wrap">${miniCompass({ setDeg: bs.rt ? bs.rt.d : bs.avg.dir, driftKn: bs.rt ? bs.rt.s : bs.avg.speed, course, color: buoyColor(bs.buoy), size: 128, scaleKn: Math.max(0.35, (bs.rt ? bs.rt.s : bs.avg.speed) * 1.1) })}</div>
      <div class="body">
        <div class="headline"><span class="big">${kn(bs.headlineCross)}</span><span class="unit">kn cross · setting ${bs.headlineCard}</span></div>
        <div class="line">${bs.rt ? `${Math.round(bs.rt.depthFt)} ft ${kn(bs.rt.cross)}` : ''} · ${settings.draftFt} ft draft avg ${bs.avg ? kn(bs.avg.cross) : '—'} · drift ${bs.rt ? `${kn(bs.rt.s)} at ${deg3(bs.rt.d)}` : '—'}</div>
      </div>
      <div class="chev">›</div>
      <div class="steer">
        <div class="r1"><span><span class="lbl">Steer</span><span class="v">${deg3(h.hdgCurrent)}</span></span><span class="text2">${crabTxt(h.crab)} · ${bs.speed} kn</span></div>
        <div class="r2">${windLine(bs)}</div>${withWind}
      </div>
    </section>`;
  };

  return `${header(state)}
  <div class="mt2">${windageControl(state)}</div>
  <p class="hint mt2">${ship ? `${esc(ship.name)} · ${ship.condition} · ${ship.al.toLocaleString()} m² lateral windage · <span class="pill class-${ship.windClass}" style="padding:1px 8px;font-size:0.7rem">${ship.windClass}</span>${ship.estimated ? ' · estimated areas' : ''}` : 'Pick the ship type to add a wind estimate to Steer.'}</p>
  ${buoys.map(buoyCard).join('')}
  ${inPortCard(state)}
  ${windCard(state)}
  ${waterLevelCard(state)}
  <p class="hint xs mt4">Prototype for situational awareness only — not an operating rule or a substitute for the pilot's judgment. Data: NOAA CO-OPS PORTS, Port Everglades.</p>`;
}

function rangeHdg(a, b) {
  if (!Number.isFinite(a)) return '—';
  const ra = Math.round(M.norm360(a)) % 360, rb = Number.isFinite(b) ? Math.round(M.norm360(b)) % 360 : ra;
  if (ra === rb) return deg3(ra);
  return `${String(Math.min(ra, rb)).padStart(3, '0')}–${String(Math.max(ra, rb)).padStart(3, '0')}°`;
}
function windCorrTxt(bs) {
  const w = bs.wind; if (!w || !Number.isFinite(w.headingCorr)) return 'speed too low';
  const a = Math.abs(w.headingCorr), g = Math.abs(w.headingCorrGust);
  const side = w.headingCorr > 0 ? 'stbd' : 'port';
  const f = v => v < 0.25 ? '0' : v < 0.75 ? '½' : v.toFixed(v < 10 ? 1 : 0);
  return `${f(a)}${f(g) !== f(a) ? `–${f(g)}` : ''}° to ${side}`;
}

export function inPortCard(state) {
  const rows = STATIONS.predictions.map(p => predictionNow(state, p.id));
  const now = Date.now();
  return `<section class="card fade-in">
    <div class="row between"><span class="h2">In-port currents</span><span class="pill plain">Predicted</span></div>
    <table class="list mt2"><thead><tr><th></th><th class="r">Now</th><th class="r">Next slack</th></tr></thead><tbody>
    ${rows.map((r, i) => `<tr><td>${STATIONS.predictions[i].name}</td><td class="r">${r ? `${dirArrow(r.dir, 'var(--color-primary)')} ${r.phase} ${kn(r.v, 1)} kn` : '<span class="muted">—</span>'}</td><td class="r"><b>${r && r.nextSlack ? hhmm(r.nextSlack.t) : '—'}</b></td></tr>`).join('')}
    </tbody></table>
    <p class="hint xs mt2">NOAA predictions near the surface. Tap Tide for the next 24 hours. Now ${hhmm(new Date(now))}.</p>
  </section>`;
}

/** Derive the "now" row for a prediction station. */
export function predictionNow(state, id) {
  const p = state.preds[id]; if (!p || !p.series || !p.series.length) return null;
  const now = Date.now();
  const v = interp(p.series, now);
  const first = p.series[0];
  const phase = v >= 0 ? 'Flood' : 'Ebb';
  const dir = v >= 0 ? first.floodDir : first.ebbDir;
  const nextSlack = (p.events || []).find(e => e.type === 'slack' && e.t.getTime() > now) || null;
  const nextMax = nextSlack ? (p.events || []).find(e => e.type !== 'slack' && e.t.getTime() > nextSlack.t.getTime()) : (p.events || []).find(e => e.type !== 'slack' && e.t.getTime() > now);
  return { v, phase, dir, nextSlack, nextMax, depthFt: first.depthFt, floodDir: first.floodDir, ebbDir: first.ebbDir };
}

export function windCard(state) {
  const w = state.wind;
  return `<section class="card fade-in"><div class="row between"><span class="h2">Wind</span><span class="lbl">South Port</span></div>
    ${w ? `<div class="row mt3" style="gap:18px;align-items:center">${windCompass({ fromDeg: w.dir, speedKn: w.kn, size: 110 })}
      <div><div class="big" style="font-size:2.6rem">${kn(w.kn, 0)} <span style="font-size:1.1rem;font-weight:500;color:var(--color-text-2)">kn from ${w.card} ${deg3(w.dir)}</span></div>
      <div class="muted mt1">Gusts ${kn(w.gust, 0)} kn · ${hhmm(w.t)} · arrow points downwind</div></div></div>` : `<p class="hint mt2">No wind data from South Port right now. ${esc(state.errors.wind || '')}</p>`}
  </section>`;
}

export function waterLevelCard(state) {
  const wl = state.wl && state.wl.length ? state.wl[state.wl.length - 1] : null;
  const pred = wl ? interp(state.wlPred, wl.t.getTime()) : NaN;
  const diff = wl && Number.isFinite(pred) ? wl.v - pred : NaN;
  const nx = nextTides(state.hilo.south);
  return `<section class="card fade-in grid2">
    <div class="stat"><div class="lbl">Water level</div><div class="v">${wl ? `${ft(wl.v)} ft` : '—'}</div><div class="s">${Number.isFinite(diff) ? `${ft(Math.abs(diff))} ft ${diff >= 0 ? 'above' : 'below'} predicted` : 'MLLW · South Port'}</div></div>
    <div class="stat"><div class="lbl">Next tide</div><div class="v">${nx[0] ? `${nx[0].type === 'H' ? 'High' : 'Low'} ${hhmm(nx[0].t)}` : '—'}</div><div class="s">${nx[0] ? `${ft(nx[0].v)} ft${nx[1] ? ` · then ${nx[1].type === 'H' ? 'high' : 'low'} ${hhmm(nx[1].t)}` : ''}` : ''}</div></div>
  </section>`;
}
export function nextTides(hilo, n = 2) {
  const now = Date.now();
  return (hilo || []).filter(e => e.t.getTime() > now).slice(0, n);
}

// ---------------------------------------------------------------------------
// BUOY DETAIL
// ---------------------------------------------------------------------------
export function detailView(state) {
  const bs = state.buoys[state.ui.detail];
  const { settings, wind } = state;
  const course = effectiveCourse(settings);
  const b = bs.buoy;
  const inbound = settings.direction !== 'outbound';
  const depth = b.key === 'sea' ? settings.depthSea : settings.depthB2;
  if (!bs.ok) {
    return `${header(state)}<button class="back" data-action="back">‹ Now</button>
      <div class="lbl mt2">${b.noaaName} · ${b.id.toUpperCase()}</div><div class="row"><span class="dot ${b.color}"></span><span class="h2" style="font-size:2rem">${b.name}</span></div>
      <section class="card"><p class="hint">No current data available for this buoy right now. ${esc(state.errors[b.key] || '')}</p></section>`;
  }
  const h = bs.headings;
  const w = bs.wind;
  const ship = bs.ship;
  const windBox = wind ? `<div class="mt3"><span class="muted">Wind</span>&nbsp;&nbsp;<b style="font-size:1.1rem">${kn(wind.kn, 0)} kn from ${wind.card} ${deg3(wind.dir)}, gusts ${kn(wind.gust, 0)}</b>
      <div class="text2">About ${kn(bs.windCross, 0)} kn across the channel, pushing to ${sideWord(bs.windCross)}${Number.isFinite(bs.crossUsed) && Math.abs(bs.crossUsed) > 0.02 ? (Math.sign(bs.windCross) === Math.sign(bs.crossUsed) ? ', with the current' : ', against the current') : ''} · South Port station, ${hhmm(wind.t)}</div></div>` : `<p class="hint mt3">No South Port wind data right now.</p>`;
  const windResult = ship && w ? (w.lowSpeed ? `<p class="text2 mt3">Ship speed is too low for a steady leeway angle. Stopped in this wind the ${esc(ship.name)} would drift about <b>${kn(w.stoppedDriftKn, 1)} kn</b> downwind.</p>` :
    `<div class="mt3 inset bordered"><div class="row between wrap"><span class="lbl">With wind</span><span class="pill class-${ship.windClass}" style="font-size:0.7rem;padding:1px 8px">${ship.windClass} windage</span></div>
      <div class="row between mt1" style="align-items:baseline"><span class="big" style="font-size:2rem;color:var(--color-primary);white-space:nowrap">${rangeHdg(h.hdgWind, h.hdgWindGust)}</span><span class="text2">leeway ${Math.abs(w.steady.betaDeg).toFixed(1)}°${w.gust !== w.steady ? `–${Math.abs(w.gust.betaDeg).toFixed(1)}°` : ''} to ${w.pushToStarboard ? 'starboard' : 'port'}</span></div>
      <div class="muted small mt1">${esc(ship.name)}, ${ship.condition} · ${ship.al.toLocaleString()} m² lateral area · apparent wind ${kn(w.steady.app.speed, 0)} kn at ${Math.round(Math.abs(w.steady.app.gamma))}° off the ${w.steady.app.gamma >= 0 ? 'starboard' : 'port'} bow · wind adds ≈ ${kn(w.steady.leewayKn)} kn of set · shallow-water factor ×${w.shallowFactor.toFixed(2)} (h/T ${w.hOverT.toFixed(1)}) · stopped, she would drift ≈ ${kn(w.stoppedDriftKn, 1)} kn</div></div>`) : '';
  const classLegend = `<p class="text2 small mt3 windlegend"><b>High</b> cruise ships, car carriers, ferries · <b>Med</b> container, general cargo, any ship in ballast · <b>Low</b> loaded tankers, bulkers, tug and barge</p>`;

  const otherSpeeds = bs.otherSpeeds.map(o => `<tr><td>${o.speed} kn</td><td class="r"><b>${deg3(o.hdgCurrent)}</b> <span class="muted small">${crabTxt(o.crab)}</span></td>${ship && wind ? `<td class="r">${o.hdgWind != null ? rangeHdg(o.hdgWind, o.hdgWindGust) : '—'}</td>` : ''}</tr>`).join('');
  const nearSurface = bs.rt ? `<div class="kv mt3"><span class="k">Near the surface</span><span class="v">${kn(bs.rt.cross)} kn at ${Math.round(bs.rt.depthFt)} ft → steer ${deg3(bs.headingsRT.hdgCurrent)}</span></div>` : '';

  const mode = state.ui.detailMode;
  return `${header(state)}
  <div class="row between"><button class="back" data-action="back"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>Now</button>${statusPill(bs.status, ` · ${kn(bs.crossMax)} kn cross`)}</div>
  <div class="lbl mt2">${b.noaaName} · ${b.id.toUpperCase()}</div>
  <div class="row"><span class="dot ${b.color}"></span><span class="h2" style="font-size:2rem">${b.name}</span></div>
  <p class="hint">${b.place} in about ${depth} ft of water</p>

  <section class="card">
    <div class="row between"><span class="lbl lg">Heading to steer</span><span class="lbl lg">To make good ${deg3(course)}</span></div>
    <div class="lbl mt2">Current</div>
    <div class="row mt1" style="gap:16px;align-items:center"><span class="big accent" style="font-size:4.2rem">${deg3(h.hdgCurrent)}</span>
      <div><div style="font-size:1.15rem;font-weight:600">${crabTxt(h.crab)}</div><div class="muted">into ${kn(bs.crossUsed)} kn setting ${bs.crossUsedCard} at ${bs.speed} kn</div></div></div>
    <div class="inset bordered mt4">
      ${windageControl(state, true)}
      ${windBox}
      ${ship ? windResult : `<p class="hint mt2">Pick the ship type to add a wind estimate.</p>`}
      ${classLegend}
      ${ship ? `<p class="muted xs mt2">${esc(ship.note)}</p>` : ''}
    </div>
    <div class="mt4 diagram">${shipDiagram({ course, heading: h.hdgWind != null ? h.hdgWind : h.hdgCurrent, setDeg: bs.avg ? bs.avg.dir : bs.rt.d, driftKn: bs.avg ? bs.avg.speed : bs.rt.s, windFrom: wind ? wind.dir : NaN, windKn: wind ? wind.kn : 0, inbound, color: buoyColor(b) })}</div>
    <div class="legend"><span><i class="dash" style="color:var(--color-text-2)"></i>Track ${deg3(course)}</span><span><i style="color:var(--color-primary)"></i>Heading ${deg3(h.hdgWind != null ? h.hdgWind : h.hdgCurrent)}</span><span><i style="color:${buoyColor(b)}"></i>Set ${bs.crossUsedCard} ${kn(bs.crossUsed)} kn</span>${wind ? `<span><i style="color:var(--color-muted)"></i>Wind ${wind.card} ${kn(wind.kn, 0)} kn</span>` : ''}</div>
    <div class="lbl mt4">At other speeds</div>
    <table class="list mt1"><thead><tr><th>Speed</th><th class="r">Current only</th>${ship && wind ? '<th class="r">With wind</th>' : ''}</tr></thead><tbody>${otherSpeeds}</tbody></table>
    <div class="kv mt3"><span class="k">Current used</span><span class="v">${kn(bs.crossUsed)} kn setting ${bs.crossUsedCard}<span class="sub">${bs.avg ? `Average over your ${settings.draftFt} ft draft` : 'Surface (real-time) bin'}</span></span></div>
    ${nearSurface}
  </section>

  <section class="card">
    <div class="row" style="gap:20px;align-items:center;flex-wrap:wrap">
      <div class="compass-wrap">${compassRose({ setDeg: bs.rt ? bs.rt.d : bs.avg.dir, driftKn: bs.rt ? bs.rt.s : bs.avg.speed, color: buoyColor(b), ringKn: 1, size: 200, course })}</div>
      <div class="stack" style="flex:1;min-width:90px">
        <div class="stat"><div class="lbl">Drift</div><div class="v">${kn(bs.rt ? bs.rt.s : bs.avg.speed)} kn</div></div>
        <div class="stat"><div class="lbl">Set</div><div class="v">${deg3(bs.rt ? bs.rt.d : bs.avg.dir)} ${M.compass16(bs.rt ? bs.rt.d : bs.avg.dir)}</div></div>
      </div>
    </div>
    <div class="kv mt4">
      ${bs.rt ? `<span class="k">Cross at ${Math.round(bs.rt.depthFt)} ft</span><span class="v">${kn(bs.rt.cross)} kn setting ${M.crossCardinal(bs.rt.cross, course)}<span class="sub">Pushes an ${dirName(settings)} ship to ${sideWord(bs.rt.cross)}</span></span>` : ''}
      ${bs.avg ? `<span class="k">Over ${settings.draftFt} ft draft</span><span class="v">${kn(bs.avg.cross)} kn cross setting ${M.crossCardinal(bs.avg.cross, course)}<span class="sub">${kn(bs.avg.speed)} kn at ${deg3(bs.avg.dir)} · average of ${bs.avg.n} depth bins to ${settings.draftFt} ft</span></span>` : ''}
      <span class="k">Along channel</span><span class="v">${kn(bs.alongUsed)} kn ${bs.alongUsed >= 0 ? dirName(settings) : (inbound ? 'outbound' : 'inbound')}<span class="sub">${bs.alongUsed >= 0 ? 'Following current — adds to speed over ground' : 'Head current — slows speed over ground'}</span></span>
    </div>
    <p class="hint small mt3">${bs.rt ? `${hhmm(bs.rt.t)} ${zone()} · ${ago(bs.rt.t)}` : ''} · status uses the larger cross value</p>
  </section>

  <div class="seg mt4" role="tablist" aria-label="Detail mode">
    <button data-action="detailMode" data-value="profile" aria-pressed="${mode === 'profile'}">Depth profile</button>
    <button data-action="detailMode" data-value="24h" aria-pressed="${mode === '24h'}">Last 24 hours</button>
  </div>
  ${mode === 'profile' ? depthProfile(bs, settings) : last24(bs, state)}`;
}

function depthProfile(bs, settings) {
  const color = bs.buoy.color;
  const maxS = Math.max(0.3, ...bs.profile.map(p => p.s || 0));
  const rows = bs.profile.map(p => `<tr class="${p.inDraft ? 'in-draft' : ''}">
    <td>${Math.round(p.depthFt)} ft${p.num === bs.buoy.rtBin ? '<span class="rt">RT</span>' : ''}</td>
    <td class="c">${Number.isFinite(p.d) ? dirArrow(p.d, buoyColor(bs.buoy)) : ''}</td>
    <td style="width:34%"><div class="bar ${color}"><i style="width:${Number.isFinite(p.s) ? Math.min(100, (p.s / maxS) * 100) : 0}%"></i></div></td>
    <td class="r" style="white-space:nowrap">${Number.isFinite(p.s) ? `${kn(p.s)} kn ${deg3(p.d)}` : '<span class="muted">—</span>'}</td>
    <td class="r">${Number.isFinite(p.cross) ? `${kn(p.cross)} ${M.crossCardinal(p.cross, bs.course)}` : ''}</td></tr>`).join('');
  return `<section class="card"><div class="h2">Current by depth</div>
    <p class="hint">Shaded = within ${settings.draftFt} ft draft · RT = NOAA headline depth</p>
    <table class="list mt2"><thead><tr><th>Depth</th><th class="c">Set</th><th>Drift</th><th class="r">kn · °T</th><th class="r">Cross</th></tr></thead><tbody>${rows}</tbody></table>
    <p class="hint mt3">Depths below the draft update every 18 minutes.</p></section>`;
}

function last24(bs, state) {
  return `<section class="card"><div class="h2">Cross-channel · last 24 hours</div>
    <p class="hint">At ${bs.rt ? Math.round(bs.rt.depthFt) : 14} ft. Caution ${state.settings.caution.toFixed(1)} kn, limit ${state.settings.limit.toFixed(1)} kn.</p>
    <canvas class="chart mt2" id="detail24" data-buoy="${bs.buoy.key}"></canvas>
    <div class="readout mt1" id="detail24-readout">Touch and drag along the chart to read any time.</div>
    <div class="lbl mt4">Set &amp; drift</div>
    <canvas class="chart stick mt2" id="detail24stick" data-buoy="${bs.buoy.key}"></canvas>
  </section>`;
}

// ---------------------------------------------------------------------------
// HISTORY
// ---------------------------------------------------------------------------
export function historyView(state) {
  const { histMetric, histRange } = state.ui;
  const titles = { cross: 'Cross-channel current', along: 'Along-channel current', drift: 'Drift (current speed)' };
  const subs = { cross: 'Positive = setting toward starboard of the course', along: 'Positive = flowing with the ship', drift: 'Speed regardless of direction' };
  const rangeLbl = { '24h': 'Last 24 hours', '3d': 'Last 3 days', '7d': 'Last 7 days', '30d': 'Last 30 days' };
  const hist = state.history[histRange];
  const stats = hist ? STATIONS.buoys.map(b => ({ b, s: hist.stats && hist.stats[b.key] })) : [];
  return `${header(state)}
  <div class="lbl">History · ${rangeLbl[histRange]} · ${state.buoys.sea && state.buoys.sea.rt ? Math.round(state.buoys.sea.rt.depthFt) : 14} ft depth</div>
  <div class="h2 mt1" style="font-size:1.6rem">${titles[histMetric]}</div>
  <div class="seg mt3" role="tablist"><button data-action="histMetric" data-value="cross" aria-pressed="${histMetric === 'cross'}">Cross</button><button data-action="histMetric" data-value="along" aria-pressed="${histMetric === 'along'}">Along</button><button data-action="histMetric" data-value="drift" aria-pressed="${histMetric === 'drift'}">Drift</button></div>
  <div class="seg sm mt2" role="tablist">${['24h', '3d', '7d', '30d'].map(r => `<button data-action="histRange" data-value="${r}" aria-pressed="${histRange === r}">${r.toUpperCase()}</button>`).join('')}</div>
  <section class="card">
    <div class="row wrap" style="gap:16px"><span class="row"><span class="dot blue"></span>Sea Buoy</span><span class="row"><span class="dot orange"></span>Buoy 2</span><span class="muted small">${subs[histMetric]}</span></div>
    ${hist && hist.loading ? '<p class="hint mt3">Loading NOAA history…</p>' : ''}
    ${hist && hist.error ? `<p class="error mt3">${esc(hist.error)}</p>` : ''}
    <canvas class="chart tall mt3" id="histChart"></canvas>
    <div class="readout mt1" id="histReadout">Touch and drag along the chart to read any time.</div>
  </section>
  <section class="card"><div class="h2">${rangeLbl[histRange]}</div>
    ${stats.map(({ b, s }) => s ? `<div class="mt3"><div class="row"><span class="dot ${b.color}"></span><b>${b.name}</b></div>
      <div class="text2">At or over ${state.settings.caution.toFixed(1)} kn cross <b>${s.pctOver.toFixed(1)}%</b> of readings · strongest cross <b>${kn(s.strongest.cross)} kn ${M.crossCardinal(s.strongest.cross, effectiveCourse(state.settings))}</b> · ${dayTime(s.strongest.t)}</div></div>` : `<div class="mt3 hint"><span class="dot ${b.color}"></span> ${b.name}: no data</div>`).join('')}
  </section>
  <section class="card"><div class="lbl">Set &amp; drift · Sea Buoy</div><canvas class="chart stick mt2" id="stickSea"></canvas>
    <div class="lbl mt4">Set &amp; drift · Buoy 2</div><canvas class="chart stick mt2" id="stickB2"></canvas></section>
  <button class="btn block mt4" data-action="exportCsv">Export CSV</button>`;
}

// ---------------------------------------------------------------------------
// TIDE
// ---------------------------------------------------------------------------
export function tideView(state) {
  const wl = state.wl && state.wl.length ? state.wl[state.wl.length - 1] : null;
  const pred = wl ? interp(state.wlPred, wl.t.getTime()) : NaN;
  const diff = wl && Number.isFinite(pred) ? wl.v - pred : NaN;
  const tideRows = (name, hilo) => nextTides(hilo, 4).map(e => `<tr><td>${name}</td><td>${e.type === 'H' ? 'High' : 'Low'}</td><td class="r">${hhmm(e.t)}</td><td class="r">${ft(e.v)} ft</td></tr>`).join('');
  const predRows = STATIONS.predictions.map(p => {
    const r = predictionNow(state, p.id);
    if (!r) return `<div class="mt3 row between"><b>${p.name}</b><span class="muted">no prediction</span></div>`;
    return `<div class="mt3" style="display:grid;grid-template-columns:40px 1fr auto;gap:12px;align-items:center">
      <div>${dirArrow(r.dir, 'var(--color-primary)', 34)}</div>
      <div><div class="lbl">${p.name} · ${Number.isFinite(r.depthFt) ? `${Math.round(r.depthFt)} ft` : ''}</div>
        <div><b>${r.nextSlack ? `Slack ${hhmm(r.nextSlack.t)} · ${inHours(r.nextSlack.t.getTime())}` : 'No slack in window'}</b></div>
        <div class="muted small">${r.nextMax ? `Then max ${r.nextMax.type} ${kn(r.nextMax.v, 1)} kn at ${hhmm(r.nextMax.t)}` : ''}</div></div>
      <div style="text-align:right"><div class="lbl">${r.phase}</div><div class="stat"><span class="v" style="font-size:1.5rem">${kn(r.v, 1)} kn</span></div><div class="muted small">${M.compass16(r.dir)} ${deg3(r.dir)}</div></div>
    </div>`;
  }).join('');
  return `${header(state)}
  <section class="card"><div class="row between"><span class="lbl lg">Water level · South Port</span><span class="lbl">MLLW</span></div>
    <div class="row mt2" style="gap:16px;align-items:baseline"><span class="big">${wl ? ft(wl.v) : '—'} <span style="font-size:1.2rem;font-weight:500;color:var(--color-text-2)">ft MLLW</span></span></div>
    <div class="text2">${Number.isFinite(diff) ? `${ft(Math.abs(diff))} ft ${diff >= 0 ? 'above' : 'below'} predicted` : ''} ${wl ? `· ${hhmm(wl.t)} ${zone()}` : ''}</div>
    <canvas class="chart mt3" id="tideChart"></canvas>
    <div class="legend"><span><i style="color:var(--color-primary)"></i>Observed</span><span><i class="dash" style="color:var(--color-muted)"></i>Predicted</span></div>
  </section>
  <section class="card"><div class="h2">Next tides</div>
    <table class="list mt2"><thead><tr><th>Station</th><th></th><th class="r">Time</th><th class="r">Height</th></tr></thead><tbody>${tideRows('South Port', state.hilo.south)}${tideRows('Turning Basin', state.hilo.tb)}</tbody></table>
  </section>
  <section class="card"><div class="row between"><span class="h2">Currents inside the port</span><span class="pill plain">Predicted</span></div>${predRows}
    <div class="lbl mt4">Next 24 hours</div>
    ${STATIONS.predictions.map(p => `<div class="mt3"><div class="row between"><span class="text2">${p.name}</span><span class="muted small">${state.preds[p.id] && state.preds[p.id].series.length ? `${Math.round(state.preds[p.id].series[0].depthFt)} ft` : ''}</span></div><canvas class="chart short mt1" id="pred-${p.id}"></canvas></div>`).join('')}
    <p class="hint small mt3">Flood is above each line and ebb below; dots mark slack water. NOAA predictions for 4 to 9 ft below the surface, fetched once a day.</p>
  </section>
  <section class="card grid2">
    <div class="stat"><div class="lbl">Pressure</div><div class="v">${state.met.pressure ? `${state.met.pressure.v.toFixed(1)} mb` : '—'}</div><div class="s">${state.met.pressure ? hhmm(state.met.pressure.t) : ''}</div></div>
    <div class="stat"><div class="lbl">Water temp</div><div class="v">${state.met.wtemp ? `${state.met.wtemp.v.toFixed(1)} °F` : '—'}</div><div class="s">${state.met.atemp ? `Air ${state.met.atemp.v.toFixed(1)} °F` : ''}</div></div>
  </section>
  <p class="hint small mt3">Waves: NDBC buoy 41122 (Hollywood Beach) does not allow direct browser reads. Open <a href="https://www.ndbc.noaa.gov/station_page.php?station=41122" target="_blank" rel="noopener noreferrer">NDBC 41122</a> for the latest sea state.</p>`;
}

// ---------------------------------------------------------------------------
// SETTINGS
// ---------------------------------------------------------------------------
export function settingsView(state) {
  const s = state.settings;
  const persistent = state.persistent !== false;
  const f = (key, label, unit, step = 1, note = '') => `<div class="field"><div><label for="set-${key}">${label}</label>${note ? `<div class="note">${note}</div>` : ''}</div><div class="row"><input id="set-${key}" type="number" inputmode="decimal" step="${step}" value="${s[key]}" data-setting="${key}"><span class="unit">${unit}</span></div></div>`;
  const fc = (key, label, unit, step = 1) => `<div class="field"><label for="setc-${key}">${label}</label><div class="row"><input id="setc-${key}" type="number" inputmode="decimal" step="${step}" value="${s.custom[key]}" data-custom="${key}"><span class="unit">${unit}</span></div></div>`;
  return `${header(state)}
  <p class="hint">${persistent ? 'Saved on this phone. Values you leave alone follow the team defaults.' : 'Preview build: settings reset when the page reloads. The released app saves them on this phone.'}</p>
  <section class="card"><div class="lbl lg">Channel &amp; vessel</div>
    <div class="field"><label>Transit</label><div class="seg sm" style="min-width:200px"><button data-setting="direction" data-value="inbound" aria-pressed="${s.direction !== 'outbound'}">Inbound</button><button data-setting="direction" data-value="outbound" aria-pressed="${s.direction === 'outbound'}">Outbound</button></div></div>
    ${f('course', 'Inbound course', '°T', 1, s.direction === 'outbound' ? `Outbound uses the reciprocal, ${deg3(s.course + 180)}` : '')}
    ${f('draftFt', 'Vessel draft', 'ft', 1, 'Sets which depth bins are averaged and the wind model draft')}
  </section>
  <section class="card"><div class="lbl lg">${s.direction === 'outbound' ? 'Outbound' : 'Inbound'} speed</div>
    ${f('speedSea', 'At the Sea Buoy', 'kn')}
    ${f('speedB2', 'At Buoy 2', 'kn')}
    <p class="hint small mt2">Speed through the water. The crab angle is asin(cross current ÷ speed); the wind leeway also falls as speed rises.</p>
  </section>
  <section class="card"><div class="lbl lg">Cross-channel status</div>
    ${f('caution', 'Caution at', 'kn', 0.1)}
    ${f('limit', 'Limit at', 'kn', 0.1)}
    <p class="hint small mt2">Placeholders, not port rules. PIANC 2014 lists 1 m/s (≈2 kn) cross current and 15 m/s (≈29 kn) wind as typical design limits for channel use; set these to whatever your pilot group agrees.</p>
  </section>
  <section class="card"><div class="lbl lg">Wind model</div>
    ${f('depthSea', 'Water depth at Sea Buoy', 'ft', 1, 'Used for the shallow-water factor')}
    ${f('depthB2', 'Water depth at Buoy 2', 'ft')}
    ${f('windGain', 'Wind gain', '×', 0.05, 'Scales the South Port wind before the leeway estimate (exposure / height correction). 1.0 = as reported.')}
    <div class="lbl mt4">Custom ship</div>
    ${fc('lpp', 'Length between perpendiculars', 'm')}
    ${fc('beam', 'Beam', 'm', 0.1)}
    ${fc('cb', 'Block coefficient', '', 0.01)}
    ${fc('alLoaded', 'Lateral wind area, loaded', 'm²', 50)}
    ${fc('alBallast', 'Lateral wind area, ballast', 'm²', 50)}
  </section>
  <section class="card"><div class="lbl lg">Display</div>
    <div class="seg mt2"><button data-setting="theme" data-value="auto" aria-pressed="${s.theme === 'auto'}">Auto</button><button data-setting="theme" data-value="day" aria-pressed="${s.theme === 'day'}">Day</button><button data-setting="theme" data-value="night" aria-pressed="${s.theme === 'night'}">Night</button></div>
    <button class="btn block mt4" data-action="resetSettings">Reset to team defaults</button>
  </section>
  <section class="card"><div class="lbl lg">Ship windage presets</div>
    <p class="hint small mt2">Lateral wind areas from the Trelleborg fender design manual ship tables and Thoresen's Port Designer's Handbook (Oasis class). Coefficients from Blendermann (1994).</p>
    <table class="list mt2"><thead><tr><th>Ship</th><th class="r">Loaded m²</th><th class="r">Ballast m²</th><th class="r">Class</th></tr></thead><tbody>
    ${SHIP_PRESETS.filter(p => !p.custom).map(p => `<tr><td style="font-size:1rem">${esc(p.name)}${p.estimated ? ' <span class="muted xs">est.</span>' : ''}</td><td class="r" style="font-size:1rem">${p.al.loaded.toLocaleString()}</td><td class="r" style="font-size:1rem">${p.hasBallast ? p.al.ballast.toLocaleString() : '—'}</td><td class="r" style="font-size:1rem">${p.windClass}</td></tr>`).join('')}
    </tbody></table>
  </section>
  <section class="card"><div class="lbl lg">About the data</div>
    <ul role="list" class="mt2 stack">
      <li><a href="https://tidesandcurrents.noaa.gov/ports/index.html?port=pe" target="_blank" rel="noopener noreferrer">NOAA PORTS — Port Everglades</a></li>
      <li><a href="https://tidesandcurrents.noaa.gov/stationhome.html?id=8722956" target="_blank" rel="noopener noreferrer">South Port Everglades station 8722956</a> (wind, water level, pressure, temperature)</li>
      <li><a href="https://tidesandcurrents.noaa.gov/cdata/StationInfo?id=pe0101" target="_blank" rel="noopener noreferrer">Sea Buoy current meter PE0101</a> · <a href="https://tidesandcurrents.noaa.gov/cdata/StationInfo?id=pe0201" target="_blank" rel="noopener noreferrer">Buoy 2 current meter PE0201</a></li>
      <li><a href="https://www.ndbc.noaa.gov/station_page.php?station=41122" target="_blank" rel="noopener noreferrer">Wave buoy 41122</a></li>
    </ul>
    <div class="text2 small mt4 stack">
      <p><b>Set</b> is the direction the water flows toward. Cross is the part of the current across your course; along is the part with or against you. Positive cross on the history chart means setting toward the starboard side of the course.</p>
      <p><b>Heading to steer</b> uses sin(crab) = cross current ÷ speed. The current used is the vector average of the depth bins within your draft.</p>
      <p><b>Wind estimate.</b> True wind from South Port is combined with your speed to get the apparent wind. The side force on the ship's lateral wind area (Blendermann 1994 coefficients for the chosen ship type) is balanced against the hull's sway force at a small drift angle (Clarke 1983 linear derivative plus a crossflow drag term), with Clarke's shallow-water correction for the water depth at each buoy. The result is the leeway angle you must add to the crab. Treat it as rough — it ignores wind yaw moment, waves, rudder-induced drift and the exposure of the South Port anemometer.</p>
      <p><b>ADCP data.</b> Each buoy reports every 6 minutes in 1 m depth bins from about 11 ft down. NOAA's headline value is the 14 ft bin ("RT"). In-port currents are NOAA predictions fetched once a day.</p>
    </div>
  </section>
  <p class="hint xs mt4">Prototype — not an operating rule, not a certified navigation system.</p>`;
}

export function tabBar(tab) {
  const t = (id, label, icon) => `<button role="tab" aria-selected="${tab === id}" data-action="tab" data-value="${id}">${icon}<span>${label}</span></button>`;
  const ic = {
    now: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="16.2 7.8 14.1 14.1 7.8 16.2 9.9 9.9 16.2 7.8"/></svg>',
    history: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 15l4-5 3 3 5-7"/></svg>',
    tide: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 8c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/><path d="M2 13c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/><path d="M2 18c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/></svg>',
    settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="18" cy="18" r="2"/></svg>',
  };
  return `<nav class="tabs" role="tablist">${t('now', 'Now', ic.now)}${t('history', 'History', ic.history)}${t('tide', 'Tide', ic.tide)}${t('settings', 'Settings', ic.settings)}</nav>`;
}
