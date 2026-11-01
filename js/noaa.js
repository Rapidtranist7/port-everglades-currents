// NOAA CO-OPS data access (public API, CORS-enabled). All times requested in GMT and shown in port time (see time.js).
const API = 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter';

export const STATIONS = {
  buoys: [
    { id: 'pe0101', key: 'sea', name: 'Sea Buoy', noaaName: 'LB PE', color: 'blue',
      place: 'Outside the entrance', depthFt: 118, rtBin: 2, lat: 26.0918, lon: -80.0794 },
    { id: 'pe0201', key: 'b2', name: 'Buoy 2', noaaName: 'LB 2', color: 'orange',
      place: 'At the channel entrance', depthFt: 55, rtBin: 2, lat: 26.0949, lon: -80.0903 },
  ],
  met: { id: '8722956', name: 'South Port Everglades' },
  tideSecondary: { id: '8722951', name: 'Turning Basin' },
  predictions: [
    { id: 'PEV0901', name: 'Entrance' },
    { id: 'PEV0902', name: 'Turning Basin' },
    { id: 'PEV0903', name: '17th St Bridge' },
    { id: 'PEV0905', name: 'South Port' },
  ],
};

const pad = n => String(n).padStart(2, '0');
export function fmtApiDate(d) {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}
/** Parse NOAA "YYYY-MM-DD HH:MM" (requested in GMT) as a UTC instant. */
export function parseT(t) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(t);
  if (!m) return new Date(t);
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]));
}

async function getJSON(params, { timeout = 20000 } = {}) {
  const url = `${API}?${new URLSearchParams({ application: 'PortEvergladesCurrents', format: 'json', time_zone: 'gmt', units: 'english', ...params })}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = await res.json();
    if (j.error) throw new Error(j.error.message || 'NOAA error');
    return j;
  } finally { clearTimeout(timer); }
}

const num = v => (v === '' || v == null ? NaN : +v);

/** Currents for one station/bin. Returns [{t: Date, s, d, b}] */
export async function fetchCurrents(station, bin, rangeOpts) {
  const j = await getJSON({ product: 'currents', station, bin, ...rangeOpts });
  return (j.data || []).map(r => ({ t: parseT(r.t), s: num(r.s), d: num(r.d), b: +r.b })).filter(r => Number.isFinite(r.s));
}

export async function fetchBins(station) {
  const res = await fetch(`https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations/${station}/bins.json?units=english`);
  const j = await res.json();
  const bins = (j.bins || []).map(b => ({ num: +b.num, depthFt: +b.depth }));
  return { bins, rtBin: j.real_time_bin ? +j.real_time_bin : 2 };
}

export async function fetchWind(range = 24) {
  const j = await getJSON({ product: 'wind', station: STATIONS.met.id, range });
  return (j.data || []).map(r => ({ t: parseT(r.t), s: num(r.s), d: num(r.d), dr: r.dr, g: num(r.g) })).filter(r => Number.isFinite(r.s));
}

export async function fetchLatest(product) {
  const j = await getJSON({ product, station: STATIONS.met.id, date: 'latest', datum: 'MLLW' });
  const r = (j.data || [])[0];
  return r ? { t: parseT(r.t), v: num(r.v) } : null;
}

export async function fetchWaterLevel(range = 24) {
  const j = await getJSON({ product: 'water_level', station: STATIONS.met.id, datum: 'MLLW', range });
  return (j.data || []).map(r => ({ t: parseT(r.t), v: num(r.v) })).filter(r => Number.isFinite(r.v));
}

export async function fetchTidePredictions(station, begin, end, interval = '6') {
  const j = await getJSON({ product: 'predictions', station, datum: 'MLLW', interval,
    begin_date: fmtApiDate(begin), end_date: fmtApiDate(end) });
  return (j.predictions || []).map(r => ({ t: parseT(r.t), v: num(r.v), type: r.type })).filter(r => Number.isFinite(r.v));
}

/** Current predictions. interval 'MAX_SLACK' → events; '30' → regular series. */
export async function fetchCurrentPredictions(station, begin, end, interval) {
  const j = await getJSON({ product: 'currents_predictions', station, interval,
    begin_date: fmtApiDate(begin), end_date: fmtApiDate(end) });
  const cp = j.current_predictions && j.current_predictions.cp ? j.current_predictions.cp : [];
  return cp.map(r => ({
    t: parseT(r.Time), type: r.Type ? r.Type.toLowerCase() : null,
    v: num(r.Velocity_Major), dir: num(r.Direction), speed: num(r.Speed),
    floodDir: num(r.meanFloodDir), ebbDir: num(r.meanEbbDir), bin: r.Bin, depthFt: num(r.Depth),
  }));
}
