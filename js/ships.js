// Ship-type windage presets for the wind-leeway estimate.
// Lateral wind areas (A_L, m²) come from published design tables:
//  - Trelleborg Marine Fender Application Design Manual, ship tables (min lateral windage
//    fully loaded / max lateral windage in ballast).
//  - Thoresen, Port Designer's Handbook (Oasis/Allure of the Seas measured 15,764 m² lateral, 3,354 m² frontal).
//  - PIANC Report 121 (2014) Table 2-3 / Akakura & Takahashi (1998) regression A = a·X^b as a cross-check.
// Aerodynamic coefficients: Blendermann (1994) "Parameter identification of wind loads on ships",
// as tabulated in Fossen's MSS blendermann94.m: [CDt, CDl_AF(bow), CDl_AF(stern), delta, kappa].
//
// Frontal areas (A_F) are approximations from the A_F/A_L ratio typical of each type
// (Oasis measured ratio 0.21). They only enter the small Blendermann cross-coupling term.

export const BLENDERMANN = {
  carCarrier:   { CDt: 0.95, CDlBow: 0.55, CDlStern: 0.60, delta: 0.80, label: 'car carrier' },
  cargoLoaded:  { CDt: 0.85, CDlBow: 0.65, CDlStern: 0.55, delta: 0.40, label: 'cargo vessel, loaded' },
  cargoBoxes:   { CDt: 0.85, CDlBow: 0.55, CDlStern: 0.50, delta: 0.40, label: 'cargo vessel, containers on deck' },
  container:    { CDt: 0.90, CDlBow: 0.55, CDlStern: 0.55, delta: 0.40, label: 'container ship, loaded' },
  ferry:        { CDt: 0.90, CDlBow: 0.45, CDlStern: 0.50, delta: 0.80, label: 'ferry' },
  lng:          { CDt: 0.70, CDlBow: 0.60, CDlStern: 0.65, delta: 0.50, label: 'LNG tanker' },
  passenger:    { CDt: 0.90, CDlBow: 0.40, CDlStern: 0.40, delta: 0.80, label: 'passenger liner' },
  tankerLoaded: { CDt: 0.70, CDlBow: 0.90, CDlStern: 0.55, delta: 0.40, label: 'tanker, loaded' },
  tankerBallast:{ CDt: 0.70, CDlBow: 0.75, CDlStern: 0.55, delta: 0.40, label: 'tanker, in ballast' },
};

