// Settings persistence. Uses the browser's local storage when available (Netlify / home-screen app),
// falls back to in-memory values otherwise. The in-app note "Saved on this phone" depends on this.
const mem = {};
export const PERSISTENT = (() => { try { const k = '__pe_t'; window.localStorage.setItem(k, '1'); window.localStorage.removeItem(k); return true; } catch { return false; } })();
export const store = {
  get(k) { try { const v = window.localStorage.getItem(k); return v == null ? mem[k] : JSON.parse(v); } catch { return mem[k]; } },
  set(k, v) { mem[k] = v; try { window.localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};
