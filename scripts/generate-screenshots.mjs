import puppeteer from "puppeteer";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, "..", "public", "screenshots");

const SHARED_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

  * { margin: 0; padding: 0; box-sizing: border-box; }

  :root {
    --bg: oklch(0.13 0 0);
    --card: oklch(0.17 0 0);
    --fg: oklch(0.95 0 0);
    --muted: oklch(0.65 0 0);
    --primary: oklch(0.848 0.173 86.06);
    --border: rgba(255,255,255,0.10);
    --border-subtle: rgba(255,255,255,0.06);
    --accent: oklch(0.22 0 0);
  }

  body {
    font-family: 'Inter', -apple-system, sans-serif;
    background: var(--bg);
    color: var(--fg);
    -webkit-font-smoothing: antialiased;
  }
`;

// ─── Dashboard Screenshot ────────────────────────────────────
const dashboardHTML = `<!DOCTYPE html>
<html><head><style>
${SHARED_STYLES}

.container { width: 1440px; height: 900px; display: flex; overflow: hidden; }

/* Sidebar */
.sidebar {
  width: 60px; background: oklch(0.11 0 0); border-right: 1px solid var(--border-subtle);
  display: flex; flex-direction: column; align-items: center; padding: 16px 0; gap: 8px;
  flex-shrink: 0;
}
.sidebar-brand {
  width: 36px; height: 36px; border-radius: 10px; background: var(--primary);
  display: flex; align-items: center; justify-content: center; margin-bottom: 16px;
  font-weight: 700; font-size: 16px; color: oklch(0.15 0 0);
}
.sidebar-btn {
  width: 40px; height: 40px; border-radius: 8px; display: flex; align-items: center; justify-content: center;
  color: var(--muted); cursor: pointer;
}
.sidebar-btn.active { background: var(--accent); color: var(--fg); }
.sidebar-btn svg { width: 18px; height: 18px; stroke: currentColor; fill: none; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.sidebar-spacer { flex: 1; }
.sidebar-add {
  width: 40px; height: 40px; border-radius: 8px; background: var(--primary); color: oklch(0.15 0 0);
  display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: 600;
}
.sidebar-avatar {
  width: 32px; height: 32px; border-radius: 50%; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  margin-top: 8px;
}

/* Map */
.map-area {
  flex: 1; position: relative;
  background:
    radial-gradient(ellipse at 60% 40%, oklch(0.18 0.03 220) 0%, transparent 60%),
    radial-gradient(ellipse at 30% 70%, oklch(0.16 0.02 200) 0%, transparent 50%),
    linear-gradient(180deg, oklch(0.14 0.01 220) 0%, oklch(0.11 0.01 210) 100%);
}

/* Fake map grid lines */
.map-grid {
  position: absolute; inset: 0;
  background-image:
    linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px);
  background-size: 80px 80px;
}

/* Coastline */
.coastline {
  position: absolute; inset: 0; overflow: hidden;
}
.coastline::before {
  content: '';
  position: absolute;
  top: -20%; right: -10%; width: 70%; height: 140%;
  background: oklch(0.12 0.02 200);
  border-radius: 40% 0 0 60%;
  transform: rotate(-5deg);
}
.coastline::after {
  content: '';
  position: absolute;
  top: 10%; right: 15%; width: 50%; height: 80%;
  background: oklch(0.10 0.015 210);
  border-radius: 50% 20% 30% 40%;
  opacity: 0.6;
}

