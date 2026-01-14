// ==UserScript==
// @name         Manbo Media Downloader (Fast Speed & Silent Headers)
// @namespace    manbo.kilamanbo.media
// @version      3.9.0 // Fix bộ đếm: Chỉ nhảy số khi bắt được Link/Content
// @description  Tải phụ đề, ảnh, audio Manbo. Fix lỗi tải chậm và server chặn request.
// @author       Thien Truong Dia Cuu
// @match        https://kilamanbo.com/manbo/pc/detail*
// @match        https://manbo.kilakila.cn/manbo/pc/detail*
// @match        https://manbo.hongdoulive.com/Activecard/radioplay*
// @match        https://kilamanbo.com/*
// @match        https://www.kilamanbo.com/*
// @require      https://greasyfork.org/scripts/455943-ajaxhooker/code/ajaxHooker.js?version=1124435
// @require      https://cdn.jsdelivr.net/npm/@zip.js/zip.js/dist/zip-full.min.js
// @require      https://unpkg.com/sweetalert2@11.6.15/dist/sweetalert2.min.js
// @icon         https://img.hongrenshuo.com.cn/h5/websiteManbo-pc-favicon-cb.ico
// @grant        GM_addStyle
// @grant        GM_setClipboard
// @grant        GM_xmlhttpRequest
// @run-at       document-start
// @connect      img.kilamanbo.com
// @connect      drama.hongrenshuo.com.cn
// @connect      kilamanbo.com
// @connect      manbo.kilakila.cn
// @license      MIT
// ==/UserScript==

