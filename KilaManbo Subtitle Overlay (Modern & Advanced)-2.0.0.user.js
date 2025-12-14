// ==UserScript==
// @name        KilaManbo Subtitle Overlay (Modern & Advanced)
// @namespace   ttdc-kilamanbo-sub-modern
// @version     2.0.0
// @description Overlay subtitle synced with video. Modern UI, Draggable, Auto-save settings, Tabbed interface.
// @match       https://kilamanbo.com/*
// @grant       GM_addStyle
// @grant       GM_registerMenuCommand
// @grant       GM_setValue
// @grant       GM_getValue
// ==/UserScript==

(() => {
  "use strict";

  /********************
   * Icons (SVG)
   ********************/
  const ICONS = {
    sub: `<svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path><line x1="9" y1="10" x2="15" y2="10"></line><line x1="9" y1="14" x2="15" y2="14"></line></svg>`,
    close: `<svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`,
    file: `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>`,
    link: `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>`,
    settings: `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>`,
    list: `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>`
  };

  /********************
   * Utilities
   ********************/
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => root.querySelectorAll(sel);

  function safeJsonParse(s) {
    try { return JSON.parse(s); } catch { return null; }
  }

  function decodeHtmlEntities(str) {
    const t = document.createElement("textarea");
    t.innerHTML = str;
    return t.value;
  }

  function normText(t) {
    return decodeHtmlEntities(String(t || ""))
      .replace(/\r/g, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/?[^>]+>/g, "");
  }

  // --- STORAGE HELPERS (with localStorage fallback) ---
  const STORAGE_KEY = "km_sub_settings_v2";
  function loadSettings() {
    let saved = null;
    try {
        // Try GM first if available/supported
        if (typeof GM_getValue === 'function') saved = GM_getValue(STORAGE_KEY);
    } catch(e) {}

    if (!saved) {
        try { saved = localStorage.getItem(STORAGE_KEY); } catch(e){}
    }

    // Default settings
    const defaults = {
      fontSize: 28,
      color: "#ffffff",
      bgColor: "rgba(0,0,0,0.75)",
      offset: 0,
      posBottom: 80,
      posLeftPercent: 50
    };

    if (saved) {
      if (typeof saved === 'string' && saved.startsWith('{')) saved = JSON.parse(saved);
      return { ...defaults, ...saved };
    }
    return defaults;
  }

  function saveSettings(settings) {
    try {
        if (typeof GM_setValue === 'function') GM_setValue(STORAGE_KEY, settings);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch(e) {}
  }

  /********************
   * Subtitle Parsers
   ********************/
  function parseTimeToSec(s) {
    s = s.trim();
    const m = s.match(/(\d+):(\d{2}):(\d{2})([.,](\d{1,3}))?/);
    if (!m) return NaN;
    const hh = parseInt(m[1], 10);
    const mm = parseInt(m[2], 10);
    const ss = parseInt(m[3], 10);
    const ms = m[5] ? parseInt(m[5].padEnd(3, "0"), 10) : 0;
    return hh * 3600 + mm * 60 + ss + ms / 1000;
  }

  function parseSRT(text) {
    text = normText(text).trim();
    if (!text) return [];
    const blocks = text.split(/\n{2,}/);
    const cues = [];
    for (const b of blocks) {
      const lines = b.split("\n").map(l => l.trimEnd());
      if (lines.length < 2) continue;
      let idx = 0;
      if (/^\d+$/.test(lines[0].trim())) idx = 1;
      const timeLine = lines[idx] || "";
      const tm = timeLine.match(/(.+?)\s*-->\s*(.+?)(\s+.+)?$/);
      if (!tm) continue;
      const start = parseTimeToSec(tm[1]);
      const end = parseTimeToSec(tm[2]);
      if (!isFinite(start) || !isFinite(end)) continue;
      const payload = lines.slice(idx + 1).join("\n").trim();
      if (!payload) continue;
      cues.push({ start, end, text: payload });
    }
    return cues.sort((a, b) => a.start - b.start);
  }

  function parseVTT(text) {
    text = normText(text).trim();
    if (!text) return [];
    text = text.replace(/^WEBVTT.*\n+/i, "");
    const blocks = text.split(/\n{2,}/);
    const cues = [];
    for (const b of blocks) {
      const lines = b.split("\n").map(l => l.trimEnd());
      if (!lines.length) continue;
      let idx = 0;
      if (lines[0] && !lines[0].includes("-->") && lines.length > 1) idx = 1;
      const timeLine = lines[idx] || "";
      const tm = timeLine.match(/(.+?)\s*-->\s*(.+?)(\s+.+)?$/);
      if (!tm) continue;
      const start = parseTimeToSec(tm[1]);
      const end = parseTimeToSec(tm[2]);
      if (!isFinite(start) || !isFinite(end)) continue;
      const payload = lines.slice(idx + 1).join("\n").trim();
      if (!payload) continue;
      cues.push({ start, end, text: payload });
    }
    return cues.sort((a, b) => a.start - b.start);
  }

  function parseSubtitleAny(text) {
    const t = (text || "").trim();
    if (!t) return [];
    if (/^WEBVTT/i.test(t)) return parseVTT(t);
    if (t.includes("-->") && /[0-9]\.[0-9]{2,3}/.test(t)) return parseVTT(t);
    return parseSRT(t);
  }

  function findCueIndex(cues, t) {
    let lo = 0, hi = cues.length - 1, best = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (cues[mid].start <= t) { best = mid; lo = mid + 1; }
      else hi = mid - 1;
    }
    if (best === -1) return -1;
    if (t <= cues[best].end) return best;
    return -1;
  }

  /********************
   * UI & CSS
   ********************/
  GM_addStyle(`
    :root {
      --km-bg: rgba(20, 20, 22, 0.85);
      --km-bg-blur: 12px;
      --km-accent: #6c5ce7;
      --km-text: #ffffff;
      --km-text-dim: #a0a0a0;
      --km-border: rgba(255, 255, 255, 0.1);
      --km-radius: 12px;
      --km-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    }

    /* Floating Button */
    .kmSubFab {
      position: fixed; right: 20px; bottom: 80px; z-index: 999999;
      width: 48px; height: 48px;
      background: var(--km-accent); color: #fff;
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      cursor: pointer;
      box-shadow: 0 4px 15px rgba(108, 92, 231, 0.4);
      transition: transform 0.2s, background 0.2s;
    }
    .kmSubFab:hover { transform: scale(1.1); background: #5b4cc4; }

    /* Main Panel */
    .kmPanel {
      position: fixed; right: 20px; bottom: 140px; z-index: 999999;
      width: 380px; max-width: 90vw;
      max-height: 80vh;
      background: var(--km-bg);
      backdrop-filter: blur(var(--km-bg-blur));
      -webkit-backdrop-filter: blur(var(--km-bg-blur));
      border: 1px solid var(--km-border);
      border-radius: var(--km-radius);
      box-shadow: var(--km-shadow);
      color: var(--km-text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      font-size: 14px;
      display: flex; flex-direction: column;
      opacity: 0; pointer-events: none; transform: translateY(10px);
      transition: opacity 0.2s, transform 0.2s;
    }
    .kmPanel.active { opacity: 1; pointer-events: auto; transform: translateY(0); }

    /* Header */
    .kmHeader {
      display: flex; align-items: center; justify-content: space-between;
      padding: 12px 16px; border-bottom: 1px solid var(--km-border);
    }
    .kmTitle { font-weight: 700; font-size: 15px; display: flex; align-items: center; gap: 8px; }
    .kmClose { cursor: pointer; padding: 4px; border-radius: 50%; opacity: 0.7; transition: 0.2s; }
    .kmClose:hover { background: rgba(255,255,255,0.1); opacity: 1; }

    /* Tabs */
    .kmTabs { display: flex; border-bottom: 1px solid var(--km-border); background: rgba(0,0,0,0.2); }
    .kmTab {
      flex: 1; text-align: center; padding: 10px 0;
      cursor: pointer; opacity: 0.6; font-size: 13px; font-weight: 500;
      border-bottom: 2px solid transparent; transition: 0.2s;
    }
    .kmTab:hover { opacity: 0.9; background: rgba(255,255,255,0.03); }
    .kmTab.active { opacity: 1; border-bottom-color: var(--km-accent); color: var(--km-accent); }

    /* Body */
    .kmBody { flex: 1; overflow-y: auto; padding: 16px; min-height: 200px; }
    .kmView { display: none; animation: kmFadeIn 0.2s; }
    .kmView.active { display: block; }
    @keyframes kmFadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }

    /* Inputs & Buttons */
    .kmInputGroup { margin-bottom: 16px; }
    .kmLabel { display: block; font-size: 12px; color: var(--km-text-dim); margin-bottom: 6px; }
    .kmInput {
      width: 100%; background: rgba(0,0,0,0.3); border: 1px solid var(--km-border);
      color: #fff; padding: 8px 12px; border-radius: 8px; outline: none; transition: 0.2s;
      box-sizing: border-box; /* Fix overflow */
    }
    .kmInput:focus { border-color: var(--km-accent); }
    .kmTextarea { min-height: 80px; resize: vertical; font-family: monospace; font-size: 12px; }

    .kmBtn {
      background: rgba(255,255,255,0.1); border: none; color: #fff;
      padding: 8px 16px; border-radius: 8px; cursor: pointer; font-weight: 500;
      transition: 0.2s; display: inline-flex; align-items: center; gap: 6px;
    }
    .kmBtn:hover { background: rgba(255,255,255,0.2); }
    .kmBtn.primary { background: var(--km-accent); }
    .kmBtn.primary:hover { background: #5b4cc4; }
    .kmBtn.small { font-size: 12px; padding: 4px 10px; }

    /* Sliders */
    .kmSliderWrap { display: flex; align-items: center; gap: 10px; }
    .kmSlider { flex: 1; cursor: pointer; height: 4px; accent-color: var(--km-accent); }
    .kmValue { min-width: 40px; text-align: right; font-variant-numeric: tabular-nums; font-size: 13px; }

    /* Color Palette */
    .kmColors { display: flex; gap: 8px; margin-top: 8px; }
    .kmColorDot {
      width: 24px; height: 24px; border-radius: 50%; cursor: pointer;
      border: 2px solid transparent; transition: transform 0.2s;
    }
    .kmColorDot:hover { transform: scale(1.1); }
    .kmColorDot.active { border-color: #fff; transform: scale(1.1); }

    /* Caught Links List */
    .kmLinkItem {
      background: rgba(255,255,255,0.05); padding: 10px; border-radius: 8px;
      margin-bottom: 8px; border: 1px solid var(--km-border);
      display: flex; justify-content: space-between; align-items: center;
    }
    .kmLinkInfo { flex: 1; overflow: hidden; margin-right: 10px; }
    .kmLinkUrl { font-size: 12px; opacity: 0.8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .kmLinkMeta { font-size: 11px; color: var(--km-text-dim); margin-top: 2px; }

    /* Status Bar */
    .kmStatus {
      padding: 10px 16px; background: rgba(0,0,0,0.3);
      border-top: 1px solid var(--km-border); font-size: 12px;
      display: flex; justify-content: space-between; align-items: center;
    }
    .kmTag { padding: 2px 6px; background: rgba(255,255,255,0.1); border-radius: 4px; }

    /* OVERLAY SUBTITLE */
    .kmOverlayWrap {
      position: fixed; z-index: 2147483647;
      left: 50%; transform: translateX(-50%);
      width: auto; max-width: 90vw;
      text-align: center; pointer-events: none;
    }
    .kmOverlayBox {
      background: rgba(0,0,0,0.75);
      border-radius: 8px; padding: 8px 16px;
      pointer-events: auto; cursor: move; user-select: none;
      backdrop-filter: blur(2px);
      transition: background 0.2s;
    }
    .kmOverlayText {
      color: #fff; font-family: system-ui, sans-serif;
      font-weight: 600; line-height: 1.4;
      text-shadow: 1px 1px 2px #000;
      white-space: pre-wrap; word-wrap: break-word;
      pointer-events: none;
    }
  `);

  const state = {
    video: null,
    cues: [],
    lastIdx: -1,
    caughtUrls: [],
    // Settings (loaded from storage)
    ...loadSettings()
  };

  /********************
   * Core Logic
   ********************/
  function createUI() {
    // 1. Floating Button
    const fab = document.createElement("div");
    fab.className = "kmSubFab";
    fab.innerHTML = ICONS.sub;
    fab.title = "Mở cài đặt Subtitle";
    document.body.appendChild(fab);

    // 2. Panel Structure
    const panel = document.createElement("div");
    panel.className = "kmPanel";
    panel.innerHTML = `
      <div class="kmHeader">
        <div class="kmTitle">${ICONS.sub} Subtitle Overlay</div>
        <div class="kmClose">${ICONS.close}</div>
      </div>
      <div class="kmTabs">
        <div class="kmTab active" data-tab="source">Nguồn</div>
        <div class="kmTab" data-tab="settings">Cài đặt</div>
        <div class="kmTab" data-tab="caught">Đã bắt <span id="kmCountBadge" style="font-size:10px;opacity:0.7">(0)</span></div>
      </div>

      <div class="kmBody">
        <!-- TAB 1: SOURCE -->
        <div class="kmView active" id="view-source">
          <div class="kmInputGroup">
            <label class="kmLabel">Nhập URL Subtitle (.srt, .vtt)</label>
            <div style="display:flex; gap:8px">
              <input type="text" class="kmInput" id="kmUrlInput" placeholder="https://example.com/sub.srt">
              <button class="kmBtn primary small" id="kmLoadUrlBtn">Load</button>
            </div>
          </div>

          <div class="kmInputGroup">
             <label class="kmLabel">Hoặc tải file từ máy</label>
             <input type="file" id="kmFileInput" accept=".srt,.vtt,.txt" style="display:none">
             <button class="kmBtn" id="kmPickFileBtn">${ICONS.file} Chọn file...</button>
             <span id="kmFileName" style="font-size:12px; margin-left:8px; opacity:0.7"></span>
          </div>

          <div class="kmInputGroup">
            <label class="kmLabel">Hoặc dán nội dung vào đây</label>
            <textarea class="kmInput kmTextarea" id="kmPasteArea" placeholder="1\n00:00:01,000 --> 00:00:05,000\nXin chào..."></textarea>
            <div style="margin-top:8px; display:flex; justify-content:space-between">
              <button class="kmBtn primary small" id="kmLoadPasteBtn">Load Paste</button>
              <button class="kmBtn small" id="kmClearBtn">Xóa sạch</button>
            </div>
          </div>
        </div>

        <!-- TAB 2: SETTINGS -->
        <div class="kmView" id="view-settings">
          <div class="kmInputGroup">
            <label class="kmLabel">Đồng bộ (Offset): <span id="kmOffsetVal">0.0</span>s</label>
            <div class="kmSliderWrap">
              <button class="kmBtn small" id="kmOffReset">Reset</button>
              <input type="range" class="kmSlider" id="kmOffsetRange" min="-10" max="10" step="0.1" value="0">
            </div>
            <div style="display:flex; gap:5px; margin-top:5px; justify-content:center;">
               <button class="kmBtn small" id="kmOffM">-0.5s</button>
               <button class="kmBtn small" id="kmOffP">+0.5s</button>
            </div>
          </div>

          <div class="kmInputGroup">
            <label class="kmLabel">Cỡ chữ: <span id="kmSizeVal">28</span>px</label>
            <div class="kmSliderWrap">
              <span style="font-size:12px">A-</span>
              <input type="range" class="kmSlider" id="kmSizeRange" min="12" max="60" step="1" value="28">
              <span style="font-size:16px">A+</span>
            </div>
          </div>

          <div class="kmInputGroup">
            <label class="kmLabel">Màu chữ</label>
            <div class="kmColors" id="kmColorPalette">
              <!-- JS generates dots -->
            </div>
          </div>

          <div class="kmInputGroup">
            <label class="kmLabel">Màu nền</label>
            <div style="display:flex; gap:10px; margin-top:5px">
               <button class="kmBtn small" id="kmBgBlack">Đen mờ</button>
               <button class="kmBtn small" id="kmBgTrans">Trong suốt</button>
            </div>
          </div>

           <div class="kmInputGroup">
            <label class="kmLabel">Vị trí (Reset)</label>
            <button class="kmBtn small" id="kmResetPos">Đưa về giữa dưới</button>
          </div>
        </div>

        <!-- TAB 3: CAUGHT -->
        <div class="kmView" id="view-caught">
           <div id="kmCaughtList" style="text-align:center; padding-top:20px; opacity:0.6; font-size:13px">
             (Chưa bắt được link sub nào)
           </div>
        </div>
      </div>

      <div class="kmStatus">
        <span id="kmVideoStatus">No Video</span>
        <span id="kmCueCount" class="kmTag">0 cues</span>
      </div>
    `;
    document.body.appendChild(panel);

    // 3. Elements References
    const els = {
      fab, panel,
      close: $('.kmClose', panel),
      tabs: $$('.kmTab', panel),
      views: {
        source: $('#view-source', panel),
        settings: $('#view-settings', panel),
        caught: $('#view-caught', panel)
      },
      // Source
      urlInput: $('#kmUrlInput', panel),
      loadUrl: $('#kmLoadUrlBtn', panel),
      fileInput: $('#kmFileInput', panel),
      pickFile: $('#kmPickFileBtn', panel),
      fileName: $('#kmFileName', panel),
      pasteArea: $('#kmPasteArea', panel),
      loadPaste: $('#kmLoadPasteBtn', panel),
      clear: $('#kmClearBtn', panel),
      // Settings
      offsetVal: $('#kmOffsetVal', panel),
      offsetRange: $('#kmOffsetRange', panel),
      offReset: $('#kmOffReset', panel),
      offM: $('#kmOffM', panel),
      offP: $('#kmOffP', panel),
      sizeVal: $('#kmSizeVal', panel),
      sizeRange: $('#kmSizeRange', panel),
      palette: $('#kmColorPalette', panel),
      bgBlack: $('#kmBgBlack', panel),
      bgTrans: $('#kmBgTrans', panel),
      resetPos: $('#kmResetPos', panel),
      // Caught
      caughtList: $('#kmCaughtList', panel),
      countBadge: $('#kmCountBadge', panel),
      // Status
      vidStatus: $('#kmVideoStatus', panel),
      cueCount: $('#kmCueCount', panel)
    };

    // 4. Logic Implementation
    let isPanelOpen = false;

    function togglePanel(force) {
      isPanelOpen = typeof force === 'boolean' ? force : !isPanelOpen;
      panel.classList.toggle('active', isPanelOpen);
    }

    fab.addEventListener('click', () => togglePanel());
    els.close.addEventListener('click', () => togglePanel(false));

    // Tab Switching
    els.tabs.forEach(t => t.addEventListener('click', () => {
      els.tabs.forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      const target = t.dataset.tab;
      Object.values(els.views).forEach(v => v.classList.remove('active'));
      els.views[target].classList.add('active');
    }));

    // --- Loading Subtitles ---
    function setSubData(text, sourceName) {
      const cues = parseSubtitleAny(text);
      state.cues = cues;
      state.lastIdx = -1;
      els.cueCount.textContent = `${cues.length} cues`;
      overlay.show(true);
      overlay.setText(cues.length ? `Đã load: ${sourceName}` : "Không tìm thấy sub hợp lệ");
      setTimeout(() => overlay.setText(""), 3000);
    }

    els.loadUrl.addEventListener('click', async () => {
      const url = els.urlInput.value.trim();
      if (!url) return;
      els.loadUrl.textContent = "Loading...";
      try {
        const r = await fetch(url);
        const t = await r.text();
        setSubData(t, "URL");
      } catch(e) {
        alert("Lỗi tải URL (CORS block?). Hãy thử cách khác.");
      } finally {
        els.loadUrl.textContent = "Load";
      }
    });

    els.pickFile.addEventListener('click', () => els.fileInput.click());
    els.fileInput.addEventListener('change', async () => {
        const f = els.fileInput.files?.[0];
        if(!f) return;
        els.fileName.textContent = f.name;
        const t = await f.text();
        setSubData(t, "File");
    });

    els.loadPaste.addEventListener('click', () => {
        const t = els.pasteArea.value;
        if(t.trim()) setSubData(t, "Paste");
    });

    els.clear.addEventListener('click', () => {
        state.cues = [];
        state.lastIdx = -1;
        els.cueCount.textContent = "0 cues";
        overlay.setText("");
        els.fileName.textContent = "";
        els.urlInput.value = "";
    });

    // --- Settings Logic ---
    function updateStateAndSave() {
       saveSettings({
           fontSize: state.fontSize,
           color: state.color,
           bgColor: state.bgColor,
           offset: state.offset,
           posBottom: parseInt(overlay.dom.style.bottom) || 80,
           posLeftPercent: 50 // Simplified
       });
       overlay.renderStyle();
    }

    // Offset
    function setOffset(v) {
        state.offset = parseFloat(v);
        els.offsetRange.value = state.offset;
        els.offsetVal.textContent = state.offset.toFixed(1);
        updateStateAndSave();
    }
    els.offsetRange.addEventListener('input', (e) => setOffset(e.target.value));
    els.offReset.addEventListener('click', () => setOffset(0));
    els.offM.addEventListener('click', () => setOffset(state.offset - 0.5));
    els.offP.addEventListener('click', () => setOffset(state.offset + 0.5));

    // Font Size
    els.sizeRange.addEventListener('input', (e) => {
        state.fontSize = parseInt(e.target.value);
        els.sizeVal.textContent = state.fontSize;
        updateStateAndSave();
    });

    // Colors
    const COLORS = ["#ffffff", "#ffff00", "#00ffff", "#00ff00", "#ff00ff", "#ff7979", "#fab1a0"];
    COLORS.forEach(c => {
        const dot = document.createElement("div");
        dot.className = "kmColorDot";
        dot.style.backgroundColor = c;
        dot.addEventListener('click', () => {
            $$('.kmColorDot').forEach(d => d.classList.remove('active'));
            dot.classList.add('active');
            state.color = c;
            updateStateAndSave();
        });
        if(c === state.color) dot.classList.add('active');
        els.palette.appendChild(dot);
    });

    // BG
    els.bgBlack.addEventListener('click', () => {
        state.bgColor = "rgba(0,0,0,0.75)";
        updateStateAndSave();
    });
    els.bgTrans.addEventListener('click', () => {
        state.bgColor = "transparent";
        updateStateAndSave();
    });

    // Reset Position
    els.resetPos.addEventListener('click', () => {
        overlay.resetPos();
    });

    // Initialize inputs from loaded state
    els.offsetRange.value = state.offset;
    els.offsetVal.textContent = state.offset;
    els.sizeRange.value = state.fontSize;
    els.sizeVal.textContent = state.fontSize;

    // --- Caught Links Render ---
    function renderCaught() {
        if (!state.caughtUrls.length) {
            els.caughtList.innerHTML = `(Chưa bắt được link sub nào)`;
            els.countBadge.textContent = "(0)";
            return;
        }
        els.countBadge.textContent = `(${state.caughtUrls.length})`;
        els.caughtList.innerHTML = "";
        state.caughtUrls.slice(0, 15).forEach(item => {
            const div = document.createElement("div");
            div.className = "kmLinkItem";
            div.innerHTML = `
               <div class="kmLinkInfo">
                 <div class="kmLinkUrl" title="${item.url}">${item.url.split('/').pop().split('?')[0]}</div>
                 <div class="kmLinkMeta">${item.from}</div>
               </div>
               <div style="display:flex; gap:5px">
                 <button class="kmBtn small primary" data-act="use">Dùng</button>
                 <button class="kmBtn small" data-act="copy">Copy</button>
               </div>
            `;
            const btnUse = div.querySelector('[data-act="use"]');
            const btnCopy = div.querySelector('[data-act="copy"]');

            btnUse.addEventListener('click', async () => {
                els.urlInput.value = item.url;
                els.loadUrl.click();
                els.tabs[0].click(); // Switch to source tab
            });
            btnCopy.addEventListener('click', () => navigator.clipboard.writeText(item.url));

            els.caughtList.appendChild(div);
        });
    }

    function setVideoStatus(hasVideo) {
        els.vidStatus.textContent = hasVideo ? "Video: Đã kết nối" : "Video: Chưa thấy";
        els.vidStatus.style.color = hasVideo ? "#55efc4" : "#ff7675";
    }

    return { els, renderCaught, setSubData, setVideoStatus };
  }

  const ui = createUI();

  /********************
   * Overlay Logic (Draggable)
   ********************/
  const overlay = (() => {
    const wrap = document.createElement("div");
    wrap.className = "kmOverlayWrap";
    wrap.style.bottom = (state.posBottom || 80) + "px";

    wrap.innerHTML = `
      <div class="kmOverlayBox">
        <div class="kmOverlayText"></div>
      </div>
    `;
    document.body.appendChild(wrap);

    const box = wrap.querySelector(".kmOverlayBox");
    const textEl = wrap.querySelector(".kmOverlayText");

    // Draggable
    let isDragging = false;
    let startX, startY, startLeft, startBottom;

    box.addEventListener("mousedown", (e) => {
        if(e.button !== 0) return;
        e.preventDefault();
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;

        const rect = wrap.getBoundingClientRect();
        // Convert bottom to px relative to window
        startBottom = parseInt(wrap.style.bottom) || 80;
        startLeft = rect.left;

        // Switch to fixed positioning calculation if needed,
        // but since we translate X -50%, left is center.
        // Let's control 'bottom' and 'left' (via transform)
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
    });

    function onMove(e) {
        if(!isDragging) return;
        const dy = startY - e.clientY; // move up = +bottom
        // const dx = e.clientX - startX; // move right

        let newBottom = startBottom + dy;
        wrap.style.bottom = newBottom + "px";

        // X movement is tricky with transform(-50%).
        // Simple version: only Vertical drag for now to keep centered?
        // Let's allow X but requires changing style strategy.
        // For simplicity in this version: Vertical Drag Only (safer for subtitles)
        // Or we use Left style.
        const currentLeft = parseFloat(getComputedStyle(wrap).left);
        wrap.style.left = (currentLeft + (e.clientX - startX)) + "px";
        startX = e.clientX; // reset X ref
    }

    function onUp() {
        isDragging = false;
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        // Save Position
        state.posBottom = parseInt(wrap.style.bottom);
        saveSettings({ ...state }); // simple save
    }

    function setText(t) {
        if (!t) {
            box.style.display = "none";
        } else {
            box.style.display = "block";
            textEl.textContent = t;
        }
    }

    function renderStyle() {
        textEl.style.fontSize = state.fontSize + "px";
        textEl.style.color = state.color;
        box.style.background = state.bgColor;
        if(state.bgColor === "transparent") {
            box.style.backdropFilter = "none";
            textEl.style.textShadow = "2px 2px 2px #000, -1px -1px 1px #000, 1px -1px 1px #000, -1px 1px 1px #000";
        } else {
            box.style.backdropFilter = "blur(2px)";
            textEl.style.textShadow = "1px 1px 2px #000";
        }
    }

    function resetPos() {
        wrap.style.left = "50%";
        wrap.style.bottom = "80px";
        state.posBottom = 80;
        saveSettings(state);
    }

    function show(v) { wrap.style.display = v ? "block" : "none"; }

    // Init
    renderStyle();

    // Fullscreen Fix
    function fsChange() {
        const fs = document.fullscreenElement || document.webkitFullscreenElement;
        if(fs) fs.appendChild(wrap);
        else document.body.appendChild(wrap);
    }
    document.addEventListener("fullscreenchange", fsChange);
    document.addEventListener("webkitfullscreenchange", fsChange);

    return { dom: wrap, setText, show, renderStyle, resetPos };
  })();

  /********************
   * Video Sync Loop
   ********************/
  async function videoLoop() {
    while(true) {
        const v = $('video');
        if (v && v !== state.video) {
            state.video = v;
            ui.setVideoStatus(true);

            v.addEventListener("timeupdate", () => {
                if(!state.cues.length) return;
                const t = v.currentTime + state.offset;

                // Optimized search: check next one first
                let idx = state.lastIdx;
                if (idx >= 0 && idx < state.cues.length) {
                    const c = state.cues[idx];
                    if (t >= c.start && t <= c.end) {
                        // still same cue
                    } else if (idx + 1 < state.cues.length && t >= state.cues[idx+1].start && t <= state.cues[idx+1].end) {
                        idx++;
                    } else {
                        idx = findCueIndex(state.cues, t);
                    }
                } else {
                    idx = findCueIndex(state.cues, t);
                }

                if (idx !== state.lastIdx) {
                    state.lastIdx = idx;
                    if (idx === -1) overlay.setText("");
                    else overlay.setText(state.cues[idx].text);
                }
            });

            v.addEventListener("seeked", () => { state.lastIdx = -1; overlay.setText(""); });
        } else if (!v) {
            ui.setVideoStatus(false);
            state.video = null;
        }
        await sleep(2000);
    }
  }

  /********************
   * Network Sniffer
   ********************/
  const SUB_EXT_REGEX = /\.(vtt|srt|ass|lrc)(\?|$)/i;

  function addCaughtUrl(url, from) {
     if(!url || !SUB_EXT_REGEX.test(url)) return;
     if(state.caughtUrls.some(u => u.url === url)) return;
     state.caughtUrls.unshift({ url, from });
     if(state.caughtUrls.length > 20) state.caughtUrls.pop();
     ui.renderCaught();

     // Hiệu ứng chấm đỏ trên tab
     const caughtTab = $('.kmTab[data-tab="caught"]');
     if(!caughtTab.classList.contains('active')) {
         // optional visual cue
     }
  }

  // Hook Fetch
  const origFetch = window.fetch;
  window.fetch = async function(...args) {
      const url = (args[0]?.url || args[0]) + "";
      const res = await origFetch.apply(this, args);
      // Check URL
      if(SUB_EXT_REGEX.test(url)) addCaughtUrl(url, "fetch");
      return res;
  };

  // Hook XHR
  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url) {
      this._url = url;
      return origOpen.apply(this, arguments);
  };
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function() {
      if(this._url && SUB_EXT_REGEX.test(this._url)) {
          addCaughtUrl(this._url, "xhr");
      }
      return origSend.apply(this, arguments);
  };

  /********************
   * Start
   ********************/
  ui.renderCaught();
  videoLoop();

})();