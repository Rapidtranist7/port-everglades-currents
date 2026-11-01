# Port Everglades Currents

Static, no-build web app (vanilla JS modules) that reads NOAA CO-OPS PORTS data for Port Everglades:

- Sea Buoy (PE0101) and Buoy 2 (PE0201) ADCP currents by depth, cross/along-channel components, heading to steer
- Wind leeway estimate by ship type (lateral windage presets from published design tables, Blendermann 1994 coefficients, Clarke 1983 shallow-water correction)
- In-port current predictions (PEV0901–PEV0905), South Port water level, tides, pressure, temperature
- 24 h / 3 d / 7 d / 30 d history with CSV export

Deploy anywhere that serves static files. `netlify.toml` is included: publish directory = repo root, no build command.

Netlify via GitHub: Add new project → Import an existing project → GitHub → `port-everglades-currents` → branch `master` → Deploy. Every push to `master` redeploys. Add to the phone's home screen for the full-screen (PWA) layout.

Prototype for situational awareness — not an operating rule or a certified navigation system.