(function () {
    'use strict';

    // --- State Management ---
    // subtitleMap: key=id, value={ id, title, lrcUrl, content }
    let subtitleMap = new Map();
    let accumulatedImages = new Set();
    let currentEpisodeLrcUrl = null;
    let currentEpisodeLrcContent = null;
    let currentEpisodeTitle = 'Tập hiện tại';
    let currentDramaTitle = 'Manbo Drama';
    let realAudioUrl = null;

    // --- Modern CSS Styles ---
    GM_addStyle(`
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700&display=swap');
        #manbo-panel {
            position: fixed; top: 15%; right: 20px; width: 300px;
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(15px); -webkit-backdrop-filter: blur(15px);
            border: 1px solid rgba(255, 255, 255, 0.6);
            border-radius: 16px;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.1);
            z-index: 9999; font-family: 'Nunito', sans-serif;
            padding: 16px;
            transition: transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1), opacity 0.3s;
            color: #444; display: flex; flex-direction: column; max-height: 85vh;
        }
        #manbo-panel.collapsed { transform: translateX(150%) !important; opacity: 0; pointer-events: none; }
        .panel-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; cursor: move; user-select: none; padding-bottom: 8px; border-bottom: 1px solid rgba(0,0,0,0.05); }
        .panel-title { color: #ff4d94; font-weight: 800; font-size: 16px; display: flex; align-items: center; gap: 6px; }
        .close-btn { background: none; border: none; font-size: 18px; color: #aaa; cursor: pointer; }
        .close-btn:hover { color: #ff4d94; }
        .stats-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px; flex-shrink: 0; }
        .stat-card { background: rgba(255, 240, 245, 0.8); border-radius: 10px; padding: 8px; text-align: center; border: 1px solid rgba(255, 182, 193, 0.3); }
        .stat-num { display: block; font-size: 18px; font-weight: 700; color: #ff4d94; }
        .stat-label { font-size: 10px; color: #888; text-transform: uppercase; }
        .log-container { flex-grow: 1; min-height: 80px; max-height: 150px; background: #f9f9f9; border-radius: 8px; border: 1px solid #eee; padding: 8px; overflow-y: auto; margin-bottom: 12px; font-family: 'Consolas', monospace; font-size: 11px; display: flex; flex-direction: column; gap: 4px; }
        .log-entry { padding: 2px 0; border-bottom: 1px dashed #eee; }
        .log-time { color: #aaa; margin-right: 5px; }
        .log-success { color: #2ecc71; }
        .log-info { color: #3498db; }
        .log-warn { color: #f39c12; }
        .log-error { color: #e74c3c; }
        .log-audio { color: #9b59b6; font-weight: bold; }
        .controls-area { flex-shrink: 0; }
        .btn-group { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px; }
        .section-title { font-size: 11px; font-weight: 700; color: #aaa; margin: 8px 0 4px 0; text-transform: uppercase; }
        .m-btn { border: none; border-radius: 8px; padding: 8px; font-size: 12px; font-weight: 600; cursor: pointer; transition: 0.2s; width: 100%; display: flex; justify-content: center; align-items: center; gap: 5px; }
        .btn-outline { background: #fff; border: 1px solid #ffb3c6; color: #ff5c8d; }
        .btn-outline:hover { background: #fff0f5; }
        .btn-fill { background: linear-gradient(135deg, #ff8fab, #ff4d94); color: white; box-shadow: 0 4px 10px rgba(255, 77, 148, 0.2); }
        .btn-fill:hover { transform: translateY(-1px); box-shadow: 0 6px 12px rgba(255, 77, 148, 0.3); }
        .btn-full { width: 100%; margin-bottom: 6px; }
        .btn-disabled { opacity: 0.6; cursor: not-allowed; filter: grayscale(1); }
        .log-container::-webkit-scrollbar { width: 4px; }
        .log-container::-webkit-scrollbar-thumb { background: #ffb3c6; border-radius: 2px; }
        #manbo-toggle { position: fixed; bottom: 30px; right: 30px; width: 48px; height: 48px; border-radius: 50%; background: linear-gradient(135deg, #ff7eb9, #ff4d94); color: white; border: none; cursor: pointer; z-index: 9998; font-size: 20px; box-shadow: 0 4px 15px rgba(255, 77, 148, 0.4); transition: transform 0.3s; }
        #manbo-toggle:hover { transform: scale(1.1) rotate(10deg); }
    `);

    const toast = Swal.mixin({ toast: true, position: 'top', timer: 3000, timerProgressBar: true });

    // --- Helpers ---
    const sanitize = (n) => n.replace(/[\/\\?%*:|"<>]/g, '_').trim();

    function addLog(msg, type = 'info', updateLast = false) {
        const box = document.getElementById('log-box');
        if (!box) return;
        if (updateLast && box.firstElementChild) {
             const lastEntry = box.firstElementChild;
             const time = new Date().toLocaleTimeString('vi-VN', { hour12: false, hour: '2-digit', minute:'2-digit', second:'2-digit' });
             let colorClass = type === 'success' ? 'log-success' : type === 'warn' ? 'log-warn' : type === 'error' ? 'log-error' : type === 'audio' ? 'log-audio' : 'log-info';
             lastEntry.innerHTML = `<span class="log-time">[${time}]</span><span class="${colorClass}">${msg}</span>`;
             return;
        }
        const div = document.createElement('div');
        div.className = 'log-entry';
        const time = new Date().toLocaleTimeString('vi-VN', { hour12: false, hour: '2-digit', minute:'2-digit', second:'2-digit' });
        let colorClass = type === 'success' ? 'log-success' : type === 'warn' ? 'log-warn' : type === 'error' ? 'log-error' : type === 'audio' ? 'log-audio' : 'log-info';
        div.innerHTML = `<span class="log-time">[${time}]</span><span class="${colorClass}">${msg}</span>`;
        box.prepend(div);
    }

    const fetchFile = (url, type = 'blob', onProgress) => new Promise((res, rej) => {
        if (!url) return rej("URL rỗng");
        GM_xmlhttpRequest({
            method: "GET", url,
            headers: { "Referer": window.location.href, "Origin": window.location.origin },
            responseType: type,
            onload: r => (r.status === 200) ? res(r.response) : rej(`HTTP ${r.status}`),
            onerror: (err) => rej(err.statusText || "Network Error"),
            onprogress: (e) => { if (onProgress && e.total > 0) onProgress(Math.floor((e.loaded / e.total) * 100)); }
        });
    });

    const fetchLrcViaApi = (id) => new Promise((res, rej) => {
        const apiUrl = window.location.origin + "/Activecard/getLrcContent";
        GM_xmlhttpRequest({
            method: "POST",
            url: apiUrl,
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "Referer": window.location.href,
                "Origin": window.location.origin
            },
            data: "videoId=" + id,
            onload: (r) => {
                if (r.status !== 200) return rej("API Error " + r.status);
                try {
                    const json = JSON.parse(r.responseText);
                    if (json && json.data) {
                        if (json.data.lrcContent) res(json.data.lrcContent);
                        else if (json.data.lrcUrl) res(fetchFile(json.data.lrcUrl, 'text'));
                        else rej("No content in API");
                    } else rej("Invalid API data");
                } catch(e) { rej("Parse Error"); }
            },
            onerror: rej
        });
    });

    const download = (data, name) => {
        const a = document.createElement("a");
        a.download = name;
        a.href = typeof data === "string" ? "data:text/plain;charset=utf-8," + encodeURIComponent(data) : URL.createObjectURL(data);
        a.style.display = "none";
        document.body.appendChild(a);
        a.click();
        a.remove();
        if (typeof data !== "string") setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    };

    // --- UNIVERSAL ASS CONVERTER ---
    function convertToAss(lrc) {
        let ass = `[Script Info]\nTitle: Manbo\nScriptType: v4.00+\nPlayResX:1280\nPlayResY:720\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Arial,42,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,0,2,20,20,20,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`;
        let parsedLines = [];
        const lines = lrc.split('\n');
        const formatAssTime = (totalSec) => {
            const h = Math.floor(totalSec / 3600);
            const m = Math.floor((totalSec % 3600) / 60);
            const s = Math.floor(totalSec % 60);
            const cs = Math.floor((totalSec % 1) * 100);
            return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${cs.toString().padStart(2, '0')}`;
        };
        lines.forEach(line => {
            const m = line.match(/\[([\d:.]+)\](.*)/);
            if (m) {
                const timeStr = m[1];
                const text = m[2].trim();
                let parts = timeStr.split(/[:.]/);
                let seconds = 0; let ms = 0;
                if (parts.length === 4) {
                    seconds = parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2]);
                    ms = parseInt(parts[3].padEnd(2, '0').substring(0, 2));
                } else if (parts.length === 3) {
                    seconds = parseInt(parts[0]) * 60 + parseInt(parts[1]);
                    ms = parseInt(parts[2].padEnd(2, '0').substring(0, 2));
                } else return;
                const rawTime = seconds + (ms / 100);
                parsedLines.push({ startTime: formatAssTime(rawTime), rawTime: rawTime, text: text });
            }
        });
        parsedLines.sort((a, b) => a.rawTime - b.rawTime);
        parsedLines.forEach((item, i) => {
            if (item.text === '') return;
            let endTime;
            if (i < parsedLines.length - 1) endTime = parsedLines[i + 1].startTime;
            else endTime = formatAssTime(item.rawTime + 5);
            ass += `Dialogue: 0,${item.startTime},${endTime},Default,,0,0,0,,${item.text}\n`;
        });
        return ass;
    }

    async function runBatch(items, limit, fn, onProgress) {
        let results = [];
        let executing = [];
        let completed = 0;
        for (const item of items) {
            const p = Promise.resolve().then(() => fn(item));
            results.push(p);
            const e = p.then(() => {
                executing.splice(executing.indexOf(e), 1);
                completed++;
                if (onProgress) onProgress(completed, items.length);
            });
            executing.push(e);
            if (executing.length >= limit) await Promise.race(executing);
        }
        return Promise.all(results);
    }

    // --- FIX: Chỉ đếm những tập đã CÓ Link hoặc Content ---
    function updateCounters() {
        const subC = document.getElementById('stat-sub');
        const imgC = document.getElementById('stat-img');
        // Filter bỏ những tập chỉ có ID (chưa hook được link/content)
        if (subC) subC.innerText = Array.from(subtitleMap.values()).filter(s => s.lrcUrl || s.content).length;
        if (imgC) imgC.innerText = accumulatedImages.size;
    }

    function updateAudioButton() {
        const btn = document.getElementById('cp-audio');
        if (!btn) return;
        if (realAudioUrl) {
            btn.classList.remove('btn-disabled');
            btn.innerHTML = '🎵 Tải Audio ngay (Fix Lỗi)';
            btn.title = realAudioUrl;
        } else {
            btn.classList.add('btn-disabled');
            btn.innerHTML = '🎧 Bấm Play để bắt Audio';
        }
    }

    function initAudioSniffer() {
        window.addEventListener('play', (e) => {
            const target = e.target;
            if (target && (target.tagName === 'AUDIO' || target.tagName === 'VIDEO')) {
                const src = target.src || target.currentSrc;
                if (src && (src.includes('.mp3') || src.includes('.m4a') || src.includes('hongrenshuo.com.cn'))) {
                    if (realAudioUrl !== src) {
                        realAudioUrl = src;
                        addLog('🎵 Đã bắt được Audio thật!', 'audio');
                        updateAudioButton();
                    }
                }
            }
        }, true);
    }

    // --- HOOKS: Cập nhật dữ liệu vào Map để dùng cho ZIP ---
    ajaxHooker.hook(req => {
        req.response = res => {
            if (!res.responseText) return;
            try {
                const json = JSON.parse(res.responseText);
                const data = json?.data;
                if (!data) return;

                const main = data.radioDramaResp || (req.url.includes('dramaDetail') ? data : null);
                if (main) {
                    currentDramaTitle = main.title || currentDramaTitle;
                    if (main.coverPic) accumulatedImages.add(main.coverPic.split('?')[0]);
                    let newSubCount = 0;
                    (main.setRespList || []).forEach(s => {
                        const id = s.setIdStr || s.setId;
                        // Chỉ lưu nếu chưa có hoặc cập nhật thêm thông tin
                        if (!subtitleMap.has(id)) {
                            subtitleMap.set(id, { id: id, title: s.setTitle || s.setName || 'Tập ' + s.setNo, lrcUrl: s.setLrcUrl, content: null });
                            if (s.setLrcUrl || id) newSubCount++;
                        }
                        if (s.setPic) accumulatedImages.add(s.setPic.split('?')[0]);
                    });
                    if (newSubCount > 0) addLog(`Quét: ${newSubCount} tập (sẵn sàng ZIP).`, 'info');
                }

                if (req.url.includes('dramaSetDetail')) {
                    const title = data.setTitle || data.setName || 'Unknown';
                    currentEpisodeTitle = title;
                    currentEpisodeLrcUrl = data.setLrcUrl || null;
                    currentEpisodeLrcContent = null;
                    realAudioUrl = null;
                    updateAudioButton();

                    if (data.setIdStr) {
                         const existing = subtitleMap.get(data.setIdStr) || {};
                         // Cập nhật lại Map với Link mới nhất
                         subtitleMap.set(data.setIdStr, {
                             id: data.setIdStr,
                             title: title,
                             lrcUrl: data.setLrcUrl,
                             content: existing.content // Giữ lại content nếu đã có
                         });
                    }
                    if (data.setLrcUrl) addLog(`Đã bắt URL: ${title}`, 'success');

                    const addImg = (u) => { if(u) { const cl = u.split('?')[0]; if (!accumulatedImages.has(cl)) accumulatedImages.add(cl); }};
                    if (data.setPic) addImg(data.setPic);
                    if (data.backgroundImgUrl) addImg(data.backgroundImgUrl);
                    (data.picUrlSet || []).forEach(u => addImg(u));
                }

                if (req.url.includes('getLrcContent')) {
                     // Parse ID từ Request payload để biết là tập nào
                     let videoId = null;
                     if (req.data) {
                         const match = req.data.match(/videoId=([^&]+)/);
                         if (match) videoId = match[1];
                     }

                     if (data.lrcUrl) currentEpisodeLrcUrl = data.lrcUrl;

                     if (typeof data === 'string' || data.lrcContent) {
                         const txt = data.lrcContent || data;
                         currentEpisodeLrcContent = txt;
                         addLog('Đã bắt được NỘI DUNG LRC trực tiếp!', 'success');

                         // CỰC KỲ QUAN TRỌNG: Lưu nội dung vào Map để ZIP dùng luôn
                         if (videoId && subtitleMap.has(videoId)) {
                             const item = subtitleMap.get(videoId);
                             item.content = txt; // Lưu content
                             subtitleMap.set(videoId, item);
                             addLog(`-> Đã lưu nội dung cho tập: ${item.title}`, 'info');
                         }
                     }
                }
                updateCounters();
            } catch (e) {}
        };
    });

    function makeDraggable(el, handle) {
        let pos1=0,pos2=0,pos3=0,pos4=0;
        if(handle) handle.onmousedown=dragMouseDown; else el.onmousedown=dragMouseDown;
        function dragMouseDown(e){e=e||window.event;e.preventDefault();pos3=e.clientX;pos4=e.clientY;document.onmouseup=closeDragElement;document.onmousemove=elementDrag;}
        function elementDrag(e){e=e||window.event;e.preventDefault();pos1=pos3-e.clientX;pos2=pos4-e.clientY;pos3=e.clientX;pos4=e.clientY;el.style.top=(el.offsetTop-pos2)+"px";el.style.left=(el.offsetLeft-pos1)+"px";}
        function closeDragElement(){document.onmouseup=null;document.onmousemove=null;}
    }

    function initUI() {
        if (document.getElementById('manbo-panel')) return;
        const panel = document.createElement('div');
        panel.id = 'manbo-panel';
        panel.innerHTML = `
            <div class="panel-header" id="panel-header">
                <div class="panel-title">📜 Manbo Log</div><button class="close-btn" id="hide-p">✖</button>
            </div>
            <div class="stats-grid">
                <div class="stat-card"><span class="stat-num" id="stat-sub">0</span><span class="stat-label">Phụ đề</span></div>
                <div class="stat-card"><span class="stat-num" id="stat-img">0</span><span class="stat-label">Hình ảnh</span></div>
            </div>
            <div id="log-box" class="log-container">
                <div class="log-entry"><span class="log-time">System</span><span class="log-info">Sẵn sàng!</span></div>
            </div>
            <div class="controls-area">
                <div class="section-title">Tập hiện tại (Chỉ dùng Hook)</div>
                <div class="btn-group">
                    <button class="m-btn btn-outline" id="dl-lrc">💬 LRC</button>
                    <button class="m-btn btn-outline" id="dl-ass">📝 ASS</button>
                </div>
                <button class="m-btn btn-outline btn-full btn-disabled" id="cp-audio">🎧 Bấm play để bắt audio</button>
                <div class="section-title">Tải toàn bộ (Ưu tiên Hook)</div>
                <button class="m-btn btn-fill btn-full" id="zip-sub">📦 Tải tất cả phụ đề</button>
                <button class="m-btn btn-fill btn-full" id="zip-img">📸 Tải tất cả ảnh</button>
            </div>
        `;
        document.body.appendChild(panel);
        const toggle = document.createElement('button');
        toggle.id = 'manbo-toggle'; toggle.innerHTML = '📜';
        toggle.onclick = () => panel.classList.toggle('collapsed');
        document.body.appendChild(toggle);
        makeDraggable(panel, document.getElementById('panel-header'));
        document.getElementById('hide-p').onclick = () => panel.classList.add('collapsed');

        document.getElementById('dl-lrc').onclick = async () => {
            try {
                let content = currentEpisodeLrcContent;
                if (!content) {
                    if (!currentEpisodeLrcUrl) { addLog("Thiếu dữ liệu Hook! Hãy tải lại hoặc chọn tập.", 'error'); return; }
                    addLog(`Tải từ URL Hook: ${currentEpisodeLrcUrl}...`, 'info');
                    content = await fetchFile(currentEpisodeLrcUrl, 'text');
                } else addLog("Sử dụng nội dung từ Hook.", 'info');

                download(content, `${sanitize(currentEpisodeTitle)}.lrc`);
                addLog("Tải LRC xong!", 'success');
            } catch (e) { addLog(`Lỗi: ${e}`, 'error'); }
        };

        document.getElementById('dl-ass').onclick = async () => {
            try {
                let content = currentEpisodeLrcContent;
                if (!content) {
                    if (!currentEpisodeLrcUrl) { addLog("Thiếu dữ liệu Hook! Hãy tải lại hoặc chọn tập.", 'error'); return; }
                    addLog(`Tải từ URL Hook: ${currentEpisodeLrcUrl}...`, 'info');
                    content = await fetchFile(currentEpisodeLrcUrl, 'text');
                } else addLog("Sử dụng nội dung từ Hook.", 'info');

                const assContent = convertToAss(content);
                download(assContent, `${sanitize(currentEpisodeTitle)}.ass`);
                addLog("Tải ASS xong!", 'success');
            } catch (e) { addLog(`Lỗi tải ASS: ${e}`, 'error'); }
        };

        document.getElementById('cp-audio').onclick = () => {
            if (!realAudioUrl) { toast.fire("Chưa có link!", "Hãy bấm Play trước.", "warning"); return; }
            addLog(`Đang tải Audio: 0%`, 'info');
            fetchFile(realAudioUrl, 'blob', (p) => addLog(`Đang tải Audio: ${p}%`, 'info', true))
            .then(b => { addLog(`Đang lưu file...`, 'success', true); download(b, `${sanitize(currentEpisodeTitle)}.mp3`); addLog("Tải Audio thành công!", 'success'); })
            .catch((e) => { addLog(`Lỗi: ${e}`, 'error'); GM_setClipboard(realAudioUrl); });
        };

        // --- CƠ CHẾ MỚI: Ưu tiên dữ liệu đã Hook (Click tay) trước ---
        document.getElementById('zip-sub').onclick = async () => {
            const list = Array.from(subtitleMap.values());
            if (!list.length) { addLog("Danh sách trống!", 'warn'); return; }
            addLog(`Đang tải ${list.length} phụ đề...`, 'info');
            const w = new zip.ZipWriter(new zip.BlobWriter("application/zip"));

            let successCount = 0;

            await runBatch(list, 10, async (s) => {
                let content = s.content; // 1. Ưu tiên nội dung đã bắt được (lưu trong Map)

                // 2. Nếu chưa có nội dung, thử dùng Link đã Hook được (Click tay nhưng chưa tải nội dung)
                if (!content && s.lrcUrl) {
                    try { content = await fetchFile(s.lrcUrl, 'text'); } catch (e) { console.warn(`URL Fail ${s.title}:`, e); }
                }

                // 3. Nếu vẫn chưa có gì (Chưa click vào bao giờ), mới dùng API (Fallback)
                if (!content && s.id) {
                    try { content = await fetchLrcViaApi(s.id); } catch (e) { console.warn(`API Fail ${s.title}:`, e); }
                }

                if (content) {
                    await w.add(`${sanitize(s.title)}.lrc`, new zip.TextReader(content));
                    successCount++;
                } else {
                    addLog(`Lỗi: ${s.title} (Ko lấy được nội dung)`, 'warn');
                }
            }, (done, total) => {
                const percent = Math.floor((done/total)*100);
                addLog(`Sub: ${done}/${total} (${percent}%)`, 'info', true);
            });

            if (successCount > 0) {
                download(await w.close(), `${sanitize(currentDramaTitle)}_Subs.zip`);
                addLog(`Đã tải ZIP: ${successCount}/${list.length} file!`, 'success');
            } else {
                addLog("Thất bại toàn bộ: Không lấy được nội dung nào!", 'error');
                await w.close();
            }
        };

        document.getElementById('zip-img').onclick = async () => {
            const list = Array.from(accumulatedImages);
            if (!list.length) { addLog("Không có ảnh!", 'warn'); return; }
            addLog(`Bắt đầu tải ${list.length} ảnh...`, 'info');
            const w = new zip.ZipWriter(new zip.BlobWriter("application/zip"));
            await runBatch(list, 5, async (url) => {
                try {
                    const blob = await fetchFile(url, 'blob');
                    const fname = url.substring(url.lastIndexOf('/')+1).split('?')[0] || `img_${Math.random()}.jpg`;
                    await w.add(fname, new zip.BlobReader(blob));
                } catch(e) {}
            }, (done, total) => {
                const percent = Math.floor((done/total)*100);
                 addLog(`Tiến độ: ${done}/${total} (${percent}%)`, 'info', true);
            });
            download(await w.close(), `${sanitize(currentDramaTitle)}_Images.zip`);
            addLog("Đã tải ZIP ảnh xong!", 'success');
        };
    }
    initAudioSniffer();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initUI); else initUI();
})();