// windClass: HIGH / MED / LOW is the pilot shorthand kept from the original app.
export const SHIP_PRESETS = [
  {
    id: 'cruise_xl', group: 'Cruise ships', windClass: 'HIGH',
    name: 'Cruise · Oasis / Icon class (~225k GT)',
    loa: 360, lpp: 333, beam: 47, draftM: 9.3, cb: 0.67,
    al: { loaded: 15750, ballast: 15750 }, afRatio: 0.21, aero: 'passenger',
    hasBallast: false,
    note: 'Measured 15,764 m² lateral / 3,354 m² frontal for Oasis of the Seas (Thoresen); Trelleborg 220k GT row 15,700 m².',
  },
  {
    id: 'cruise_l', group: 'Cruise ships', windClass: 'HIGH',
    name: 'Cruise · large (~140–160k GT)',
    loa: 339, lpp: 313.6, beam: 43.7, draftM: 9.0, cb: 0.66,
    al: { loaded: 13800, ballast: 13800 }, afRatio: 0.21, aero: 'passenger',
    hasBallast: false,
    note: 'Trelleborg cruise liner (post-Panamax) 160,000 GT row: 13,800 m².',
  },
  {
    id: 'cruise_m', group: 'Cruise ships', windClass: 'HIGH',
    name: 'Cruise · mid-size (~90–115k GT)',
    loa: 313.4, lpp: 290, beam: 36, draftM: 8.6, cb: 0.66,
    al: { loaded: 11950, ballast: 11950 }, afRatio: 0.21, aero: 'passenger',
    hasBallast: false,
    note: 'Trelleborg cruise liner 115,000 GT row: 11,950 m².',
  },
  {
    id: 'cruise_s', group: 'Cruise ships', windClass: 'HIGH',
    name: 'Cruise · small (~50k GT)',
    loa: 232, lpp: 212, beam: 28, draftM: 7.4, cb: 0.64,
    al: { loaded: 6850, ballast: 6850 }, afRatio: 0.21, aero: 'passenger',
    hasBallast: false,
    note: 'Trelleborg cruise liner (Panamax) 50,000 GT row: 6,850 m².',
  },
  {
    id: 'pctc', group: 'Ro-ro', windClass: 'HIGH',
    name: 'Car carrier · PCTC ~6,000 CEU',
    loa: 205, lpp: 189, beam: 32.2, draftM: 10.9, cb: 0.62,
    al: { loaded: 4850, ballast: 5800 }, afRatio: 0.22, aero: 'carCarrier',
    hasBallast: true,
    note: 'Trelleborg car carrier 57,000 DWT row: 4,850 m² loaded / 5,800 m² ballast.',
  },
  {
    id: 'pctc_l', group: 'Ro-ro', windClass: 'HIGH',
    name: 'Car carrier · PCTC ~8,000 CEU',
    loa: 228, lpp: 210, beam: 32.2, draftM: 11.3, cb: 0.66,
    al: { loaded: 5700, ballast: 6900 }, afRatio: 0.22, aero: 'carCarrier',
    hasBallast: true,
    note: 'Trelleborg car carrier 70,000 DWT row: 5,700 m² loaded / 6,900 m² ballast.',
  },
  {
    id: 'roro', group: 'Ro-ro', windClass: 'HIGH',
    name: 'Ro-ro freight / ferry (~30k DWT)',
    loa: 253, lpp: 237, beam: 36.4, draftM: 8.8, cb: 0.65,
    al: { loaded: 4300, ballast: 4500 }, afRatio: 0.20, aero: 'ferry',
    hasBallast: true,
    note: 'Trelleborg conventional ferry 30,000 DWT row: 4,300 / 4,500 m² (freight ro-ro 30k DWT row is 5,100 / 5,300 m²).',
  },
  {
    id: 'cont_pp', group: 'Container ships', windClass: 'MED',
    name: 'Container · post-Panamax ~8,000 TEU',
    loa: 340, lpp: 323, beam: 43.2, draftM: 14.5, cb: 0.70,
    al: { loaded: 7200, ballast: 7800 }, afRatio: 0.20, aero: 'container',
    hasBallast: true,
    note: 'Trelleborg container 110,000 DWT row: 7,200 m² loaded / 7,800 m² ballast (deck stack assumed).',
  },
  {
    id: 'cont_pmx', group: 'Container ships', windClass: 'MED',
    name: 'Container · Panamax ~4,000 TEU',
    loa: 267, lpp: 253, beam: 32.2, draftM: 12.5, cb: 0.65,
    al: { loaded: 4500, ballast: 4700 }, afRatio: 0.20, aero: 'container',
    hasBallast: true,
    note: 'Trelleborg container 50,000 DWT row: 4,500 m² loaded / 4,700 m² ballast.',
  },
  {
    id: 'cont_feeder', group: 'Container ships', windClass: 'MED',
    name: 'Container · feeder ~1,000 TEU',
    loa: 153, lpp: 145, beam: 23.4, draftM: 7.4, cb: 0.71,
    al: { loaded: 3100, ballast: 3200 }, afRatio: 0.20, aero: 'cargoBoxes',
    hasBallast: true,
    note: 'Trelleborg 10,000 DWT / 1,000 TEU row: 3,100 / 3,200 m².',
  },
  {
    id: 'gencargo', group: 'Cargo', windClass: 'MED',
    name: 'General cargo · ~20k DWT',
    loa: 166, lpp: 158, beam: 24.8, draftM: 10.0, cb: 0.70,
    al: { loaded: 2100, ballast: 2800 }, afRatio: 0.25, aero: 'cargoLoaded',
    hasBallast: true,
    note: 'Trelleborg general cargo 20,000 DWT row: 2,100 m² loaded / 2,800 m² ballast.',
  },
  {
    id: 'tanker_mr', group: 'Tankers & bulkers', windClass: 'LOW',
    name: 'Product tanker · MR ~50k DWT',
    loa: 183, lpp: 174, beam: 32.2, draftM: 12.2, cb: 0.80,
    al: { loaded: 1900, ballast: 3000 }, afRatio: 0.30, aero: 'tankerLoaded', aeroBallast: 'tankerBallast',
    hasBallast: true,
    note: 'Trelleborg product tanker 50,000 DWT row: 1,900 m² loaded / 3,000 m² ballast. Ballast raises windage class to MED.',
  },
  {
    id: 'tanker_lr1', group: 'Tankers & bulkers', windClass: 'LOW',
    name: 'Tanker · LR1 / Panamax ~75k DWT',
    loa: 228, lpp: 219, beam: 32.2, draftM: 14.0, cb: 0.83,
    al: { loaded: 2350, ballast: 3850 }, afRatio: 0.30, aero: 'tankerLoaded', aeroBallast: 'tankerBallast',
    hasBallast: true,
    note: 'Interpolated between Trelleborg 60k (2,150 / 3,500) and 80k DWT (2,450 / 4,000) tanker rows.',
  },
  {
    id: 'tanker_afra', group: 'Tankers & bulkers', windClass: 'LOW',
    name: 'Tanker · Aframax ~100k DWT',
    loa: 250, lpp: 239, beam: 44, draftM: 15.0, cb: 0.83,
    al: { loaded: 2750, ballast: 4500 }, afRatio: 0.30, aero: 'tankerLoaded', aeroBallast: 'tankerBallast',
    hasBallast: true,
    note: 'Trelleborg tanker 100,000 DWT row: 2,750 m² loaded / 4,500 m² ballast.',
  },
  {
    id: 'bulk_pmx', group: 'Tankers & bulkers', windClass: 'LOW',
    name: 'Bulk carrier · Panamax ~60k DWT',
    loa: 220, lpp: 210, beam: 33.5, draftM: 12.8, cb: 0.84,
    al: { loaded: 2050, ballast: 3500 }, afRatio: 0.30, aero: 'cargoLoaded',
    hasBallast: true,
    note: 'Trelleborg bulk carrier 60,000 DWT row: 2,050 m² loaded / 3,500 m² ballast.',
  },
  {
    id: 'atb', group: 'Tankers & bulkers', windClass: 'LOW',
    name: 'Tug & petroleum barge (ATB, ~185 m)',
    loa: 185, lpp: 175, beam: 24, draftM: 9.0, cb: 0.90,
    al: { loaded: 900, ballast: 1700 }, afRatio: 0.35, aero: 'tankerLoaded', aeroBallast: 'tankerBallast',
    hasBallast: true, estimated: true,
    note: 'No published table row; estimate from barge length × freeboard plus tug house. Treat as a placeholder until measured.',
  },
  {
    id: 'custom', group: 'Custom', windClass: 'MED',
    name: 'Custom ship (enter areas in Settings)',
    loa: 250, lpp: 235, beam: 35, draftM: 10, cb: 0.70,
    al: { loaded: 6000, ballast: 6500 }, afRatio: 0.22, aero: 'cargoLoaded',
    hasBallast: true, custom: true,
    note: 'Values come from Settings → Custom ship.',
  },
];

