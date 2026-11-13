/*
 * nad-c700-card  v1.1.0
 * Lovelace card that recreates the front of a NAD C 700 (V2) BluOS streaming amplifier:
 * 5" display (now playing / source / VU), VOLUME-MENU knob with tap zones, two arrow keys,
 * NAD status logo, the on-device menu and an optional BC1 remote bar.
 *
 * Works with the "Bluesound Alt" integration (player + settings) and optionally the core
 * "Bluesound" integration (for BluOS presets). Everything is auto-discovered.
 *
 *   type: custom:nad-c700-card
 *
 * Knob: tap centre = press (play/pause, select/save) · hold centre = open/close menu
 *       tap left/right = one step · hold left/right = keep turning (hold_sides: repeat)
 *       mouse wheel = turn
 * Power: wakes the NAD by resuming the last track (falls back to a preset/source),
 *        switches off by stopping playback (the NAD enters standby by itself after 15 min).
 */
(() => {
  const VERSION = "1.1.0";
  const TAG = "nad-c700-card";

  const T = {
    nl: {
      standby: "Standby", offline: "Niet verbonden", paused: "Gepauzeerd", stopped: "Gestopt", menu: "Menu",
      sources: "Bronnen", presets: "Presets", playback: "Afspelen", settings: "Instellingen", back: "Terug",
      shuffle: "Shuffle", repeat: "Herhalen", sleep: "Slaaptimer", tone: "Toonregeling", tone_on: "Toonregeling",
      bass: "Bas", treble: "Hoog", balance: "Balans", subwoofer: "Subwoofer", display: "Display",
      auto_bright: "Auto helderheid", brightness: "Helderheid", dark: "Dark mode", indicator: "Lampje",
      bluetooth: "Bluetooth", limits: "Volumegrenzen", vmin: "Minimum", vmax: "Maximum", replay: "Replay Gain",
      output: "Uitgang", on: "Aan", off: "Uit", volume: "Volume", locked: "Knop vergrendeld — houd vast om te ontgrendelen",
      unlocked: "Ontgrendeld", mute: "Gedempt", min: "min", no_player: "Geen NAD/BluOS-speler gevonden",
      waking: "NAD wordt gewekt…", wake_fb: "Laatste nummer niet hervat — start", wake_fail: "Laatste nummer niet hervat",
      off_confirm: "Nogmaals tikken om te stoppen", stopped_sb: "Gestopt — standby na 15 min", power: "Aan/uit",
    },
    en: {
      standby: "Standby", offline: "Offline", paused: "Paused", stopped: "Stopped", menu: "Menu",
      sources: "Sources", presets: "My Presets", playback: "Playback", settings: "Settings", back: "Back",
      shuffle: "Shuffle", repeat: "Repeat", sleep: "Sleep timer", tone: "Tone controls", tone_on: "Tone controls",
      bass: "Bass", treble: "Treble", balance: "Balance", subwoofer: "Subwoofer", display: "Display",
      auto_bright: "Auto brightness", brightness: "Brightness", dark: "Dark mode", indicator: "Indicator",
      bluetooth: "Bluetooth", limits: "Volume limits", vmin: "Minimum", vmax: "Maximum", replay: "Replay Gain",
      output: "Output", on: "On", off: "Off", volume: "Volume", locked: "Knob locked — hold to unlock",
      unlocked: "Unlocked", mute: "Muted", min: "min", no_player: "No NAD/BluOS player found",
      waking: "Waking the NAD…", wake_fb: "Could not resume — starting", wake_fail: "Could not resume the last track",
      off_confirm: "Tap again to stop", stopped_sb: "Stopped — standby after 15 min", power: "Power",
    },
  };

  // translation_key on the Bluesound Alt device -> config option
  const SETTING_KEYS = {
    bass: "bass", treble: "treble", balance: "balance", display_brightness: "display_brightness",
    volume_min: "volume_limit_min", volume_max: "volume_limit_max", sleep_timer: "sleep_timer",
    replay_gain: "replay_gain", output_mode: "output_mode", bluetooth: "bluetooth_mode",
    indicator_brightness: "indicator_brightness", tone_controls: "tone_controls", subwoofer: "subwoofer",
    auto_display_brightness: "auto_display_brightness", dark_mode: "dark_mode",
  };
  const PHYSICAL = ["phono", "cd", "line in", "line", "analog", "optical", "optical input", "coaxial", "hdmi", "hdmi earc", "tv"];
  const BAD = new Set(["unavailable", "unknown", undefined, null, ""]);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const srcKey = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  const fmtTime = (s) => {
    if (s == null || isNaN(s)) return "";
    s = Math.max(0, Math.floor(s));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = String(s % 60).padStart(2, "0");
    return h ? `${h}:${String(m).padStart(2, "0")}:${x}` : `${m}:${x}`;
  };

  const DEFAULTS = {
    name: "NAD C 700",
    step: 2,
    volume_unit: "percent",
    hold_sides: "repeat",
    knob_lock: false,
    show_remote: true,
    wake_fallback: "",
    confirm_off: true,
    remote_presets: 5,
    default_view: "auto",
    dark_mode: "follow",
    hide_menu: [],
    menu_timeout: 30,
    language: "nl",
  };

  const CSS = `
    :host { display:block; --nad-glass:#07080a; --nad-alu1:#3b3e43; --nad-alu2:#25272b; --nad-alu3:#16171a;
      --nad-led:#f4f7fb; --nad-accent:var(--primary-color,#03a9f4); }
    [hidden] { display:none !important; }
    ha-card { overflow:hidden; padding:12px; container-type:inline-size; }
    .plate { position:relative; border-radius:14px; padding:12px 14px 12px 12px; display:grid;
      grid-template-columns:minmax(0,1fr) auto; gap:14px; align-items:center;
      background:linear-gradient(180deg,var(--nad-alu1),var(--nad-alu2) 55%,var(--nad-alu3));
      box-shadow:inset 0 1px 0 rgba(255,255,255,.14), inset 0 -2px 6px rgba(0,0,0,.5), 0 6px 16px rgba(0,0,0,.35); }
    .plate::before { content:""; position:absolute; inset:0; border-radius:inherit; pointer-events:none; opacity:.35;
      background:repeating-linear-gradient(90deg,rgba(255,255,255,.035) 0 1px,transparent 1px 3px); }
    .plate::after { content:""; position:absolute; inset:0; border-radius:inherit; pointer-events:none;
      background:linear-gradient(115deg,rgba(255,255,255,.09) 0%,rgba(255,255,255,0) 32%); }
    /* ---------- display ---------- */
    .screen { position:relative; width:100%; aspect-ratio:4.25/2.5; border-radius:8px; overflow:hidden; background:#000;
      box-shadow:0 0 0 2px #000, 0 0 0 3px rgba(255,255,255,.07), inset 0 0 18px rgba(0,0,0,.9);
      font-family:var(--ha-font-family-body,Roboto,sans-serif); user-select:none; -webkit-user-select:none; }
    .lcd { position:absolute; inset:0; color:#f1f3f5; --sub:#9aa3ab; --hi:var(--nad-accent); }
    .lcd.light { background:#e9ecef; color:#15181b; --sub:#59616a; }
    .lcd.dark { background:#000; }
    .lcd.off { background:#000; }
    .glare { position:absolute; inset:0; pointer-events:none;
      background:linear-gradient(160deg,rgba(255,255,255,.10),rgba(255,255,255,0) 38%); }
    .sbar { position:absolute; left:4%; right:4%; top:5%; display:flex; justify-content:space-between; align-items:center;
      font-size:clamp(8px,2.3cqi,12px); color:var(--sub); letter-spacing:.3px; }
    .sbar .src { display:flex; align-items:center; gap:4px; font-weight:600; text-transform:uppercase; }
    .np { position:absolute; left:4%; right:4%; top:17%; bottom:22%; display:flex; gap:4%; align-items:center; }
    .art { height:100%; aspect-ratio:1; border-radius:4px; background:#1b1e22 center/cover no-repeat;
      box-shadow:0 2px 8px rgba(0,0,0,.6); flex:none; display:grid; place-items:center; color:#555; }
    .lcd.light .art { background-color:#cfd4d9; }
    .np.art-only { justify-content:center; }
    .txt { min-width:0; display:flex; flex-direction:column; gap:3%; }
    .t1 { font-size:clamp(11px,3.6cqi,19px); font-weight:500; line-height:1.15; display:-webkit-box; -webkit-line-clamp:2;
      -webkit-box-orient:vertical; overflow:hidden; }
    .t2, .t3 { font-size:clamp(9px,2.7cqi,14px); color:var(--sub); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .prog { position:absolute; left:4%; right:4%; bottom:7%; display:flex; align-items:center; gap:3%;
      font-size:clamp(8px,2.2cqi,11px); color:var(--sub); font-variant-numeric:tabular-nums; }
    .bar { flex:1; height:3px; border-radius:2px; background:rgba(127,127,127,.35); overflow:hidden; }
    .bar > i { display:block; height:100%; background:var(--lcd-fg,currentColor); width:0; }
    .bigsrc { position:absolute; inset:16% 4% 20%; display:flex; flex-direction:column; justify-content:center; align-items:center; gap:4%; }
    .bigsrc .n { font-size:clamp(16px,7cqi,38px); font-weight:300; letter-spacing:1px; }
    .bigsrc .v { font-size:clamp(9px,2.8cqi,14px); color:var(--sub); }
    .vu { position:absolute; inset:16% 3% 18%; display:flex; gap:3%; }
    .vu svg { flex:1; height:100%; }
    .vu .face { fill:#e7d9a8; } .lcd.dark .vu .face, .lcd.off .vu .face { fill:#d9c78c; }
    .vu .scale { stroke:#2c2a24; stroke-width:1; fill:none; } .vu .red { stroke:#c0392b; stroke-width:2.2; fill:none; }
    .vu .needle { stroke:#111; stroke-width:1.4; transition:transform .12s linear; transform-origin:50px 62px; }
    .vu text { font:600 6px sans-serif; fill:#2c2a24; }
    .stby { position:absolute; inset:0; display:grid; place-items:center; color:#4a5057; font-size:clamp(10px,3cqi,14px); letter-spacing:2px; }
    .volov { position:absolute; left:8%; right:8%; bottom:12%; padding:3% 4%; border-radius:6px; background:rgba(0,0,0,.78);
      color:#fff; display:flex; align-items:center; gap:4%; font-size:clamp(10px,3cqi,15px); opacity:0; transition:opacity .25s; pointer-events:none; }
    .lcd.light .volov { background:rgba(255,255,255,.92); color:#111; }
    .volov.show { opacity:1; }
    .volov .bar { height:5px; } .volov .bar > i { background:var(--nad-accent); }
    .volov b { min-width:3.2em; text-align:right; font-variant-numeric:tabular-nums; font-weight:600; }
    .toast { position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); background:rgba(0,0,0,.9); color:#fff;
      padding:3% 5%; border-radius:6px; font-size:clamp(9px,2.6cqi,13px); white-space:nowrap; opacity:0; transition:opacity .25s; pointer-events:none; }
    .toast.show { opacity:1; }
    /* menu */
    .menu { position:absolute; inset:0; display:flex; flex-direction:column; padding:3% 4%; box-sizing:border-box; }
    .mh { display:flex; align-items:center; gap:3%; font-size:clamp(10px,3cqi,15px); font-weight:600; padding-bottom:2%;
      border-bottom:1px solid rgba(127,127,127,.35); }
    .mback { width:1.7em; height:1.7em; border-radius:50%; display:grid; place-items:center; cursor:pointer; flex:none;
      border:1px solid rgba(127,127,127,.5); }
    .mback.sel { background:var(--hi); border-color:var(--hi); color:#fff; }
    .mlist { flex:1; overflow:hidden; position:relative; margin-top:2%; }
    .mrow { display:flex; justify-content:space-between; align-items:center; gap:4%; padding:1.6% 3%; border-radius:4px;
      font-size:clamp(10px,2.9cqi,14px); cursor:pointer; white-space:nowrap; }
    .mrow .mv { color:var(--sub); overflow:hidden; text-overflow:ellipsis; }
    .mrow.sel { background:var(--hi); color:#fff; } .mrow.sel .mv { color:rgba(255,255,255,.85); }
    .mrow.edit .mv { color:#fff; font-weight:700; } .mrow.edit .mv::before { content:"◀ "; } .mrow.edit .mv::after { content:" ▶"; }
    .mrow .chev { opacity:.6; }
    /* ---------- controls ---------- */
    .ctrl { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:8px; }
    .toprow { display:flex; align-items:center; justify-content:space-between; width:100%; }
    .pwr { width:24px; height:24px; border-radius:50%; border:none; cursor:pointer; display:grid; place-items:center; padding:0;
      background:linear-gradient(180deg,#3a3d42,#222428); box-shadow:0 0 0 1px #111, inset 0 1px 0 rgba(255,255,255,.12);
      color:#6b7178; font-size:13px; line-height:1; touch-action:manipulation; transition:color .3s, box-shadow .3s; }
    .pwr.on { color:#f4f7fb; box-shadow:0 0 0 1px #111, 0 0 6px rgba(255,255,255,.35), inset 0 1px 0 rgba(255,255,255,.12); }
    .pwr.confirm { color:#fff; background:var(--error-color,#db4437); animation:pulse 1s ease-in-out infinite; }
    .pwr.busy { animation:pulse .8s ease-in-out infinite; }
    @keyframes pulse { 50% { filter:brightness(1.4); } }
    .logo { font:800 clamp(13px,3.4cqi,19px)/1 "Arial Black",Arial,sans-serif; letter-spacing:1px; color:#5a5f66;
      align-self:flex-end; transition:color .4s,text-shadow .4s; user-select:none; }
    .logo.on { color:var(--nad-led); text-shadow:0 0 6px rgba(255,255,255,.65); }
    .logo.dim { color:#a9aeb4; text-shadow:0 0 3px rgba(255,255,255,.3); }
    .logo.amber { color:#ffb347; text-shadow:0 0 6px rgba(255,170,60,.6); }
    .knobwrap { position:relative; width:var(--nad-knob-size, 104px); aspect-ratio:1; touch-action:none;
      -webkit-touch-callout:none; user-select:none; -webkit-user-select:none; cursor:pointer; }
    .knobwrap svg.ring { position:absolute; inset:-5%; width:110%; height:110%; pointer-events:none; }
    .ring circle { fill:none; stroke:var(--nad-accent); stroke-width:3; stroke-linecap:round; stroke-dasharray:0 400;
      transform:rotate(-90deg); transform-origin:50% 50%; opacity:0; }
    .ring.holding circle { opacity:1; animation:fill var(--hold-ms,600ms) linear forwards; }
    @keyframes fill { to { stroke-dasharray:345 400; } }
    .knob { position:absolute; inset:0; border-radius:50%;
      background:radial-gradient(circle at 50% 50%, #4a4e54 0 54%, transparent 55%),
        repeating-conic-gradient(from 0deg, #2b2e32 0 2deg, #3b3f44 2deg 4deg);
      box-shadow:0 0 0 2px #121315, 0 5px 12px rgba(0,0,0,.55), inset 0 2px 2px rgba(255,255,255,.15), inset 0 -3px 5px rgba(0,0,0,.6);
      transition:transform .12s ease, box-shadow .12s ease; }
    .knob .cap { position:absolute; inset:22%; border-radius:50%;
      background:radial-gradient(circle at 40% 32%, #6a6f76, #34373c 60%, #26282c);
      box-shadow:inset 0 1px 2px rgba(255,255,255,.25), inset 0 -2px 4px rgba(0,0,0,.6); }
    .knob .ind { position:absolute; inset:0; transition:transform .15s ease-out; }
    .knob .ind::after { content:""; position:absolute; left:50%; top:7%; width:3px; height:12%; margin-left:-1.5px; border-radius:2px;
      background:#e8ecef; box-shadow:0 0 3px rgba(255,255,255,.6); }
    .knobwrap.pressed .knob { transform:scale(.965); box-shadow:0 0 0 2px #121315, 0 2px 5px rgba(0,0,0,.6), inset 0 2px 6px rgba(0,0,0,.7); }
    .knobwrap .zone { position:absolute; top:50%; transform:translateY(-50%); font-size:12px; color:rgba(255,255,255,.0); transition:color .15s; pointer-events:none; }
    .knobwrap .zl { left:-2px; } .knobwrap .zr { right:-2px; }
    .knobwrap.flash-l .zl, .knobwrap.flash-r .zr { color:rgba(255,255,255,.75); }
    .knobwrap.locked .knob { filter:brightness(.7); }
    .arrows { display:flex; gap:14px; }
    .arr { width:34px; height:20px; border-radius:10px; border:none; cursor:pointer; color:#c9ced3; font-size:10px;
      background:linear-gradient(180deg,#3a3d42,#222428); box-shadow:0 0 0 1px #111, inset 0 1px 0 rgba(255,255,255,.12);
      display:grid; place-items:center; touch-action:manipulation; }
    .arr:active { transform:translateY(1px); box-shadow:0 0 0 1px #111, inset 0 2px 3px rgba(0,0,0,.6); }
    /* ---------- remote ---------- */
    .remote { margin-top:10px; display:flex; flex-wrap:wrap; gap:3px; align-items:center; justify-content:center; }
    .rb { height:28px; min-width:28px; padding:0 6px; border-radius:14px; border:none; cursor:pointer;
      background:rgba(127,127,127,.14); color:var(--primary-text-color); font-size:12px; display:inline-flex; align-items:center; gap:4px; }
    .rb:hover { background:rgba(127,127,127,.24); }
    .rb.on { background:var(--nad-accent); color:#fff; }
    .rb ha-icon { --mdc-icon-size:18px; }
    .rb.num { min-width:26px; padding:0; justify-content:center; font-weight:600; }
    .sep { width:1px; height:18px; background:rgba(127,127,127,.3); margin:0 1px; }
    .warn { padding:12px; color:var(--error-color,#db4437); }
    @container (max-width: 360px) { .plate { grid-template-columns:1fr; } .ctrl { flex-direction:row; justify-content:center; gap:16px; }
      .logo { align-self:center; margin:0; } .knobwrap { width:96px; } }
    @media (prefers-reduced-motion: reduce) { * { transition:none !important; animation:none !important; } }
  `;

  class NadC700Card extends HTMLElement {
    static getStubConfig() { return {}; }

    static getConfigForm() {
      const sel = (opts) => ({ select: { mode: "dropdown", options: opts } });
      const viewOpts = [
        { value: "auto", label: "Automatisch" }, { value: "art_text", label: "Hoes + tekst" },
        { value: "art", label: "Alleen hoes" }, { value: "source", label: "Bron eenvoudig" }, { value: "vu", label: "VU-meters (animatie)" },
      ];
      return {
        schema: [
          { name: "name", selector: { text: {} } },
          { type: "expandable", name: "", title: "Apparaat en entiteiten", icon: "mdi:speaker", flatten: true, schema: [
            { name: "entity", selector: { entity: { domain: "media_player" } } },
            { name: "presets_entity", selector: { entity: { domain: "media_player" } } },
          ] },
          { type: "expandable", name: "", title: "Scherm", icon: "mdi:monitor", flatten: true, schema: [
            { name: "default_view", selector: sel(viewOpts) },
            { name: "dark_mode", selector: sel([{ value: "follow", label: "Volg NAD-instelling" }, { value: "always", label: "Altijd donker" }, { value: "never", label: "Altijd licht" }]) },
            { type: "grid", name: "", flatten: true, schema: [
              { name: "view_cd", selector: sel(viewOpts) }, { name: "view_phono", selector: sel(viewOpts) },
              { name: "view_line_in", selector: sel(viewOpts) }, { name: "view_optical_input", selector: sel(viewOpts) },
              { name: "view_hdmi_earc", selector: sel(viewOpts) }, { name: "view_bluetooth", selector: sel(viewOpts) },
            ] },
          ] },
          { type: "expandable", name: "", title: "Draaiknop", icon: "mdi:knob", flatten: true, schema: [
            { type: "grid", name: "", flatten: true, schema: [
              { name: "step", selector: { number: { min: 0.5, max: 10, step: 0.5, mode: "box", unit_of_measurement: "%" } } },
              { name: "volume_unit", selector: sel([{ value: "percent", label: "Procent" }, { value: "db", label: "dB (benadering)" }]) },
            ] },
            { name: "hold_sides", selector: sel([{ value: "repeat", label: "Blijven draaien zolang je vasthoudt" }, { value: "menu", label: "Menu openen (zoals het midden)" }]) },
            { name: "knob_lock", selector: { boolean: {} } },
          ] },
          { type: "expandable", name: "", title: "Menu", icon: "mdi:menu", flatten: true, schema: [
            { name: "hide_menu", selector: { select: { multiple: true, mode: "list", options: [
              { value: "sources", label: "Bronnen" }, { value: "presets", label: "Presets" }, { value: "playback", label: "Afspelen" },
              { value: "sleep", label: "Slaaptimer" }, { value: "tone", label: "Toonregeling" }, { value: "subwoofer", label: "Subwoofer" },
              { value: "display", label: "Display" }, { value: "bluetooth", label: "Bluetooth" }, { value: "limits", label: "Volumegrenzen" },
              { value: "replay", label: "Replay Gain" }, { value: "output", label: "Uitgang" },
            ] } } },
            { name: "menu_timeout", selector: { number: { min: 5, max: 120, step: 5, mode: "slider", unit_of_measurement: "s" } } },
          ] },
          { type: "expandable", name: "", title: "Extra's", icon: "mdi:remote", flatten: true, schema: [
            { name: "wake_fallback", selector: { text: {} } },
            { name: "confirm_off", selector: { boolean: {} } },
            { name: "show_remote", selector: { boolean: {} } },
            { name: "remote_presets", selector: { number: { min: 0, max: 10, step: 1, mode: "slider" } } },
            { name: "language", selector: sel([{ value: "nl", label: "Nederlands" }, { value: "en", label: "English" }]) },
          ] },
        ],
        computeLabel: (s) => ({
          name: "Naam", entity: "Speler (Bluesound Alt) — leeg = automatisch",
          presets_entity: "Speler voor presets (Bluesound) — leeg = automatisch",
          default_view: "Standaard schermweergave", dark_mode: "Donkere achtergrond",
          view_cd: "CD", view_phono: "Phono", view_line_in: "Line In", view_optical_input: "Optical",
          view_hdmi_earc: "HDMI eARC", view_bluetooth: "Bluetooth",
          step: "Stap per klik", volume_unit: "Volume tonen in", hold_sides: "Vasthouden links/rechts",
          knob_lock: "Knop vergrendelen (vasthouden ontgrendelt 30 s)", hide_menu: "Verberg in menu",
          menu_timeout: "Menu sluit na", show_remote: "BC1-afstandsbediening tonen",
          wake_fallback: "Aanzetten: reserve als het laatste nummer niet start", confirm_off: "Uitzetten: nogmaals tikken ter bevestiging",
          remote_presets: "Aantal presetknoppen", language: "Taal",
        }[s.name] ?? s.name),
        computeHelper: (s) => ({
          default_view: "Automatisch: hoes + tekst bij streaming, bronnaam bij CD/Phono/Line/Optical/HDMI.",
          volume_unit: "dB wordt berekend tussen je volumegrenzen en is een benadering.",
          wake_fallback: "Naam van een preset of ingang, bijv. Qmusic of CD. Leeg = geen reserve.",
          confirm_off: "Uitzetten stopt het afspelen; de NAD gaat na 15 minuten zelf in standby.",
        }[s.name]),
      };
    }

    setConfig(config) {
      this._config = { ...DEFAULTS, ...(config || {}) };
      this._lang = String(this._config.language).startsWith("en") ? "en" : "nl";
      this._built = false;
      if (this._hass) { this._build(); this._update(); }
    }

    set hass(hass) {
      const first = !this._hass;
      this._hass = hass;
      if (!this._built) this._build();
      this._update();
      if (first) this._startTick();
    }

    connectedCallback() { if (this._hass) this._startTick(); }
    disconnectedCallback() { clearInterval(this._tick); this._tick = null; cancelAnimationFrame(this._vuRaf); this._vuRaf = null; }
    _startTick() { if (!this._tick) this._tick = setInterval(() => this._updateProgress(), 1000); }
    getCardSize() { return this._config?.show_remote ? 5 : 4; }
    getGridOptions() { return { columns: 12, rows: "auto", min_columns: 6 }; }
    t(k) { return T[this._lang][k] ?? k; }

    /* ---------------- entities ---------------- */
    _resolve() {
      const h = this._hass, c = this._config, ents = Object.values(h.entities || {});
      let player = c.entity;
      if (!player) player = ents.find((e) => e.platform === "bluesound_alt" && e.entity_id.startsWith("media_player."))?.entity_id
        || ents.find((e) => e.platform === "bluesound" && e.entity_id.startsWith("media_player."))?.entity_id;
      const dev = player ? h.entities[player]?.device_id : null;
      const out = { player };
      for (const [opt, tk] of Object.entries(SETTING_KEYS)) {
        out[opt] = (typeof c[opt] === "string" && c[opt].includes(".") ? c[opt] : null) || (dev ? ents.find((e) => e.device_id === dev && e.translation_key === tk)?.entity_id : undefined);
      }
      let pr = c.presets_entity;
      if (!pr) {
        const name = player ? h.states[player]?.attributes.friendly_name : null;
        const cands = ents.filter((e) => e.platform === "bluesound" && e.entity_id.startsWith("media_player.") && e.entity_id !== player);
        pr = (cands.find((e) => h.states[e.entity_id]?.attributes.friendly_name === name) || cands[0])?.entity_id;
      }
      out.presets = pr;
      return out;
    }
    st(id) { return id ? this._hass.states[id] : undefined; }
    call(domain, service, data) { return this._hass.callService(domain, service, data); }

    _sources() {
      const p = this.st(this._e.player);
      return [...new Set(p?.attributes.source_list || [])];
    }
    _presets() {
      const pr = this.st(this._e.presets);
      const inputs = new Set(this._sources().map((s) => s.toLowerCase()));
      return [...new Set((pr?.attributes.source_list || []).filter((s) => !inputs.has(s.toLowerCase())))];
    }

    /* ---------------- build ---------------- */
    _build() {
      const root = this.shadowRoot || this.attachShadow({ mode: "open" });
      root.innerHTML = `<style>${CSS}</style>
        <ha-card>
          <div class="plate">
            <div class="screen" id="screen"><div class="lcd dark" id="lcd"></div>
              <div class="volov" id="volov"><span>${this.t("volume")}</span><div class="bar"><i id="volbar"></i></div><b id="volval"></b></div>
              <div class="toast" id="toast"></div><div class="glare"></div></div>
            <div class="ctrl">
              <div class="toprow"><button class="pwr" id="pwr" aria-label="Aan/uit" title="Aan/uit">⏻</button><div class="logo" id="logo">NAD</div></div>
              <div class="knobwrap" id="knob" role="slider" aria-label="Volume / menu" tabindex="0">
                <svg class="ring" id="ring" viewBox="0 0 120 120"><circle cx="60" cy="60" r="55"/></svg>
                <div class="knob"><div class="ind" id="ind"></div><div class="cap"></div></div>
                <span class="zone zl">◀</span><span class="zone zr">▶</span>
              </div>
              <div class="arrows"><button class="arr" id="aprev" aria-label="Vorige">◀</button><button class="arr" id="anext" aria-label="Volgende">▶</button></div>
            </div>
          </div>
          <div class="remote" id="remote"></div>
        </ha-card>`;
      this.$ = (id) => root.getElementById(id);
      this._angle = 0;
      this._menu = null;
      this._bindKnob();
      this.$("aprev").addEventListener("click", (e) => { e.stopPropagation(); this._arrow(-1); });
      this.$("anext").addEventListener("click", (e) => { e.stopPropagation(); this._arrow(1); });
      this.$("lcd").addEventListener("click", (e) => this._lcdClick(e));
      this.$("pwr").addEventListener("click", (e) => { e.stopPropagation(); this._power(); });
      this.$("remote").addEventListener("click", (e) => this._remoteClick(e));
      this._built = true;
    }

    /* ---------------- knob input ---------------- */
    _bindKnob() {
      const k = this.$("knob");
      const HOLD = 600, REPEAT_DELAY = 450, REPEAT_EVERY = 130;
      k.style.setProperty("--hold-ms", `${HOLD}ms`);
      k.addEventListener("contextmenu", (e) => e.preventDefault());
      k.addEventListener("pointerdown", (e) => {
        if (e.button !== undefined && e.button !== 0) return;
        e.preventDefault();
        k.setPointerCapture?.(e.pointerId);
        const r = k.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
        const zone = Math.hypot(dx, dy) < r.width * 0.2 ? "c" : dx < 0 ? "l" : "r";
        const holdMenu = zone === "c" || this._config.hold_sides === "menu";
        this._ptr = { zone, x: e.clientX, y: e.clientY, long: false, repeated: false };
        k.classList.add("pressed");
        if (holdMenu) {
          this.$("ring").classList.add("holding");
          this._ptr.timer = setTimeout(() => { this._ptr.long = true; this.$("ring").classList.remove("holding"); this._longPress(); this._vibrate(30); }, HOLD);
        } else {
          this._ptr.timer = setTimeout(() => {
            this._ptr.repeated = true;
            const dir = zone === "l" ? -1 : 1;
            this._turn(dir);
            this._ptr.rep = setInterval(() => this._turn(dir), REPEAT_EVERY);
          }, REPEAT_DELAY);
        }
      });
      const end = (cancel) => {
        const p = this._ptr; if (!p) return;
        clearTimeout(p.timer); clearInterval(p.rep);
        k.classList.remove("pressed"); this.$("ring").classList.remove("holding");
        this._ptr = null;
        if (cancel || p.long || p.repeated) { if (p.repeated) this._flushVolume(); return; }
        if (p.zone === "c") { this._press(); this._vibrate(12); }
        else { this._turn(p.zone === "l" ? -1 : 1); this._vibrate(8); }
      };
      k.addEventListener("pointerup", () => end(false));
      k.addEventListener("pointercancel", () => end(true));
      k.addEventListener("pointermove", (e) => {
        const p = this._ptr;
        if (p && p.zone === "c" && !p.long && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 18) end(true);
      });
      k.addEventListener("wheel", (e) => { e.preventDefault(); this._turn(e.deltaY < 0 ? 1 : -1); }, { passive: false });
      k.addEventListener("keydown", (e) => {
        if (e.key === "ArrowRight" || e.key === "ArrowUp") { e.preventDefault(); this._turn(1); }
        else if (e.key === "ArrowLeft" || e.key === "ArrowDown") { e.preventDefault(); this._turn(-1); }
        else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); this._press(); }
        else if (e.key === "m" || e.key === "Escape") { e.preventDefault(); this._longPress(); }
      });
      k.addEventListener("click", (e) => e.stopPropagation());
    }
    _vibrate(ms) { try { navigator.vibrate?.(ms); } catch (_) {} }

    _isLocked() { return this._config.knob_lock && !(this._unlockUntil > Date.now()); }

    _turn(dir) {
      const k = this.$("knob");
      if (this._isLocked() && !this._menu) { this._toast(this.t("locked")); return; }
      this._angle += dir * 14;
      this.$("ind").style.transform = `rotate(${this._angle}deg)`;
      k.classList.remove("flash-l", "flash-r"); void k.offsetWidth; k.classList.add(dir < 0 ? "flash-l" : "flash-r");
      clearTimeout(this._flashT); this._flashT = setTimeout(() => k.classList.remove("flash-l", "flash-r"), 220);
      if (this._menu) { this._menuStep(dir); this._menuTouch(); return; }
      this._volumeStep(dir);
    }

    _press() {
      if (this._menu) { this._menuPress(); this._menuTouch(); return; }
      if (this._isLocked()) { this._toast(this.t("locked")); return; }
      const p = this.st(this._e.player);
      if (!p) return;
      this.call("media_player", "media_play_pause", { entity_id: this._e.player });
    }

    _longPress() {
      if (this._config.knob_lock && this._isLocked() && !this._menu) {
        this._unlockUntil = Date.now() + 30000; this._toast(this.t("unlocked")); return;
      }
      if (this._menu) this._closeMenu(); else this._openMenu();
    }

    _arrow(dir) {
      if (this._menu) { this._menuStep(dir); this._menuTouch(); return; }
      this.call("media_player", dir < 0 ? "media_previous_track" : "media_next_track", { entity_id: this._e.player });
    }

    /* ---------------- volume ---------------- */
    _curVol() {
      if (this._volTarget != null && Date.now() - this._volTouched < 3000) return this._volTarget;
      return this.st(this._e.player)?.attributes.volume_level ?? 0;
    }
    _volumeStep(dir) {
      const step = Number(this._config.step) / 100;
      const v = Math.max(0, Math.min(1, Math.round((this._curVol() + dir * step) * 1000) / 1000));
      this._volTarget = v; this._volTouched = Date.now();
      this._showVol(v);
      clearTimeout(this._volSend);
      const send = () => { this._lastSent = Date.now(); this.call("media_player", "volume_set", { entity_id: this._e.player, volume_level: this._volTarget }); };
      if (this._ptr?.repeated && (!this._lastSent || Date.now() - this._lastSent > 350)) send();
      else this._volSend = setTimeout(send, 220);
    }
    _flushVolume() {
      if (this._volTarget == null) return;
      clearTimeout(this._volSend);
      this.call("media_player", "volume_set", { entity_id: this._e.player, volume_level: this._volTarget });
    }
    _volLabel(v) {
      if (this._config.volume_unit === "db") {
        const lo = parseFloat(this.st(this._e.volume_min)?.state ?? -80), hi = parseFloat(this.st(this._e.volume_max)?.state ?? 0);
        if (!isNaN(lo) && !isNaN(hi)) return `${(lo + v * (hi - lo)).toFixed(0)} dB`;
      }
      return `${Math.round(v * 100)}%`;
    }
    _showVol(v) {
      this.$("volbar").style.width = `${(v * 100).toFixed(1)}%`;
      this.$("volval").textContent = this._volLabel(v);
      const o = this.$("volov"); o.classList.add("show");
      clearTimeout(this._volHide); this._volHide = setTimeout(() => o.classList.remove("show"), 1800);
    }
    _toast(msg) {
      const t = this.$("toast"); t.textContent = msg; t.classList.add("show");
      clearTimeout(this._toastT); this._toastT = setTimeout(() => t.classList.remove("show"), 1600);
    }

    /* ---------------- menu ---------------- */
    _buildMenu() {
      const e = this._e, hide = new Set(this._config.hide_menu || []), t = (k) => this.t(k);
      const sel = (id) => (this.st(id) && !BAD.has(this.st(id).state) ? { type: "select", entity: id } : null);
      const nb = (id) => (this.st(id) && !BAD.has(this.st(id).state) ? { type: "number", entity: id } : null);
      const sw = (id) => (this.st(id) && !BAD.has(this.st(id).state) ? { type: "toggle", entity: id } : null);
      const items = [];
      const p = this.st(e.player);
      if (!hide.has("sources")) {
        const src = this._sources();
        if (src.length) items.push({ label: t("sources"), type: "list", items: () => src.map((s) => ({ label: s, type: "action", current: () => this.st(e.player)?.attributes.source === s,
          run: () => this.call("media_player", "select_source", { entity_id: e.player, source: s }) })) });
      }
      if (!hide.has("presets")) {
        const pr = this._presets();
        if (pr.length) items.push({ label: t("presets"), type: "list", items: () => pr.map((s) => ({ label: s, type: "action",
          current: () => this.st(e.presets)?.attributes.source === s,
          run: () => this.call("media_player", "select_source", { entity_id: e.presets, source: s }) })) });
      }
      if (!hide.has("playback") && p) {
        const sub = [{ label: t("shuffle"), type: "fn", get: () => !!this.st(e.player)?.attributes.shuffle, opts: [false, true],
          fmt: (v) => (v ? t("on") : t("off")), set: (v) => this.call("media_player", "shuffle_set", { entity_id: e.player, shuffle: v }) }];
        if ("repeat" in (p.attributes || {})) sub.push({ label: t("repeat"), type: "fn", get: () => this.st(e.player)?.attributes.repeat, opts: ["off", "all", "one"],
          fmt: (v) => ({ off: t("off"), all: "Alles", one: "Eén" }[v] || v), set: (v) => this.call("media_player", "repeat_set", { entity_id: e.player, repeat: v }) });
        items.push({ label: t("playback"), type: "list", items: () => sub });
      }
      const set = [];
      const add = (key, label, item) => { if (item && !hide.has(key)) set.push({ label, ...item }); };
      add("sleep", t("sleep"), sel(e.sleep_timer));
      const tone = [sw(e.tone_controls) && { label: t("tone_on"), ...sw(e.tone_controls) }, nb(e.bass) && { label: t("bass"), ...nb(e.bass) },
        nb(e.treble) && { label: t("treble"), ...nb(e.treble) }, nb(e.balance) && { label: t("balance"), ...nb(e.balance) }].filter(Boolean);
      if (tone.length && !hide.has("tone")) set.push({ label: t("tone"), type: "list", items: () => tone });
      add("subwoofer", t("subwoofer"), sw(e.subwoofer));
      const disp = [sw(e.auto_display_brightness) && { label: t("auto_bright"), ...sw(e.auto_display_brightness) },
        nb(e.display_brightness) && { label: t("brightness"), ...nb(e.display_brightness) },
        sw(e.dark_mode) && { label: t("dark"), ...sw(e.dark_mode) },
        sel(e.indicator_brightness) && { label: t("indicator"), ...sel(e.indicator_brightness) }].filter(Boolean);
      if (disp.length && !hide.has("display")) set.push({ label: t("display"), type: "list", items: () => disp });
      add("bluetooth", t("bluetooth"), sel(e.bluetooth));
      const lim = [nb(e.volume_min) && { label: t("vmin"), ...nb(e.volume_min) }, nb(e.volume_max) && { label: t("vmax"), ...nb(e.volume_max) }].filter(Boolean);
      if (lim.length && !hide.has("limits")) set.push({ label: t("limits"), type: "list", items: () => lim });
      add("replay", t("replay"), sel(e.replay_gain));
      add("output", t("output"), sel(e.output_mode));
      if (set.length) items.push({ label: t("settings"), type: "list", items: () => set });
      return { label: t("menu"), type: "list", items: () => items };
    }

    _openMenu() {
      this.$("volov").classList.remove("show");
      this._menu = { stack: [{ node: this._buildMenu(), idx: 0 }], edit: null };
      this._menuTouch(); this._render();
    }
    _closeMenu() { this._menu = null; clearTimeout(this._menuT); this._render(); }
    _menuTouch() {
      clearTimeout(this._menuT);
      this._menuT = setTimeout(() => this._closeMenu(), (Number(this._config.menu_timeout) || 30) * 1000);
    }
    _top() { return this._menu.stack[this._menu.stack.length - 1]; }
    _items(node) { return node.items(); }

    _valueOf(item) {
      if (item.type === "fn") return item.get();
      const s = this.st(item.entity); if (!s) return null;
      if (item.type === "toggle") return s.state === "on";
      if (item.type === "number") return parseFloat(s.state);
      return s.state;
    }
    _fmt(item, v) {
      if (item.type === "fn") return item.fmt(v);
      if (item.type === "toggle") return v ? this.t("on") : this.t("off");
      if (item.type === "number") {
        const u = this.st(item.entity)?.attributes.unit_of_measurement;
        const step = this.st(item.entity)?.attributes.step ?? 1;
        const n = Number(v).toFixed(step < 1 ? 1 : 0);
        return `${v > 0 && /bass|treble|balance/.test(item.entity) ? "+" : ""}${n}${u ? " " + u : ""}`;
      }
      if (item.type === "select" && /sleep/.test(item.entity)) return v === "off" ? this.t("off") : `${v} ${this.t("min")}`;
      return v ?? "—";
    }

    _menuStep(dir) {
      const m = this._menu, top = this._top();
      if (m.edit) {
        const it = m.edit.item;
        if (it.type === "number") {
          const a = this.st(it.entity).attributes;
          m.edit.value = Math.max(a.min, Math.min(a.max, Math.round((m.edit.value + dir * (a.step || 1)) * 100) / 100));
        } else {
          const opts = it.type === "toggle" ? [false, true] : it.type === "fn" ? it.opts : this.st(it.entity).attributes.options;
          const i = opts.findIndex((o) => o === m.edit.value);
          m.edit.value = opts[Math.max(0, Math.min(opts.length - 1, (i < 0 ? 0 : i) + dir))];
        }
      } else {
        const n = this._items(top.node).length;
        top.idx = Math.max(-1, Math.min(n - 1, top.idx + dir));
      }
      this._render();
    }

    _menuPress() {
      const m = this._menu, top = this._top();
      if (m.edit) { this._commit(m.edit.item, m.edit.value); m.edit = null; this._render(); return; }
      if (top.idx === -1) { this._menuBack(); return; }
      const it = this._items(top.node)[top.idx];
      if (!it) return;
      if (it.type === "list") { m.stack.push({ node: it, idx: 0 }); }
      else if (it.type === "action") { it.run(); this._toast(it.label); setTimeout(() => this._closeMenu(), 400); }
      else { m.edit = { item: it, value: this._valueOf(it) }; }
      this._render();
    }
    _menuBack() {
      const m = this._menu;
      if (m.edit) { m.edit = null; this._render(); return; }
      if (m.stack.length > 1) { m.stack.pop(); this._render(); } else this._closeMenu();
    }
    _commit(item, v) {
      if (item.type === "fn") return item.set(v);
      const [domain] = item.entity.split(".");
      if (item.type === "toggle") return this.call(domain, v ? "turn_on" : "turn_off", { entity_id: item.entity });
      if (item.type === "number") return this.call("number", "set_value", { entity_id: item.entity, value: v });
      return this.call("select", "select_option", { entity_id: item.entity, option: v });
    }

    _lcdClick(e) {
      if (!this._menu) {
        if (!e.target.closest(".volov")) this.dispatchEvent(new CustomEvent("hass-more-info", { bubbles: true, composed: true, detail: { entityId: this._e.player } }));
        return;
      }
      this._menuTouch();
      if (e.target.closest(".mback")) { this._menuBack(); return; }
      const row = e.target.closest(".mrow"); if (!row) return;
      const i = Number(row.dataset.i), top = this._top();
      if (this._menu.edit) { if (top.idx === i) this._menuPress(); else { this._menu.edit = null; top.idx = i; this._render(); } return; }
      top.idx = i; this._menuPress();
    }

    /* ---------------- power ---------------- */
    _isActive() { const s = this.st(this._e?.player)?.state; return s === "playing" || s === "paused" || s === "buffering"; }
    _power() {
      const id = this._e.player; if (!id) return;
      if (this._isActive()) {
        if (this._config.confirm_off !== false && !this._pwrConfirm) {
          this._pwrConfirm = true; this._toast(this.t("off_confirm")); this._renderPower();
          clearTimeout(this._pwrT); this._pwrT = setTimeout(() => { this._pwrConfirm = false; this._renderPower(); }, 4000);
          return;
        }
        this._pwrConfirm = false; clearTimeout(this._pwrT);
        this.call("media_player", "media_stop", { entity_id: id });
        this._toast(this.t("stopped_sb")); this._renderPower();
        return;
      }
      // wake: resume last track, fall back to a preset / input after 5 s
      this._waking = true; this._renderPower(); this._toast(this.t("waking"));
      this.call("media_player", "media_play", { entity_id: id });
      clearTimeout(this._wakeT);
      this._wakeT = setTimeout(() => {
        this._waking = false;
        if (this.st(id)?.state === "playing") { this._renderPower(); return; }
        const fb = String(this._config.wake_fallback || "").trim();
        if (!fb) { this._toast(this.t("wake_fail")); this._renderPower(); return; }
        const inPresets = this._presets().some((x) => x.toLowerCase() === fb.toLowerCase());
        const list = inPresets ? this._presets() : this._sources();
        const name = list.find((x) => x.toLowerCase() === fb.toLowerCase()) || fb;
        this.call("media_player", "select_source", { entity_id: inPresets ? this._e.presets : id, source: name });
        this._toast(`${this.t("wake_fb")} ${name}`); this._renderPower();
      }, 5000);
    }
    _renderPower() {
      const b = this.$("pwr"); if (!b) return;
      b.className = `pwr${this._isActive() ? " on" : ""}${this._pwrConfirm ? " confirm" : ""}${this._waking ? " busy" : ""}`;
      b.title = this.t("power");
    }

    /* ---------------- remote ---------------- */
    _renderRemote() {
      const r = this.$("remote");
      if (!this._config.show_remote) { r.hidden = true; return; }
      r.hidden = false;
      const p = this.st(this._e.player);
      const muted = !!p?.attributes.is_volume_muted, playing = p?.state === "playing";
      const presets = this._presets().slice(0, Number(this._config.remote_presets) || 0);
      const html = `
        <button class="rb${this._isActive() ? " on" : ""}" data-a="power" title="${this.t("power")}"><ha-icon icon="mdi:power"></ha-icon></button>
        <span class="sep"></span>
        <button class="rb${muted ? " on" : ""}" data-a="mute" title="Mute"><ha-icon icon="mdi:volume-${muted ? "off" : "mute"}"></ha-icon></button>
        <button class="rb" data-a="vdn" title="Vol −"><ha-icon icon="mdi:volume-minus"></ha-icon></button>
        <button class="rb" data-a="vup" title="Vol +"><ha-icon icon="mdi:volume-plus"></ha-icon></button>
        <span class="sep"></span>
        <button class="rb" data-a="prev" title="Vorige"><ha-icon icon="mdi:skip-previous"></ha-icon></button>
        <button class="rb" data-a="pp" title="Play/pauze"><ha-icon icon="mdi:${playing ? "pause" : "play"}"></ha-icon></button>
        <button class="rb" data-a="next" title="Volgende"><ha-icon icon="mdi:skip-next"></ha-icon></button>
        ${presets.length ? '<span class="sep"></span>' : ""}
        ${presets.map((s, i) => `<button class="rb num" data-a="preset" data-s="${esc(s)}" title="${esc(s)}">${i + 1}</button>`).join("")}`;
      if (html !== this._lastRemote) { r.innerHTML = html; this._lastRemote = html; }
    }
    _remoteClick(e) {
      const b = e.target.closest(".rb"); if (!b) return;
      const id = this._e.player, a = b.dataset.a;
      if (a === "power") return this._power();
      if (a === "mute") this.call("media_player", "volume_mute", { entity_id: id, is_volume_muted: !this.st(id)?.attributes.is_volume_muted });
      else if (a === "vdn" || a === "vup") this._volumeStep(a === "vup" ? 1 : -1);
      else if (a === "prev") this.call("media_player", "media_previous_track", { entity_id: id });
      else if (a === "next") this.call("media_player", "media_next_track", { entity_id: id });
      else if (a === "pp") this.call("media_player", "media_play_pause", { entity_id: id });
      else if (a === "preset") this.call("media_player", "select_source", { entity_id: this._e.presets, source: b.dataset.s });
    }

    /* ---------------- render ---------------- */
    _viewFor(source, p) {
      const c = this._config, key = `view_${srcKey(source)}`;
      let v = c[key] && c[key] !== "auto" ? c[key] : c.default_view;
      if (!v || v === "auto") {
        const phys = PHYSICAL.includes(String(source || "").toLowerCase());
        const hasMeta = !!(p.attributes.media_artist || p.attributes.media_album_name);
        v = phys && !hasMeta ? "source" : "art_text";
      }
      return v;
    }

    _update() {
      if (!this._built || !this._hass) return;
      this._e = this._resolve();
      if (this._volTarget != null) {
        const real = this.st(this._e.player)?.attributes.volume_level;
        if (real != null && Math.abs(real - this._volTarget) < 0.005) this._volTarget = null;
      }
      this._render();
    }

    _render() {
      if (!this._built) return;
      const lcd = this.$("lcd"), e = this._e || {}, p = this.st(e.player);
      const logo = this.$("logo"), knob = this.$("knob");
      knob.classList.toggle("locked", this._isLocked());
      this._renderPower();
      if (!p) { lcd.className = "lcd off"; lcd.innerHTML = `<div class="stby">${this.t("no_player")}</div>`; logo.className = "logo"; this._renderRemote(); return; }
      const off = p.state === "off" || BAD.has(p.state);
      const dm = this._config.dark_mode;
      const dark = dm === "always" ? true : dm === "never" ? false : (this.st(e.dark_mode)?.state ?? "on") !== "off";
      const ind = this.st(e.indicator_brightness)?.state;
      logo.className = `logo${off ? "" : ind === "Off" ? "" : ind === "Dim" ? " dim" : " on"}`;
      if (this._menu) { this._lastLcd = null; lcd.className = `lcd ${dark ? "dark" : "light"}`; lcd.innerHTML = this._menuHtml(); this._stopVu(); this._renderRemote(); return; }
      if (off) {
        lcd.className = "lcd off"; this._lastLcd = null;
        lcd.innerHTML = `<div class="stby">${BAD.has(p.state) ? this.t("offline") : this.t("standby")}</div>`;
        this._stopVu(); this._renderRemote(); return;
      }
      lcd.className = `lcd ${dark ? "dark" : "light"}`;
      const a = p.attributes, src = a.source || "", view = this._viewFor(src, p);
      const pic = a.entity_picture ? this._hass.hassUrl(a.entity_picture) : null;
      const stateTxt = p.state === "paused" ? this.t("paused") : p.state === "idle" ? this.t("stopped") : "";
      const sbar = `<div class="sbar"><span class="src">${esc(src || "BluOS")}</span><span>${a.is_volume_muted ? "🔇 " + this.t("mute") : stateTxt}</span></div>`;
      let body = "";
      if (view === "source") {
        body = `<div class="bigsrc"><div class="n">${esc(src || a.media_title || "")}</div><div class="v">${this.t("volume")} ${this._volLabel(this._curVol())}</div></div>`;
      } else if (view === "vu") {
        body = `<div class="vu">${[0, 1].map((ch) => `<svg viewBox="0 0 100 70"><rect class="face" x="2" y="2" width="96" height="66" rx="4"/>
          <path class="scale" d="M18 38 A40 40 0 0 1 72 26"/><path class="red" d="M72 26 A40 40 0 0 1 84 38"/>
          <text x="10" y="20">-20</text><text x="44" y="15">-3</text><text x="78" y="20">+3</text><text x="8" y="62">${ch ? "R" : "L"}</text>
          <line class="needle" id="n${ch}" x1="50" y1="62" x2="50" y2="14"/></svg>`).join("")}</div>`;
      } else {
        const art = `<div class="art" style="${pic ? `background-image:url('${pic}')` : ""}">${pic ? "" : "♪"}</div>`;
        if (view === "art") body = `<div class="np art-only">${art}</div>`;
        else body = `<div class="np">${art}<div class="txt"><div class="t1">${esc(a.media_title || src)}</div>
          <div class="t2">${esc(a.media_album_name || "")}</div><div class="t3">${esc(a.media_artist || "")}</div></div></div>`;
      }
      const prog = a.media_duration ? `<div class="prog"><span id="pcur"></span><div class="bar"><i id="pbar"></i></div><span>${fmtTime(a.media_duration)}</span></div>` : "";
      const html = sbar + body + prog;
      if (html !== this._lastLcd) { lcd.innerHTML = html; this._lastLcd = html; }
      this._updateProgress();
      if (view === "vu" && p.state === "playing") this._startVu(); else this._stopVu();
      this._renderRemote();
    }

    _menuHtml() {
      const m = this._menu, top = this._top(), items = this._items(top.node);
      const title = top.node.label;
      const rows = items.map((it, i) => {
        const sel = top.idx === i, edit = m.edit && sel;
        let val = "";
        if (it.type === "list") val = `<span class="chev">›</span>`;
        else if (it.type === "action") val = it.current?.() ? "●" : "";
        else val = esc(this._fmt(it, edit ? m.edit.value : this._valueOf(it)));
        return `<div class="mrow${sel ? " sel" : ""}${edit ? " edit" : ""}" data-i="${i}"><span>${esc(it.label)}</span><span class="mv">${val}</span></div>`;
      });
      // keep the highlighted row visible (max ~5 rows)
      const vis = 5, start = Math.max(0, Math.min(Math.max(0, top.idx - 2), items.length - vis));
      return `<div class="menu"><div class="mh"><span class="mback${top.idx === -1 ? " sel" : ""}">‹</span><span>${esc(title)}</span></div>
        <div class="mlist">${rows.slice(start, start + vis).join("")}</div></div>`;
    }

    _updateProgress() {
      const p = this.st(this._e?.player), cur = this.$("pcur"), bar = this.$("pbar");
      if (!p || !cur || !bar) return;
      const a = p.attributes;
      let pos = a.media_position ?? 0;
      if (p.state === "playing" && a.media_position_updated_at) pos += (Date.now() - Date.parse(a.media_position_updated_at)) / 1000;
      if (a.media_duration) pos = Math.min(pos, a.media_duration);
      cur.textContent = fmtTime(pos);
      bar.style.width = a.media_duration ? `${(pos / a.media_duration) * 100}%` : "0";
    }

    _startVu() {
      if (this._vuRaf) return;
      let l = 0.4, r = 0.4, tl = 0.5, tr = 0.5, last = 0;
      const loop = (ts) => {
        if (ts - last > 90) {
          last = ts;
          const v = this._curVol();
          const base = 0.35 + v * 0.45;
          tl = Math.min(1, Math.max(0, base + (Math.random() - 0.5) * 0.45));
          tr = Math.min(1, Math.max(0, tl + (Math.random() - 0.5) * 0.18));
        }
        l += (tl - l) * 0.25; r += (tr - r) * 0.25;
        const n0 = this.shadowRoot.getElementById("n0"), n1 = this.shadowRoot.getElementById("n1");
        if (n0) n0.style.transform = `rotate(${-45 + l * 90}deg)`;
        if (n1) n1.style.transform = `rotate(${-45 + r * 90}deg)`;
        this._vuRaf = requestAnimationFrame(loop);
      };
      this._vuRaf = requestAnimationFrame(loop);
    }
    _stopVu() { if (this._vuRaf) cancelAnimationFrame(this._vuRaf); this._vuRaf = null; }
  }

  if (!customElements.get(TAG)) {
    customElements.define(TAG, NadC700Card);
    window.customCards = window.customCards || [];
    window.customCards.push({ type: TAG, name: "NAD C 700 Card",
      description: "Front panel of the NAD C 700 (V2): display, VOLUME-MENU knob, menu and BC1 remote.", preview: true });
    console.info(`%c NAD-C700-CARD %c v${VERSION} `, "background:#222;color:#fff", "background:#4a4e54;color:#fff");
  }
})();
