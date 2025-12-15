// ==UserScript==
// @name        KilaManbo Subtitle Overlay (Ultimate)
// @namespace   ttdc-kilamanbo-sub-ultimate
// @version     3.1.0
// @description Phiên bản nâng cấp: Hỗ trợ thêm file ASS, Giao diện Glassmorphism, Kéo thả file, Phím tắt.
// @match       https://kilamanbo.com/*
// @match       *://*/*
// @grant       GM_addStyle
// @grant       GM_setValue
// @grant       GM_getValue
// @grant       GM_registerMenuCommand
// @run-at      document-idle
// ==/UserScript==

(function () {
    "use strict";

    /********************
     * CẤU HÌNH & ICONS
     ********************/
    const CONSTANTS = {
        STORAGE_KEY: "km_sub_settings_v3",
        TOAST_DURATION: 3000,
        EXTENSIONS: /\.(vtt|srt|ass|lrc)(\?|$)/i,
    };

    const ICONS = {
        logo: `<svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12h20M2 12l5-5M2 12l5 5"/></svg>`,
        sub: `<svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="2" fill="none"><rect x="2" y="4" width="20" height="16" rx="2" ry="2"></rect><path d="M6 15h4"></path><path d="M6 11h12"></path></svg>`,
        close: `<svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`,
        upload: `<svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>`,
        settings: `<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>`,
        list: `<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>`,
        video: `<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>`,
        drag: `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><circle cx="9" cy="12" r="1"></circle><circle cx="9" cy="5" r="1"></circle><circle cx="9" cy="19" r="1"></circle><circle cx="15" cy="12" r="1"></circle><circle cx="15" cy="5" r="1"></circle><circle cx="15" cy="19" r="1"></circle></svg>`,
        check: `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><polyline points="20 6 9 17 4 12"></polyline></svg>`
    };

    /********************
     * UTILS
     ********************/
    const $ = (sel, root = document) => root.querySelector(sel);
    const $$ = (sel, root = document) => root.querySelectorAll(sel);
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    function decodeHtml(html) {
        const txt = document.createElement("textarea");
        txt.innerHTML = html;
        return txt.value;
    }

    // --- Settings Manager ---
    function getSettings() {
        const defaults = {
            fontSize: 32,
            color: "#ffffff",
            bgColor: "rgba(0,0,0,0.6)",
            textOutline: "2px black",
            fontFamily: "sans-serif",
            offset: 0,
            posBottom: 10, // percent
            opacity: 1,
            hotkeysEnabled: true
        };
        try {
            const stored = GM_getValue(CONSTANTS.STORAGE_KEY, null) || localStorage.getItem(CONSTANTS.STORAGE_KEY);
            if (stored) {
                const parsed = typeof stored === 'string' ? JSON.parse(stored) : stored;
                return { ...defaults, ...parsed };
            }
        } catch (e) { console.error("Settings load error:", e); }
        return defaults;
    }

    function saveSettings(settings) {
        try {
            GM_setValue(CONSTANTS.STORAGE_KEY, settings);
            localStorage.setItem(CONSTANTS.STORAGE_KEY, JSON.stringify(settings));
        } catch (e) {}
    }

    /********************
     * SUBTITLE PARSERS
     ********************/
    function parseTimeToSec(t) {
        t = t.trim();
        const parts = t.split(':');
        let s = 0;
        if (parts.length === 3) s += parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseFloat(parts[2].replace(',', '.'));
        else if (parts.length === 2) s += parseInt(parts[0]) * 60 + parseFloat(parts[1].replace(',', '.'));
        return s;
    }

    // Parser riêng cho file ASS
    function parseASS(text) {
        const cues = [];
        const lines = text.split(/\r?\n/);
        // Format chuẩn ASS: Dialogue: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
        // Regex linh hoạt: tìm Dialogue:, bỏ qua các trường đầu tiên, lấy Start, End và Text (field cuối)
        // Ví dụ: Dialogue: 0,0:00:01.50,0:00:03.50,Default,,0,0,0,,Xin chào
        const re = /^Dialogue:\s*[^,]+,\s*([^,]+),\s*([^,]+),[^,]*,\s*[^,]*,\s*[^,]*,\s*[^,]*,\s*[^,]*,\s*[^,]*,\s*(.*)$/i;

        lines.forEach(line => {
            if (!line.startsWith("Dialogue:")) return;
            const m = line.match(re);
            if (m) {
                const start = parseTimeToSec(m[1]);
                const end = parseTimeToSec(m[2]);
                let content = m[3];

                // 1. Loại bỏ các thẻ ASS { ... } (ví dụ: {\an8}, {\c&HFFFFFF&})
                content = content.replace(/{[^}]+}/g, "");
                // 2. Chuyển đổi \N hoặc \n thành xuống dòng
                content = content.replace(/\\N/gi, "\n");

                if (!isNaN(start) && !isNaN(end) && content.trim()) {
                    cues.push({ start, end, text: decodeHtml(content) });
                }
            }
        });
        return cues;
    }

    function parseSubtitles(text) {
        text = text.trim();
        // Kiểm tra xem có phải ASS không (có [Script Info] hoặc [Events] hoặc dòng Dialogue:)
        if (/^\[Script Info\]/i.test(text) || /\[Events\]/i.test(text) || /^Dialogue:/m.test(text)) {
            const cues = parseASS(text);
            return cues.sort((a, b) => a.start - b.start);
        }

        // Xử lý VTT/SRT (Mặc định)
        text = text.replace(/\r\n|\r/g, '\n');
        const cues = [];
        const blocks = text.split(/\n{2,}/);

        blocks.forEach(block => {
            const lines = block.split('\n');
            if (lines.length < 2) return;

            let timeLineIdx = 0;
            if (!lines[0].includes('-->')) timeLineIdx = 1; // Bỏ qua index số (SRT)

            const timeLine = lines[timeLineIdx];
            if (!timeLine || !timeLine.includes('-->')) return;

            const times = timeLine.split('-->');
            if (times.length !== 2) return;

            const start = parseTimeToSec(times[0]);
            const end = parseTimeToSec(times[1]);
            const content = lines.slice(timeLineIdx + 1).join('\n')
                .replace(/<[^>]+>/g, '') // Bỏ HTML tags cơ bản
                .trim();

            if (!isNaN(start) && !isNaN(end) && content) {
                cues.push({ start, end, text: decodeHtml(content) });
            }
        });
        return cues.sort((a, b) => a.start - b.start);
    }

    /********************
     * STYLES (CSS)
     ********************/
    GM_addStyle(`
        :root {
            --km-glass: rgba(20, 20, 25, 0.85);
            --km-glass-border: rgba(255, 255, 255, 0.12);
            --km-accent: #8e44ad;
            --km-accent-hover: #9b59b6;
            --km-text: #f5f5f5;
            --km-text-dim: #a0a0a0;
            --km-danger: #e74c3c;
            --km-success: #2ecc71;
            --km-font: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            --km-radius: 12px;
        }

        /* --- Floating Button --- */
        #km-fab {
            position: fixed; bottom: 80px; right: 20px;
            width: 48px; height: 48px;
            background: var(--km-accent);
            border-radius: 50%;
            display: flex; align-items: center; justify-content: center;
            color: white; cursor: pointer;
            box-shadow: 0 4px 15px rgba(0,0,0,0.3);
            z-index: 999990; transition: transform 0.2s, background 0.2s;
        }
        #km-fab:hover { transform: scale(1.1) rotate(5deg); background: var(--km-accent-hover); }

        /* --- Main Panel --- */
        #km-panel {
            position: fixed; bottom: 140px; right: 20px;
            width: 360px; max-height: 80vh;
            background: var(--km-glass);
            backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
            border: 1px solid var(--km-glass-border);
            border-radius: var(--km-radius);
            box-shadow: 0 10px 40px rgba(0,0,0,0.5);
            color: var(--km-text);
            font-family: var(--km-font); font-size: 14px;
            z-index: 999991;
            display: flex; flex-direction: column;
            opacity: 0; pointer-events: none; transform: translateY(20px) scale(0.95);
            transition: all 0.25s cubic-bezier(0.18, 0.89, 0.32, 1.28);
        }
        #km-panel.active { opacity: 1; pointer-events: auto; transform: translateY(0) scale(1); }

        /* Header */
        .km-header {
            padding: 14px 16px;
            border-bottom: 1px solid var(--km-glass-border);
            display: flex; justify-content: space-between; align-items: center;
            font-weight: 600; letter-spacing: 0.5px;
        }
        .km-close { cursor: pointer; padding: 4px; border-radius: 50%; transition: 0.2s; }
        .km-close:hover { background: rgba(255,255,255,0.1); }

        /* Tabs */
        .km-tabs { display: flex; background: rgba(0,0,0,0.2); }
        .km-tab {
            flex: 1; text-align: center; padding: 10px; cursor: pointer;
            font-size: 13px; font-weight: 500; color: var(--km-text-dim);
            border-bottom: 2px solid transparent; transition: 0.2s;
        }
        .km-tab:hover { color: var(--km-text); background: rgba(255,255,255,0.03); }
        .km-tab.active { color: var(--km-accent); border-bottom-color: var(--km-accent); }

        /* Content Area */
        .km-body { flex: 1; overflow-y: auto; padding: 16px; min-height: 250px; position: relative; }
        .km-view { display: none; animation: kmFadeIn 0.3s ease; }
        .km-view.active { display: block; }
        @keyframes kmFadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }

        /* Components */
        .km-group { margin-bottom: 16px; }
        .km-label { display: block; font-size: 12px; color: var(--km-text-dim); margin-bottom: 6px; }

        .km-btn {
            border: none; background: rgba(255,255,255,0.08); color: white;
            padding: 8px 12px; border-radius: 6px; cursor: pointer;
            font-size: 13px; font-weight: 500; transition: 0.2s;
            display: inline-flex; align-items: center; gap: 6px; justify-content: center;
        }
        .km-btn:hover { background: rgba(255,255,255,0.15); }
        .km-btn.primary { background: var(--km-accent); }
        .km-btn.primary:hover { background: var(--km-accent-hover); }
        .km-btn.danger { background: rgba(231, 76, 60, 0.2); color: #e74c3c; }
        .km-btn.danger:hover { background: rgba(231, 76, 60, 0.4); }
        .km-btn.block { width: 100%; }

        .km-input {
            width: 100%; background: rgba(0,0,0,0.3); border: 1px solid var(--km-glass-border);
            color: white; padding: 8px; border-radius: 6px; outline: none; font-size: 13px;
            box-sizing: border-box; transition: 0.2s;
        }
        .km-input:focus { border-color: var(--km-accent); }
        textarea.km-input { min-height: 80px; resize: vertical; font-family: monospace; }

        /* Sliders */
        .km-range-wrap { display: flex; align-items: center; gap: 10px; }
        input[type=range] { flex: 1; height: 4px; accent-color: var(--km-accent); cursor: pointer; }

        /* Drop Zone */
        .km-dropzone {
            border: 2px dashed var(--km-glass-border); border-radius: 8px;
            padding: 20px; text-align: center; color: var(--km-text-dim);
            cursor: pointer; transition: 0.2s;
        }
        .km-dropzone:hover, .km-dropzone.dragover { border-color: var(--km-accent); background: rgba(142, 68, 173, 0.1); color: white; }

        /* Caught List */
        .km-list-item {
            display: flex; justify-content: space-between; align-items: center;
            background: rgba(255,255,255,0.04); padding: 8px 10px; border-radius: 6px;
            margin-bottom: 6px; border: 1px solid transparent;
        }
        .km-list-item:hover { border-color: var(--km-glass-border); background: rgba(255,255,255,0.06); }
        .km-item-name { font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 180px; }

        /* Toast */
        #km-toast {
            position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
            background: var(--km-glass); border: 1px solid var(--km-glass-border);
            padding: 8px 16px; border-radius: 20px; z-index: 999999;
            font-size: 13px; pointer-events: none; opacity: 0; transition: opacity 0.3s;
            display: flex; align-items: center; gap: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        }
        #km-toast.show { opacity: 1; }

        /* OVERLAY SUBTITLE */
        #km-overlay-wrap {
            position: fixed; left: 50%; transform: translateX(-50%);
            width: auto; max-width: 90vw; text-align: center; z-index: 2147483647;
            pointer-events: none;
        }
        .km-sub-box {
            display: inline-block; padding: 4px 12px; border-radius: 8px;
            pointer-events: auto; cursor: grab; user-select: none;
            transition: background 0.2s, transform 0.1s;
        }
        .km-sub-box:active { cursor: grabbing; transform: scale(0.98); }
        .km-sub-text {
            white-space: pre-wrap; line-height: 1.4; pointer-events: none;
        }

        /* Video Selector highlight */
        .km-highlight-video { outline: 4px solid var(--km-accent) !important; z-index: 1000; }
    `);

    /********************
     * MAIN LOGIC
     ********************/
    const state = {
        cues: [],
        currentCueIdx: -1,
        videoEl: null,
        settings: getSettings(),
        caughtUrls: [],
        isPanelOpen: false,
        dragState: { active: false, x: 0, y: 0 }
    };

    // --- Toast Notification ---
    const toast = (() => {
        const el = document.createElement("div");
        el.id = "km-toast";
        document.body.appendChild(el);
        let timer;
        return (msg, icon = "") => {
            el.innerHTML = `${icon} <span>${msg}</span>`;
            el.classList.add("show");
            clearTimeout(timer);
            timer = setTimeout(() => el.classList.remove("show"), CONSTANTS.TOAST_DURATION);
        };
    })();

    // --- Overlay UI ---
    const overlay = (() => {
        const wrap = document.createElement("div");
        wrap.id = "km-overlay-wrap";
        wrap.innerHTML = `<div class="km-sub-box"><div class="km-sub-text"></div></div>`;
        document.body.appendChild(wrap);

        const box = wrap.querySelector(".km-sub-box");
        const text = wrap.querySelector(".km-sub-text");

        // Drag Logic
        let isDragging = false, startY = 0, startBottom = 0;
        box.addEventListener("mousedown", (e) => {
            if (e.button !== 0) return;
            isDragging = true;
            startY = e.clientY;
            startBottom = parseFloat(state.settings.posBottom) || 10;
            document.addEventListener("mousemove", onMove);
            document.addEventListener("mouseup", onUp);
        });

        function onMove(e) {
            if (!isDragging) return;
            const deltaY = startY - e.clientY;
            // Convert pixels to VH roughly or just use pixels if preferred. Using % for responsiveness
            const vhDelta = (deltaY / window.innerHeight) * 100;
            let newBottom = startBottom + vhDelta;
            if(newBottom < 0) newBottom = 0;
            if(newBottom > 90) newBottom = 90;

            wrap.style.bottom = `${newBottom}%`;
            state.settings.posBottom = newBottom;
        }

        function onUp() {
            isDragging = false;
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup", onUp);
            saveSettings(state.settings);
        }

        function render() {
            const s = state.settings;
            text.style.fontSize = `${s.fontSize}px`;
            text.style.color = s.color;
            text.style.fontFamily = s.fontFamily;

            // Text Outline / Shadow
            if (s.textOutline && s.textOutline !== 'none') {
                // Creating a sturdy outline using text-shadow
                const c = "black";
                // Simple 1px outline logic or robust
                text.style.textShadow = `-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000, 2px 2px 4px rgba(0,0,0,0.8)`;
            } else {
                text.style.textShadow = "none";
            }

            box.style.backgroundColor = s.bgColor;
            wrap.style.bottom = `${s.posBottom}%`;
            wrap.style.opacity = s.opacity;
        }

        function setText(content) {
            if (!content) {
                wrap.style.display = "none";
            } else {
                wrap.style.display = "block";
                text.innerHTML = content.replace(/\n/g, '<br>');
            }
        }

        render();
        return { setText, render, dom: wrap };
    })();

    // --- Panel UI ---
    const panel = (() => {
        const root = document.createElement("div");
        root.id = "km-panel";
        root.innerHTML = `
            <div class="km-header">
                <div style="display:flex;align-items:center;gap:8px">${ICONS.sub} KilaManbo Subs</div>
                <div class="km-close">${ICONS.close}</div>
            </div>
            <div class="km-tabs">
                <div class="km-tab active" data-tab="main">Nguồn</div>
                <div class="km-tab" data-tab="settings">Cài đặt</div>
                <div class="km-tab" data-tab="caught">Link (${state.caughtUrls.length})</div>
            </div>
            <div class="km-body">
                <!-- MAIN TAB -->
                <div class="km-view active" id="view-main">
                    <div class="km-group">
                        <div class="km-dropzone" id="km-droparea">
                            ${ICONS.upload}<br>Kéo thả file SRT / VTT / ASS<br>vào đây để tải
                            <input type="file" id="km-file-input" hidden accept=".srt,.vtt,.ass">
                        </div>
                    </div>
                    <div class="km-group">
                         <label class="km-label">Chọn Video trên trang</label>
                         <div style="display:flex;gap:5px">
                            <select id="km-video-select" class="km-input" style="flex:1"><option>Đang tìm...</option></select>
                            <button id="km-refresh-vid" class="km-btn" title="Quét lại video">↻</button>
                         </div>
                    </div>
                    <div class="km-group">
                        <label class="km-label">Điều chỉnh Sync (Giây) - Phím tắt [ ]</label>
                        <div style="display:flex;gap:5px;align-items:center">
                            <button class="km-btn" id="km-sync-minus">-0.5s</button>
                            <input type="number" id="km-sync-val" class="km-input" value="0" step="0.1" style="text-align:center">
                            <button class="km-btn" id="km-sync-plus">+0.5s</button>
                        </div>
                    </div>
                    <div class="km-group">
                        <button class="km-btn danger block" id="km-clear-sub">Xóa Subtitle</button>
                    </div>
                </div>

                <!-- SETTINGS TAB -->
                <div class="km-view" id="view-settings">
                    <div class="km-group">
                        <label class="km-label">Cỡ chữ (px)</label>
                        <div class="km-range-wrap">
                            <span style="font-size:10px">Nhỏ</span>
                            <input type="range" id="km-set-size" min="12" max="80" value="32">
                            <span style="font-size:10px">Lớn</span>
                        </div>
                    </div>
                    <div class="km-group">
                         <label class="km-label">Màu chữ & Nền</label>
                         <div style="display:flex;gap:10px">
                             <input type="color" id="km-set-color" class="km-input" style="height:35px;padding:2px" title="Màu chữ">
                             <select id="km-set-bg" class="km-input">
                                <option value="rgba(0,0,0,0.6)">Đen mờ</option>
                                <option value="transparent">Trong suốt</option>
                                <option value="rgba(0,0,0,0.9)">Đen đậm</option>
                             </select>
                         </div>
                    </div>
                    <div class="km-group">
                        <label class="km-label">Vị trí (Bottom %)</label>
                        <input type="range" id="km-set-pos" min="0" max="90" value="10">
                    </div>
                    <div class="km-group">
                        <label class="km-label">Font chữ</label>
                        <select id="km-set-font" class="km-input">
                            <option value="sans-serif">Sans Serif</option>
                            <option value="serif">Serif</option>
                            <option value="monospace">Monospace</option>
                            <option value="'Courier New'">Courier New</option>
                            <option value="'Segoe UI'">Segoe UI</option>
                        </select>
                    </div>
                </div>

                <!-- CAUGHT TAB -->
                <div class="km-view" id="view-caught">
                    <div id="km-caught-list" style="font-size:12px;color:#888;text-align:center;margin-top:20px">Chưa bắt được link nào...</div>
                </div>
            </div>
        `;
        document.body.appendChild(root);

        // Fab
        const fab = document.createElement("div");
        fab.id = "km-fab";
        fab.innerHTML = ICONS.sub;
        fab.title = "KilaManbo Subs";
        fab.onclick = () => toggle(true);
        document.body.appendChild(fab);

        // Events
        const els = {
            close: $('.km-close', root),
            tabs: $$('.km-tab', root),
            views: { main: $('#view-main', root), settings: $('#view-settings', root), caught: $('#view-caught', root) },
            dropArea: $('#km-droparea', root),
            fileInput: $('#km-file-input', root),
            vidSelect: $('#km-video-select', root),
            refreshVid: $('#km-refresh-vid', root),
            syncVal: $('#km-sync-val', root),
            syncMinus: $('#km-sync-minus', root),
            syncPlus: $('#km-sync-plus', root),
            caughtList: $('#km-caught-list', root),
            // Settings
            setSize: $('#km-set-size', root),
            setColor: $('#km-set-color', root),
            setBg: $('#km-set-bg', root),
            setPos: $('#km-set-pos', root),
            setFont: $('#km-set-font', root),
            clearSub: $('#km-clear-sub', root)
        };

        function toggle(show) {
            state.isPanelOpen = show;
            root.classList.toggle('active', show);
            if(show) refreshVideoList();
        }

        els.close.onclick = () => toggle(false);

        // Tab Switch
        els.tabs.forEach(t => t.onclick = () => {
            els.tabs.forEach(x => x.classList.remove('active'));
            t.classList.add('active');
            Object.values(els.views).forEach(v => v.classList.remove('active'));
            els.views[t.dataset.tab].classList.add('active');
        });

        // File Loading
        els.dropArea.onclick = () => els.fileInput.click();
        els.fileInput.onchange = (e) => loadFile(e.target.files[0]);

        // Drag Drop Zone logic
        els.dropArea.ondragover = (e) => { e.preventDefault(); els.dropArea.classList.add('dragover'); };
        els.dropArea.ondragleave = () => els.dropArea.classList.remove('dragover');
        els.dropArea.ondrop = (e) => {
            e.preventDefault();
            els.dropArea.classList.remove('dragover');
            if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]);
        };

        async function loadFile(file) {
            if (!file) return;
            const text = await file.text();
            state.cues = parseSubtitles(text);
            toast(`Đã load: ${file.name} (${state.cues.length} lines)`, ICONS.check);
            toggle(false);
        }

        // Settings Binding
        function bindSetting(el, key, event = 'input', processVal = v => v) {
            el.value = state.settings[key];
            el.addEventListener(event, (e) => {
                state.settings[key] = processVal(e.target.value);
                saveSettings(state.settings);
                overlay.render();
            });
        }

        bindSetting(els.setSize, 'fontSize');
        bindSetting(els.setColor, 'color');
        bindSetting(els.setBg, 'bgColor');
        bindSetting(els.setPos, 'posBottom');
        bindSetting(els.setFont, 'fontFamily');

        // Sync Controls
        const updateSyncUI = () => els.syncVal.value = state.settings.offset.toFixed(1);
        updateSyncUI();

        els.syncMinus.onclick = () => changeOffset(-0.5);
        els.syncPlus.onclick = () => changeOffset(0.5);
        els.syncVal.onchange = (e) => {
            state.settings.offset = parseFloat(e.target.value);
            saveSettings(state.settings);
        };

        els.clearSub.onclick = () => {
            state.cues = [];
            overlay.setText("");
            toast("Đã xóa subtitle");
        };

        // Video Selection
        function refreshVideoList() {
            const vids = Array.from(document.querySelectorAll('video'));
            els.vidSelect.innerHTML = '';
            if(vids.length === 0) {
                els.vidSelect.innerHTML = '<option>Không tìm thấy video</option>';
                return;
            }
            vids.forEach((v, i) => {
                const opt = document.createElement('option');
                opt.value = i;
                opt.text = `Video ${i+1} (${Math.round(v.duration || 0)}s)`;
                if(v === state.videoEl) opt.selected = true;
                els.vidSelect.appendChild(opt);
            });
        }

        els.vidSelect.onchange = () => {
            const vids = document.querySelectorAll('video');
            const idx = parseInt(els.vidSelect.value);
            if(vids[idx]) setVideo(vids[idx]);
        };
        els.refreshVid.onclick = refreshVideoList;

        // Caught List Render
        function renderCaught() {
            const tab = $$('.km-tab')[2]; // caught tab
            tab.innerHTML = `Link (${state.caughtUrls.length})`;

            if(state.caughtUrls.length === 0) return;
            els.caughtList.innerHTML = '';

            state.caughtUrls.slice(0, 20).forEach(item => {
                const div = document.createElement('div');
                div.className = 'km-list-item';
                div.innerHTML = `
                    <div class="km-item-name" title="${item.url}">${item.url.split('/').pop().split('?')[0]}</div>
                    <button class="km-btn small">Load</button>
                `;
                div.querySelector('button').onclick = async () => {
                    try {
                        div.querySelector('button').textContent = "...";
                        const r = await fetch(item.url);
                        const t = await r.text();
                        state.cues = parseSubtitles(t);
                        toast(`Đã load từ link! (${state.cues.length} lines)`, ICONS.check);
                        toggle(false);
                    } catch(e) { toast("Lỗi tải link"); }
                    finally { div.querySelector('button').textContent = "Load"; }
                };
                els.caughtList.appendChild(div);
            });
        }

        return { toggle, renderCaught, updateSyncUI };
    })();

    /********************
     * LOGIC CONTROLLER
     ********************/
    function changeOffset(delta) {
        state.settings.offset += delta;
        // Fix floating point errors
        state.settings.offset = Math.round(state.settings.offset * 10) / 10;
        panel.updateSyncUI();
        saveSettings(state.settings);
        toast(`Sync: ${state.settings.offset > 0 ? '+' : ''}${state.settings.offset}s`);
    }

    function setVideo(el) {
        if (state.videoEl) {
            state.videoEl.removeEventListener('timeupdate', onTimeUpdate);
            state.videoEl.classList.remove('km-highlight-video');
        }
        state.videoEl = el;
        if (el) {
            el.addEventListener('timeupdate', onTimeUpdate);
            // Highlight effect temporarily
            el.classList.add('km-highlight-video');
            setTimeout(() => el.classList.remove('km-highlight-video'), 1000);
            toast("Đã kết nối Video!");
        }
    }

    function onTimeUpdate() {
        if (!state.cues.length || !state.videoEl) return;
        const t = state.videoEl.currentTime + state.settings.offset;

        // Optimize search: Check current, then next, then binary search
        let found = null;
        const cues = state.cues;

        // Check cached index first
        if (state.currentCueIdx !== -1 && state.currentCueIdx < cues.length) {
            const c = cues[state.currentCueIdx];
            if (t >= c.start && t <= c.end) found = c;
            else if (cues[state.currentCueIdx + 1] && t >= cues[state.currentCueIdx + 1].start && t <= cues[state.currentCueIdx + 1].end) {
                state.currentCueIdx++;
                found = cues[state.currentCueIdx];
            }
        }

        // Full search if optimization failed
        if (!found) {
            const idx = cues.findIndex(c => t >= c.start && t <= c.end);
            if (idx !== -1) {
                state.currentCueIdx = idx;
                found = cues[idx];
            } else {
                state.currentCueIdx = -1;
            }
        }

        if (found) overlay.setText(found.text);
        else overlay.setText("");
    }

    // --- Auto Scan Video ---
    setInterval(() => {
        if (!state.videoEl) {
            const v = $('video');
            if (v) setVideo(v);
        }
    }, 2000);

    // --- Network Sniffer ---
    function catchUrl(url) {
        if (CONSTANTS.EXTENSIONS.test(url) && !state.caughtUrls.some(u => u.url === url)) {
            state.caughtUrls.unshift({ url, time: Date.now() });
            panel.renderCaught();
            // Optional: Auto notify
            // toast("Phát hiện Subtitle mới!", ICONS.sub);
        }
    }

    // Hook Fetch
    const _fetch = window.fetch;
    window.fetch = async (...args) => {
        const url = (args[0]?.url || args[0]) + "";
        catchUrl(url);
        return _fetch.apply(window, args);
    };

    // Hook XHR
    const _xhr = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url) {
        catchUrl(url);
        return _xhr.apply(this, arguments);
    };

    // --- Keyboard Shortcuts & Global Drag ---
    document.addEventListener('keydown', (e) => {
        // Chỉ hoạt động khi không gõ text
        if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;

        if (e.key === '[') changeOffset(-0.2); // Tinh chỉnh nhỏ hơn
        if (e.key === ']') changeOffset(0.2);
        if (e.key === '\\') panel.toggle(!state.isPanelOpen);
    });

    // Global Drag & Drop for Subs
    document.addEventListener('dragover', (e) => e.preventDefault());
    document.addEventListener('drop', async (e) => {
        e.preventDefault();
        const f = e.dataTransfer.files[0];
        if (f && (f.name.endsWith('.srt') || f.name.endsWith('.vtt') || f.name.endsWith('.ass'))) {
            const text = await f.text();
            state.cues = parseSubtitles(text);
            toast(`Đã load: ${f.name}`, ICONS.check);
        }
    });

    // Register GM Commands
    GM_registerMenuCommand("Mở cài đặt Subtitle", () => panel.toggle(true));

    console.log("[KilaManbo Sub Ultimate] Loaded!");

})();