/* Spot markers */
.marker {
  position: absolute; z-index: 5; cursor: pointer;
  display: flex; flex-direction: column; align-items: center;
}
.marker-pin {
  width: 32px; height: 32px; color: var(--primary); filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));
}
.marker-pin svg { width: 100%; height: 100%; }
.marker.selected .marker-pin { transform: scale(1.25); }
.marker.selected::before {
  content: ''; position: absolute; top: -4px; left: 50%; transform: translateX(-50%);
  width: 40px; height: 40px; border-radius: 50%; background: rgba(218, 185, 78, 0.15);
}
.marker-alert {
  position: absolute; top: -2px; right: -2px; width: 10px; height: 10px;
  border-radius: 50%; background: #ef4444; border: 2px solid var(--bg);
}
.marker-shared .marker-pin { color: #3b82f6; }

/* Spot detail pane */
.spot-pane {
  position: absolute; top: 0; left: 60px; bottom: 0; width: 420px;
  background: rgba(13,13,13,0.92); backdrop-filter: blur(16px);
  border-right: 1px solid var(--border-subtle); z-index: 10;
  display: flex; flex-direction: column; overflow: hidden;
}
.spot-pane-abs { left: 0; }
.pane-header {
  padding: 16px; border-bottom: 1px solid var(--border-subtle);
  display: flex; justify-content: space-between; align-items: flex-start;
}
.pane-title { font-size: 20px; font-weight: 700; }
.pane-coords { font-size: 12px; color: var(--muted); margin-top: 4px; }
.pane-sessions { padding: 8px 16px 12px; font-size: 13px; color: var(--muted); border-bottom: 1px solid var(--border-subtle); }
.pane-close {
  width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center;
  color: var(--muted); background: transparent; border: none; font-size: 18px; cursor: pointer;
}
.pane-body { flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 16px; }

/* Alert card */
.alert-card {
  border: 1px solid rgba(218, 185, 78, 0.3); background: rgba(218, 185, 78, 0.04);
  border-radius: 12px; padding: 14px;
}
.alert-badge {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 12px; font-weight: 600; color: var(--primary); margin-bottom: 8px;
}
.alert-badge svg { width: 14px; height: 14px; stroke: currentColor; fill: none; stroke-width: 2; }
.alert-score {
  display: flex; align-items: center; gap: 8px; margin-bottom: 6px;
}
.score-ring {
  width: 28px; height: 28px; position: relative;
}
.score-ring svg { width: 100%; height: 100%; transform: rotate(-90deg); }
.score-ring circle { fill: none; stroke-width: 3; }
.score-ring .bg { stroke: rgba(255,255,255,0.08); }
.score-ring .fg { stroke: var(--primary); stroke-dasharray: 75.4; stroke-dashoffset: 13.2; stroke-linecap: round; }
.alert-day { font-size: 14px; font-weight: 600; }
.alert-time { font-size: 12px; color: var(--muted); }
.alert-conditions { font-size: 13px; color: var(--muted); margin-top: 6px; line-height: 1.5; }

/* Forecast scores */
.forecast-section { }
.forecast-title {
  font-size: 14px; font-weight: 600; padding: 0 4px; margin-bottom: 10px;
  display: flex; justify-content: space-between; align-items: baseline;
}
.forecast-note { font-size: 11px; color: var(--muted); font-weight: 400; }
.forecast-day {
  border: 1px solid var(--border-subtle); border-radius: 10px; padding: 10px 12px;
  margin-bottom: 6px; background: rgba(255,255,255,0.015);
}
.forecast-day-header {
  display: flex; justify-content: space-between; align-items: center;
}
.forecast-day-name { font-size: 13px; font-weight: 600; }
.forecast-pills { display: flex; gap: 4px; }
.fpill {
  padding: 2px 8px; border-radius: 6px; font-size: 11px; font-weight: 600;
}
.fpill.high { background: rgba(218, 185, 78, 0.15); color: var(--primary); }
.fpill.mid { background: rgba(234, 179, 8, 0.12); color: #ca8a04; }
.fpill.low { background: rgba(255,255,255,0.06); color: var(--muted); }
.forecast-best { font-size: 11px; color: var(--muted); }

/* Weekly forecast */
.weekly-title { font-size: 14px; font-weight: 600; padding: 0 4px; margin-bottom: 10px; }
.weekly-day {
  border: 1px solid var(--border-subtle); border-radius: 10px; padding: 10px 12px;
  margin-bottom: 6px; background: rgba(255,255,255,0.015);
}
.weekly-day-row { display: flex; align-items: center; gap: 8px; }
.weekly-day-name { font-size: 13px; font-weight: 600; width: 44px; }
.weekly-windows { display: flex; gap: 4px; flex: 1; }
.wpill {
  padding: 3px 8px; border-radius: 6px; font-size: 11px; color: var(--muted);
  background: rgba(255,255,255,0.04); display: flex; gap: 4px; align-items: center;
}
.wpill .ht { font-weight: 600; color: rgba(255,255,255,0.7); }
.weekly-wind { font-size: 11px; color: var(--muted); margin-left: auto; white-space: nowrap; }

/* Map controls */
.map-controls {
  position: absolute; bottom: 24px; right: 16px; z-index: 5;
  display: flex; flex-direction: column; gap: 4px;
}
.map-ctrl-btn {
  width: 36px; height: 36px; background: rgba(20,20,20,0.85); backdrop-filter: blur(8px);
  border: 1px solid var(--border-subtle); border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  color: var(--fg); font-size: 18px;
}
</style></head><body>
<div class="container">
  <div class="sidebar">
    <div class="sidebar-brand">W</div>
    <div class="sidebar-btn active">
      <svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
    </div>
    <div class="sidebar-btn">
      <svg viewBox="0 0 24 24"><path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/></svg>
    </div>
    <div class="sidebar-btn">
      <svg viewBox="0 0 24 24"><path d="M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8l-7-7H4a2 2 0 0 0-2 2z"/><path d="M12 3v6a1 1 0 0 0 1 1h5"/></svg>
    </div>
    <div class="sidebar-spacer"></div>
    <div class="sidebar-add">+</div>
    <div class="sidebar-avatar"></div>
  </div>

  <div style="flex:1; position:relative;">
    <!-- Map background -->
    <div class="map-area">
      <div class="coastline"></div>
      <div class="map-grid"></div>

      <!-- Spot markers -->
      <div class="marker selected" style="top: 280px; left: 520px;">
        <div class="marker-pin"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z"/></svg></div>
      </div>
      <div class="marker" style="top: 180px; left: 650px;">
        <div class="marker-pin"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z"/></svg></div>
        <div class="marker-alert"></div>
      </div>
      <div class="marker" style="top: 420px; left: 780px;">
        <div class="marker-pin"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z"/></svg></div>
      </div>
      <div class="marker" style="top: 350px; left: 900px;">
        <div class="marker-pin"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z"/></svg></div>
      </div>
      <div class="marker marker-shared" style="top: 500px; left: 600px;">
        <div class="marker-pin"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z"/></svg></div>
      </div>

      <!-- Map controls -->
      <div class="map-controls">
        <div class="map-ctrl-btn">+</div>
        <div class="map-ctrl-btn">−</div>
      </div>
    </div>

    <!-- Spot detail pane -->
    <div class="spot-pane spot-pane-abs">
      <div class="pane-header">
        <div>
          <div class="pane-title">Rincon Point</div>
          <div class="pane-coords">34.37321, -119.47628</div>
        </div>
        <div class="pane-close">×</div>
      </div>
      <div class="pane-sessions">12 sessions</div>
      <div class="pane-body">
        <!-- Alert card -->
        <div class="alert-card">
          <div class="alert-badge">
            <svg viewBox="0 0 24 24"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>
            Everything is aligning
          </div>
          <div class="alert-score">
            <div class="score-ring">
              <svg viewBox="0 0 28 28"><circle class="bg" cx="14" cy="14" r="12"/><circle class="fg" cx="14" cy="14" r="12"/></svg>
            </div>
            <div>
              <div class="alert-day">Tomorrow morning</div>
              <div class="alert-time">6:00 AM – 10:00 AM</div>
            </div>
          </div>
          <div class="alert-conditions">4-5ft @ 14s from SSW · Offshore 5mph</div>
        </div>

        <!-- Forecast scores -->
        <div class="forecast-section">
          <div class="forecast-title">
            Forecast Scores
            <span class="forecast-note">12 sessions matched</span>
          </div>
          <div class="forecast-day">
            <div class="forecast-day-header">
              <span class="forecast-day-name">Monday</span>
              <div class="forecast-pills">
                <span class="fpill high">87</span>
                <span class="fpill mid">72</span>
                <span class="fpill low">45</span>
              </div>
            </div>
          </div>
          <div class="forecast-day">
            <div class="forecast-day-header">
              <span class="forecast-day-name">Tuesday</span>
              <div class="forecast-pills">
                <span class="fpill mid">68</span>
                <span class="fpill mid">65</span>
                <span class="fpill low">38</span>
              </div>
            </div>
          </div>
          <div class="forecast-day">
            <div class="forecast-day-header">
              <span class="forecast-day-name">Wednesday</span>
              <div class="forecast-pills">
                <span class="fpill low">42</span>
                <span class="fpill low">35</span>
                <span class="fpill low">28</span>
              </div>
            </div>
          </div>
          <div class="forecast-day">
            <div class="forecast-day-header">
              <span class="forecast-day-name">Thursday</span>
              <div class="forecast-pills">
                <span class="fpill high">91</span>
                <span class="fpill high">85</span>
                <span class="fpill mid">62</span>
              </div>
            </div>
          </div>
          <div class="forecast-day">
            <div class="forecast-day-header">
              <span class="forecast-day-name">Friday</span>
              <div class="forecast-pills">
                <span class="fpill mid">76</span>
                <span class="fpill mid">70</span>
                <span class="fpill low">48</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Weekly forecast -->
        <div>
          <div class="weekly-title">Weekly Forecast</div>
          <div class="weekly-day">
            <div class="weekly-day-row">
              <span class="weekly-day-name">Today</span>
              <div class="weekly-windows">
                <span class="wpill"><span class="ht">3ft</span> 11s</span>
                <span class="wpill"><span class="ht">3ft</span> 10s</span>
                <span class="wpill"><span class="ht">2ft</span> 9s</span>
              </div>
              <span class="weekly-wind">8 mph NW</span>
            </div>
          </div>
          <div class="weekly-day">
            <div class="weekly-day-row">
              <span class="weekly-day-name">Tmrw</span>
              <div class="weekly-windows">
                <span class="wpill"><span class="ht">5ft</span> 14s</span>
                <span class="wpill"><span class="ht">4ft</span> 13s</span>
                <span class="wpill"><span class="ht">4ft</span> 12s</span>
              </div>
              <span class="weekly-wind">5 mph E</span>
            </div>
          </div>
          <div class="weekly-day">
            <div class="weekly-day-row">
              <span class="weekly-day-name">Wed</span>
              <div class="weekly-windows">
                <span class="wpill"><span class="ht">3ft</span> 10s</span>
                <span class="wpill"><span class="ht">3ft</span> 9s</span>
                <span class="wpill"><span class="ht">2ft</span> 8s</span>
              </div>
              <span class="weekly-wind">12 mph W</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
</body></html>`;

// ─── Sessions List Screenshot ────────────────────────────────
const sessionsHTML = `<!DOCTYPE html>
<html><head><style>
${SHARED_STYLES}

.container { width: 1440px; height: 900px; display: flex; overflow: hidden; }

.sidebar {
  width: 60px; background: oklch(0.11 0 0); border-right: 1px solid var(--border-subtle);
  display: flex; flex-direction: column; align-items: center; padding: 16px 0; gap: 8px;
  flex-shrink: 0;
}
.sidebar-brand {
  width: 36px; height: 36px; border-radius: 10px; background: var(--primary);
  display: flex; align-items: center; justify-content: center; margin-bottom: 16px;
  font-weight: 700; font-size: 16px; color: oklch(0.15 0 0);
}
.sidebar-btn {
  width: 40px; height: 40px; border-radius: 8px; display: flex; align-items: center; justify-content: center;
  color: var(--muted);
}
.sidebar-btn.active { background: var(--accent); color: var(--fg); }
.sidebar-btn svg { width: 18px; height: 18px; stroke: currentColor; fill: none; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.sidebar-spacer { flex: 1; }
.sidebar-add {
  width: 40px; height: 40px; border-radius: 8px; background: var(--primary); color: oklch(0.15 0 0);
  display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: 600;
}
.sidebar-avatar {
  width: 32px; height: 32px; border-radius: 50%; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  margin-top: 8px;
}

.main { flex: 1; overflow-y: auto; padding: 48px; }
.content { max-width: 720px; margin: 0 auto; }

.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
.page-title { font-size: 28px; font-weight: 700; letter-spacing: -0.02em; }
.btn-primary {
  padding: 8px 16px; border-radius: 8px; background: var(--primary); color: oklch(0.15 0 0);
  font-size: 13px; font-weight: 600; border: none; cursor: pointer;
}

.filters { display: flex; gap: 8px; margin-bottom: 24px; }
.select-btn {
  padding: 7px 14px; border-radius: 8px; border: 1px solid var(--border);
  background: transparent; color: var(--fg); font-size: 13px; font-family: inherit;
  display: flex; align-items: center; gap: 6px;
}
.select-btn .arrow { color: var(--muted); font-size: 10px; }

.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }

.session-card {
  background: var(--card); border-radius: 14px; border: 1px solid rgba(255,255,255,0.05);
  overflow: hidden; cursor: pointer;
  transition: border-color 0.2s;
}
.session-card:hover { border-color: var(--border); }

.card-header {
  display: flex; align-items: center; justify-content: space-between; padding: 12px 14px;
}
.card-spot { display: flex; align-items: center; gap: 10px; }
.spot-avatar {
  width: 32px; height: 32px; border-radius: 50%; background: rgba(218, 185, 78, 0.1);
  display: flex; align-items: center; justify-content: center;
  font-size: 13px; font-weight: 600; color: var(--primary);
}
.spot-name { font-size: 13px; font-weight: 600; }
.spot-date { font-size: 11px; color: var(--muted); margin-top: 1px; }
.stars { display: flex; gap: 1px; }
.star { width: 14px; height: 14px; }
.star.filled { color: #facc15; }
.star.empty { color: rgba(255,255,255,0.15); }
.star svg { width: 100%; height: 100%; fill: currentColor; }

.card-photo {
  aspect-ratio: 4/3; overflow: hidden;
}
.photo-gradient {
  width: 100%; height: 100%;
}
.photo-gradient.surf1 { background: linear-gradient(135deg, #1a3a4a 0%, #0d2233 30%, #1e4d5e 60%, #2a6070 80%, #1a3a4a 100%); }
.photo-gradient.surf2 { background: linear-gradient(160deg, #1e3a2a 0%, #0d2218 30%, #2a5040 60%, #1e4838 80%, #0d2218 100%); }
.photo-gradient.surf3 { background: linear-gradient(120deg, #2a1a3a 0%, #1a0d2a 30%, #3a2a5a 60%, #2a1a4a 80%, #1a0d2a 100%); }
.photo-gradient.surf4 { background: linear-gradient(145deg, #3a2a1a 0%, #2a1a0d 30%, #5a3a2a 60%, #4a2a1a 80%, #2a1a0d 100%); }
.photo-gradient.surf5 { background: linear-gradient(130deg, #1a2a3a 0%, #0d1a2a 30%, #2a4a5a 60%, #1a3a4a 80%, #0d1a2a 100%); }
.photo-gradient.surf6 { background: linear-gradient(155deg, #0d2a2a 0%, #0a1a1a 30%, #1a4040 60%, #0d3030 80%, #0a1a1a 100%); }

.card-footer { padding: 10px 14px 14px; }
.condition-pills { display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 6px; }
.cpill {
  display: inline-flex; align-items: center; padding: 3px 9px; border-radius: 20px;
  font-size: 11px; font-weight: 500;
}
.cpill.wave { background: rgba(59, 130, 246, 0.12); color: #60a5fa; }
.cpill.period { background: rgba(34, 197, 94, 0.12); color: #4ade80; }
.cpill.wind { background: rgba(156, 163, 175, 0.12); color: #9ca3af; }
.card-time { font-size: 11px; color: var(--muted); margin-bottom: 4px; }
.card-notes { font-size: 13px; color: var(--muted); line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
</style></head><body>
<div class="container">
  <div class="sidebar">
    <div class="sidebar-brand">W</div>
    <div class="sidebar-btn">
      <svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
    </div>
    <div class="sidebar-btn active">
      <svg viewBox="0 0 24 24"><path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/></svg>
    </div>
    <div class="sidebar-btn">
      <svg viewBox="0 0 24 24"><path d="M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8l-7-7H4a2 2 0 0 0-2 2z"/><path d="M12 3v6a1 1 0 0 0 1 1h5"/></svg>
    </div>
    <div class="sidebar-spacer"></div>
    <div class="sidebar-add">+</div>
    <div class="sidebar-avatar"></div>
  </div>

  <div class="main">
    <div class="content">
      <div class="page-header">
        <h1 class="page-title">Sessions</h1>
        <button class="btn-primary">Log Session</button>
      </div>

      <div class="filters">
        <div class="select-btn">All spots <span class="arrow">▾</span></div>
        <div class="select-btn">All ratings <span class="arrow">▾</span></div>
      </div>

      <div class="grid">
        <!-- Card 1 -->
        <div class="session-card">
          <div class="card-header">
            <div class="card-spot">
              <div class="spot-avatar">R</div>
              <div><div class="spot-name">Rincon Point</div><div class="spot-date">Mar 15, 2026</div></div>
            </div>
            <div class="stars">
              ${[1,2,3,4,5].map(i => `<div class="star ${i <= 5 ? 'filled' : 'empty'}"><svg viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg></div>`).join('')}
            </div>
          </div>
          <div class="card-photo"><div class="photo-gradient surf1"></div></div>
          <div class="card-footer">
            <div class="condition-pills">
              <span class="cpill wave">4-5ft</span>
              <span class="cpill period">14s</span>
              <span class="cpill wind">5 mph E</span>
            </div>
            <div class="card-time">6:30 AM – 8:45 AM</div>
            <div class="card-notes">Dawn patrol. Clean lines, glassy conditions. Best session this month by far.</div>
          </div>
        </div>

        <!-- Card 2 -->
        <div class="session-card">
          <div class="card-header">
            <div class="card-spot">
              <div class="spot-avatar">T</div>
              <div><div class="spot-name">Trestles</div><div class="spot-date">Mar 12, 2026</div></div>
            </div>
            <div class="stars">
              ${[1,2,3,4,5].map(i => `<div class="star ${i <= 4 ? 'filled' : 'empty'}"><svg viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg></div>`).join('')}
            </div>
          </div>
          <div class="card-photo"><div class="photo-gradient surf2"></div></div>
          <div class="card-footer">
            <div class="condition-pills">
              <span class="cpill wave">3-4ft</span>
              <span class="cpill period">12s</span>
              <span class="cpill wind">8 mph NW</span>
            </div>
            <div class="card-time">7:00 AM – 9:30 AM</div>
            <div class="card-notes">Fun morning session. A bit crowded but the rights were working well on the inside.</div>
          </div>
        </div>

        <!-- Card 3 -->
        <div class="session-card">
          <div class="card-header">
            <div class="card-spot">
              <div class="spot-avatar">B</div>
              <div><div class="spot-name">Blacks Beach</div><div class="spot-date">Mar 9, 2026</div></div>
            </div>
            <div class="stars">
              ${[1,2,3,4,5].map(i => `<div class="star ${i <= 3 ? 'filled' : 'empty'}"><svg viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg></div>`).join('')}
            </div>
          </div>
          <div class="card-photo"><div class="photo-gradient surf3"></div></div>
          <div class="card-footer">
            <div class="condition-pills">
              <span class="cpill wave">2-3ft</span>
              <span class="cpill period">8s</span>
              <span class="cpill wind">12 mph W</span>
            </div>
            <div class="card-time">4:00 PM – 5:45 PM</div>
            <div class="card-notes">Afternoon glass-off. Small but fun, got some nice lefts on the 9'6.</div>
          </div>
        </div>

        <!-- Card 4 -->
        <div class="session-card">
          <div class="card-header">
            <div class="card-spot">
              <div class="spot-avatar">R</div>
              <div><div class="spot-name">Rincon Point</div><div class="spot-date">Mar 5, 2026</div></div>
            </div>
            <div class="stars">
              ${[1,2,3,4,5].map(i => `<div class="star ${i <= 4 ? 'filled' : 'empty'}"><svg viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg></div>`).join('')}
            </div>
          </div>
          <div class="card-photo"><div class="photo-gradient surf4"></div></div>
          <div class="card-footer">
            <div class="condition-pills">
              <span class="cpill wave">5-6ft</span>
              <span class="cpill period">16s</span>
              <span class="cpill wind">3 mph NE</span>
            </div>
            <div class="card-time">6:15 AM – 8:00 AM</div>
            <div class="card-notes">Solid south swell filled in overnight. Long walls and easy takeoffs. Rode the 6'2 fish.</div>
          </div>
        </div>

        <!-- Card 5 -->
        <div class="session-card">
          <div class="card-header">
            <div class="card-spot">
              <div class="spot-avatar">S</div>
              <div><div class="spot-name">Salt Creek</div><div class="spot-date">Mar 2, 2026</div></div>
            </div>
            <div class="stars">
              ${[1,2,3,4,5].map(i => `<div class="star ${i <= 3 ? 'filled' : 'empty'}"><svg viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg></div>`).join('')}
            </div>
          </div>
          <div class="card-photo"><div class="photo-gradient surf5"></div></div>
          <div class="card-footer">
            <div class="condition-pills">
              <span class="cpill wave">2-3ft</span>
              <span class="cpill period">10s</span>
              <span class="cpill wind">6 mph S</span>
            </div>
            <div class="card-time">3:30 PM – 5:00 PM</div>
            <div class="card-notes">Mellow sunset session. Nothing epic but good for practice.</div>
          </div>
        </div>

        <!-- Card 6 -->
        <div class="session-card">
          <div class="card-header">
            <div class="card-spot">
              <div class="spot-avatar">W</div>
              <div><div class="spot-name">Windansea</div><div class="spot-date">Feb 27, 2026</div></div>
            </div>
            <div class="stars">
              ${[1,2,3,4,5].map(i => `<div class="star ${i <= 5 ? 'filled' : 'empty'}"><svg viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg></div>`).join('')}
            </div>
          </div>
          <div class="card-photo"><div class="photo-gradient surf6"></div></div>
          <div class="card-footer">
            <div class="condition-pills">
              <span class="cpill wave">6-8ft</span>
              <span class="cpill period">18s</span>
              <span class="cpill wind">2 mph NE</span>
            </div>
            <div class="card-time">6:00 AM – 9:00 AM</div>
            <div class="card-notes">Huge WNW swell. Heavy, fast drops. Session of the year so far. Paddled out at first light.</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
</body></html>`;

// ─── Session Detail Screenshot ───────────────────────────────
const sessionDetailHTML = `<!DOCTYPE html>
<html><head><style>
${SHARED_STYLES}

.container { width: 1440px; height: 900px; display: flex; overflow: hidden; }

.sidebar {
  width: 60px; background: oklch(0.11 0 0); border-right: 1px solid var(--border-subtle);
  display: flex; flex-direction: column; align-items: center; padding: 16px 0; gap: 8px;
  flex-shrink: 0;
}
.sidebar-brand {
  width: 36px; height: 36px; border-radius: 10px; background: var(--primary);
  display: flex; align-items: center; justify-content: center; margin-bottom: 16px;
  font-weight: 700; font-size: 16px; color: oklch(0.15 0 0);
}
.sidebar-btn {
  width: 40px; height: 40px; border-radius: 8px; display: flex; align-items: center; justify-content: center;
  color: var(--muted);
}
.sidebar-btn.active { background: var(--accent); color: var(--fg); }
.sidebar-btn svg { width: 18px; height: 18px; stroke: currentColor; fill: none; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.sidebar-spacer { flex: 1; }
.sidebar-add {
  width: 40px; height: 40px; border-radius: 8px; background: var(--primary); color: oklch(0.15 0 0);
  display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: 600;
}
.sidebar-avatar {
  width: 32px; height: 32px; border-radius: 50%; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  margin-top: 8px;
}

.main { flex: 1; overflow-y: auto; padding: 32px 48px; }
.content { max-width: 720px; margin: 0 auto; }

/* Back button */
.back-btn {
  display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: var(--muted);
  margin-bottom: 20px;
}
.back-btn svg { width: 16px; height: 16px; stroke: currentColor; fill: none; stroke-width: 2; }

/* Hero photo */
.hero-photo {
  position: relative; border-radius: 16px; overflow: hidden; margin-bottom: 24px;
  height: 380px;
  background: linear-gradient(135deg, #1a3a4a 0%, #0d2233 30%, #1e4d5e 60%, #2a6070 80%, #1a3a4a 100%);
}
.hero-overlay {
  position: absolute; bottom: 0; left: 0; right: 0; padding: 24px;
  background: linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 100%);
}
.hero-title { font-size: 24px; font-weight: 700; color: white; }
.hero-meta { font-size: 13px; color: rgba(255,255,255,0.6); margin-top: 4px; }
.hero-stars { display: flex; gap: 2px; margin-top: 8px; }
.hero-stars .star { width: 14px; height: 14px; }
.hero-stars .star.filled { color: #facc15; }
.hero-stars .star.empty { color: rgba(255,255,255,0.2); }
.hero-stars .star svg { width: 100%; height: 100%; fill: currentColor; }
.photo-count {
  position: absolute; top: 14px; right: 14px; background: rgba(0,0,0,0.5);
  padding: 3px 10px; border-radius: 20px; font-size: 12px; color: white;
}

/* Thumbnails */
.thumbs { display: flex; gap: 6px; margin-bottom: 28px; }
.thumb {
  width: 44px; height: 44px; border-radius: 8px; overflow: hidden; border: 2px solid transparent;
}
.thumb.active { border-color: var(--primary); }
.thumb-img { width: 100%; height: 100%; }
.thumb-img.t1 { background: linear-gradient(135deg, #1a3a4a, #2a6070); }
.thumb-img.t2 { background: linear-gradient(135deg, #2a1a3a, #3a2a5a); }
.thumb-img.t3 { background: linear-gradient(135deg, #3a2a1a, #5a3a2a); }

/* Cards */
.detail-card {
  background: var(--card); border-radius: 14px; border: 1px solid rgba(255,255,255,0.05);
  padding: 20px; margin-bottom: 16px;
}
.card-title { font-size: 15px; font-weight: 600; margin-bottom: 4px; }
.card-desc { font-size: 12px; color: var(--muted); margin-bottom: 16px; }

/* Equipment */
.equip-row { display: flex; gap: 16px; }
.equip-item { flex: 1; }
.equip-label { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; }
.equip-name { font-size: 14px; font-weight: 500; }
.equip-detail { font-size: 12px; color: var(--muted); }

/* Notes */
.notes-text { font-size: 14px; color: rgba(255,255,255,0.8); line-height: 1.7; }

/* Conditions grid */
.cond-section-label {
  font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em;
  color: var(--muted); margin-bottom: 10px; margin-top: 4px;
}
.cond-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px 16px; margin-bottom: 16px; }
.cond-item {}
.cond-label { font-size: 11px; color: var(--muted); }
.cond-value { font-size: 14px; font-weight: 600; }

/* Chart panels */
.chart-panel {
  border-radius: 14px; border: 1px solid var(--border-subtle); background: rgba(255,255,255,0.02);
  padding: 20px; margin-bottom: 12px;
}
.chart-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; }
.chart-label { font-size: 11px; color: rgba(255,255,255,0.35); text-transform: uppercase; letter-spacing: 0.06em; font-weight: 600; }
.chart-value { font-size: 28px; font-weight: 700; margin-top: 2px; }
.chart-unit { font-size: 13px; color: rgba(255,255,255,0.35); font-weight: 400; }
.chart-sub { font-size: 11px; color: rgba(255,255,255,0.25); margin-top: 2px; }

/* Bar chart */
.bar-chart { display: flex; align-items: flex-end; gap: 3px; height: 140px; margin-bottom: 8px; }
.bar-col { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px; }
.bar {
  width: 100%; border-radius: 3px 3px 0 0;
  background: oklch(0.55 0.06 230);
}
.bar.highlight { background: oklch(0.50 0.10 230); }
.bar-label { font-size: 9px; color: rgba(255,255,255,0.4); }
.bar-time { font-size: 9px; color: rgba(255,255,255,0.25); }

/* Area chart (simplified) */
.area-chart {
  height: 100px; position: relative; margin-bottom: 8px;
  overflow: hidden; border-radius: 4px;
}
.area-chart svg { width: 100%; height: 100%; }

/* Weather strip */
.weather-strip { display: flex; gap: 0; }
.weather-hour {
  flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px;
  padding: 10px 0; border-radius: 10px;
}
.weather-hour.active { background: rgba(255,255,255,0.06); outline: 1px solid rgba(251,191,36,0.3); }
.wh-time { font-size: 10px; color: rgba(255,255,255,0.4); font-variant-numeric: tabular-nums; }
.wh-icon { font-size: 18px; }
.wh-temp { font-size: 13px; font-weight: 600; }
</style></head><body>
<div class="container">
  <div class="sidebar">
    <div class="sidebar-brand">W</div>
    <div class="sidebar-btn">
      <svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
    </div>
    <div class="sidebar-btn active">
      <svg viewBox="0 0 24 24"><path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/></svg>
    </div>
    <div class="sidebar-btn">
      <svg viewBox="0 0 24 24"><path d="M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8l-7-7H4a2 2 0 0 0-2 2z"/><path d="M12 3v6a1 1 0 0 0 1 1h5"/></svg>
    </div>
    <div class="sidebar-spacer"></div>
    <div class="sidebar-add">+</div>
    <div class="sidebar-avatar"></div>
  </div>

  <div class="main">
    <div class="content">
      <div class="back-btn">
        <svg viewBox="0 0 24 24"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        Back
      </div>

      <!-- Hero photo -->
      <div class="hero-photo">
        <div class="photo-count">1 / 3</div>
        <div class="hero-overlay">
          <div class="hero-title">Rincon Point</div>
          <div class="hero-meta">Saturday, March 15, 2026 · 6:30 AM – 8:45 AM</div>
          <div class="hero-stars">
            ${[1,2,3,4,5].map(i => `<div class="star filled"><svg viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg></div>`).join('')}
          </div>
        </div>
      </div>

      <!-- Thumbnails -->
      <div class="thumbs">
        <div class="thumb active"><div class="thumb-img t1"></div></div>
        <div class="thumb"><div class="thumb-img t2"></div></div>
        <div class="thumb"><div class="thumb-img t3"></div></div>
      </div>

      <!-- Equipment -->
      <div class="detail-card">
        <div class="card-title">Equipment</div>
        <div class="equip-row">
          <div class="equip-item">
            <div class="equip-label">Board</div>
            <div class="equip-name">Daily Driver</div>
            <div class="equip-detail">Channel Islands · 6'2" Fishbeard</div>
          </div>
          <div class="equip-item">
            <div class="equip-label">Wetsuit</div>
            <div class="equip-name">Winter Full</div>
            <div class="equip-detail">O'Neill · 4/3mm</div>
          </div>
        </div>
      </div>

      <!-- Notes -->
      <div class="detail-card">
        <div class="card-title">Notes</div>
        <div class="notes-text">Dawn patrol. Clean lines, glassy conditions. Best session this month by far. The south swell filled in overnight and the morning glass was perfect. Got a few long walls all the way through the inside section. Rode the Fishbeard and it felt dialed in on the steeper drops.</div>
      </div>

      <!-- Conditions -->
      <div class="detail-card">
        <div class="card-title">Conditions</div>
        <div class="card-desc">Historical conditions at time of session</div>

        <div class="cond-section-label">Surf</div>
        <div class="cond-grid">
          <div class="cond-item"><div class="cond-label">Wave Height</div><div class="cond-value">4-5 ft</div></div>
          <div class="cond-item"><div class="cond-label">Period</div><div class="cond-value">14s</div></div>
          <div class="cond-item"><div class="cond-label">Direction</div><div class="cond-value">SSW 195°</div></div>
          <div class="cond-item"><div class="cond-label">Energy</div><div class="cond-value" style="color: #4ade80;">High</div></div>
        </div>

        <div class="cond-section-label">Wind & Tide</div>
        <div class="cond-grid">
          <div class="cond-item"><div class="cond-label">Wind</div><div class="cond-value">5 mph E</div></div>
          <div class="cond-item"><div class="cond-label">Gusts</div><div class="cond-value">8 mph</div></div>
          <div class="cond-item"><div class="cond-label">Tide</div><div class="cond-value">3.2 ft</div></div>
        </div>

        <div class="cond-section-label">Atmosphere</div>
        <div class="cond-grid">
          <div class="cond-item"><div class="cond-label">Air Temp</div><div class="cond-value">62°F</div></div>
          <div class="cond-item"><div class="cond-label">Water Temp</div><div class="cond-value">58°F</div></div>
          <div class="cond-item"><div class="cond-label">Cloud Cover</div><div class="cond-value">15%</div></div>
        </div>
      </div>

      <!-- Conditions Timeline -->
      <div style="margin-top: 8px;">
        <div style="font-size: 18px; font-weight: 600; letter-spacing: -0.02em; margin-bottom: 4px;">Conditions Timeline</div>
        <div style="font-size: 12px; color: rgba(255,255,255,0.25); margin-bottom: 16px;">24-hour window around your session</div>

        <!-- Surf height chart -->
        <div class="chart-panel">
          <div class="chart-header">
            <div>
              <div class="chart-label">Surf Height</div>
              <div class="chart-value">4-5 <span class="chart-unit">ft</span></div>
              <div class="chart-sub">Waist to chest</div>
            </div>
            <div style="text-align: right;">
              <div class="chart-label">Swell</div>
              <div style="font-size: 14px; font-weight: 600; margin-top: 4px;">6.6ft &nbsp;14s</div>
              <div class="chart-sub">SSW 195°</div>
            </div>
          </div>
          <div class="bar-chart">
            ${[2,2,2,2,3,3,4,5,5,5,4,4,4,3,3,3,3,2,2,2,2,2,2,2].map((h, i) =>
              `<div class="bar-col">
                <div class="bar-label">${h}</div>
                <div class="bar ${i >= 6 && i <= 8 ? 'highlight' : ''}" style="height: ${h * 24}px;"></div>
                ${i % 3 === 0 ? `<div class="bar-time">${i < 12 ? (i === 0 ? '12a' : i + 'a') : (i === 12 ? '12p' : (i-12) + 'p')}</div>` : '<div class="bar-time"></div>'}
              </div>`
            ).join('')}
          </div>
        </div>

        <!-- Tide chart -->
        <div class="chart-panel">
          <div class="chart-header">
            <div>
              <div class="chart-label">Tide Height</div>
              <div class="chart-value">3.2 <span class="chart-unit">ft</span></div>
              <div class="chart-sub">relative to MLLW</div>
            </div>
          </div>
          <div class="area-chart">
            <svg viewBox="0 0 480 100" preserveAspectRatio="none">
              <defs>
                <linearGradient id="tideGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="oklch(0.72 0.14 220)" stop-opacity="0.4"/>
                  <stop offset="100%" stop-color="oklch(0.72 0.14 220)" stop-opacity="0"/>
                </linearGradient>
              </defs>
              <path d="M0,60 C40,70 80,80 120,75 C160,70 200,30 240,20 C280,10 320,35 360,55 C400,75 440,80 480,70 L480,100 L0,100 Z" fill="url(#tideGrad)"/>
              <path d="M0,60 C40,70 80,80 120,75 C160,70 200,30 240,20 C280,10 320,35 360,55 C400,75 440,80 480,70" fill="none" stroke="oklch(0.72 0.14 220)" stroke-width="2"/>
              <!-- Session marker -->
              <line x1="130" y1="0" x2="130" y2="100" stroke="rgba(255,255,255,0.15)" stroke-width="1" stroke-dasharray="4,4"/>
            </svg>
          </div>
        </div>

        <!-- Weather strip -->
        <div class="chart-panel">
          <div class="chart-label" style="margin-bottom: 12px;">Weather</div>
          <div class="weather-strip">
            <div class="weather-hour"><div class="wh-time">4a</div><div class="wh-icon">🌙</div><div class="wh-temp">56°</div></div>
            <div class="weather-hour"><div class="wh-time">5a</div><div class="wh-icon">🌙</div><div class="wh-temp">55°</div></div>
            <div class="weather-hour"><div class="wh-time">6a</div><div class="wh-icon">🌅</div><div class="wh-temp">56°</div></div>
            <div class="weather-hour active"><div class="wh-time">7a</div><div class="wh-icon">☀️</div><div class="wh-temp">58°</div></div>
            <div class="weather-hour active"><div class="wh-time">8a</div><div class="wh-icon">☀️</div><div class="wh-temp">60°</div></div>
            <div class="weather-hour"><div class="wh-time">9a</div><div class="wh-icon">☀️</div><div class="wh-temp">62°</div></div>
            <div class="weather-hour"><div class="wh-time">10a</div><div class="wh-icon">⛅</div><div class="wh-temp">63°</div></div>
            <div class="weather-hour"><div class="wh-time">11a</div><div class="wh-icon">⛅</div><div class="wh-temp">64°</div></div>
            <div class="weather-hour"><div class="wh-time">12p</div><div class="wh-icon">☁️</div><div class="wh-temp">65°</div></div>
            <div class="weather-hour"><div class="wh-time">1p</div><div class="wh-icon">☁️</div><div class="wh-temp">64°</div></div>
            <div class="weather-hour"><div class="wh-time">2p</div><div class="wh-icon">⛅</div><div class="wh-temp">63°</div></div>
            <div class="weather-hour"><div class="wh-time">3p</div><div class="wh-icon">☀️</div><div class="wh-temp">62°</div></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
</body></html>`;

// ─── Generate Screenshots ────────────────────────────────────
async function generate() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--font-render-hinting=none"],
  });

  const pages = [
    { name: "dashboard", html: dashboardHTML },
    { name: "sessions", html: sessionsHTML },
    { name: "session-detail", html: sessionDetailHTML },
  ];

  for (const { name, html } of pages) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
    await page.setContent(html, { waitUntil: "networkidle0" });
    // Wait for fonts to load
    await page.evaluate(() => document.fonts.ready);
    const outPath = path.join(OUT_DIR, `${name}.png`);
    await page.screenshot({ path: outPath, type: "png" });
    console.log(`✓ ${outPath}`);
    await page.close();
  }

  await browser.close();
  console.log("\nDone! Screenshots saved to public/screenshots/");
}

generate().catch((err) => {
  console.error(err);
  process.exit(1);
});