// Pilot shorthand classes kept from the original app, mapped to representative presets.
export const QUICK_CLASSES = [
  { id: 'LOW',  presetId: 'tanker_mr',  condition: 'loaded', hint: 'loaded tankers, bulkers, tug and barge' },
  { id: 'MED',  presetId: 'cont_pmx',   condition: 'loaded', hint: 'container, general cargo, any ship in ballast' },
  { id: 'HIGH', presetId: 'cruise_m',   condition: 'loaded', hint: 'cruise ships, car carriers, ferries' },
];

export function getPreset(id) {
  return SHIP_PRESETS.find(p => p.id === id) || null;
}

/** Resolve a preset + condition (+ custom overrides) into the numbers the wind model needs. */
export function resolveShip(presetId, condition, custom) {
  const p = getPreset(presetId);
  if (!p) return null;
  const cond = p.hasBallast && condition === 'ballast' ? 'ballast' : 'loaded';
  let ship = {
    id: p.id, name: p.name, group: p.group, windClass: p.windClass, condition: cond,
    lpp: p.lpp, loa: p.loa, beam: p.beam, cb: p.cb,
    al: p.al[cond], af: Math.round(p.al[cond] * p.afRatio),
    aero: BLENDERMANN[(cond === 'ballast' && p.aeroBallast) ? p.aeroBallast : p.aero],
    estimated: !!p.estimated, note: p.note,
  };
  if (p.custom && custom) {
    ship = {
      ...ship,
      lpp: +custom.lpp || ship.lpp, beam: +custom.beam || ship.beam, cb: +custom.cb || ship.cb,
      al: +(cond === 'ballast' ? custom.alBallast : custom.alLoaded) || ship.al,
    };
    ship.af = Math.round(ship.al * p.afRatio);
  }
  if (cond === 'ballast' && p.windClass === 'LOW') ship.windClass = 'MED';
  return ship;
}
