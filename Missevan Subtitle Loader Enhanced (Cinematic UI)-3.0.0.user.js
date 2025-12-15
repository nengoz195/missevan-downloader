// ==UserScript==
// @name         Missevan Subtitle Loader Enhanced (Cinematic UI)
// @namespace    http://tampermonkey.net/
// @version      3.0.0
// @description  Tải phụ đề (SRT, LRC, CSV, ASS) cho Missevan. Engine hiển thị mới: Hỗ trợ tag \N, đa dòng linh hoạt, tự động ẩn thanh ngang.
// @author       Modified by Gemini
// @match        https://www.missevan.com/sound/player?id=*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=missevan.com
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document_idle
// ==/UserScript==

(function() {
    'use strict';

    // --- Cấu hình mặc định ---
    const CONFIG = {
        fontColor: GM_getValue('subtitle-font-color', '#ffffff'),
        bgColor: GM_getValue('subtitle-bg-color', '#000000'),
        bgOpacity: GM_getValue('subtitle-bg-opacity', '0.4'),
        fontSize: GM_getValue('subtitle-size', '1.6'),
        offset: 0
    };

    let subtitleList = [];
    let audioDuration = 0;
    let syncMode = 'none';
    let audioPlayer = null;
    let isDragging = false;
    let dragOffset = { x: 0, y: 0 };
    let updateInterval = null;
    let statusTimeout = null;
    let hideContainerTimeout = null;

    // --- Inject CSS (Giao diện Cinematic Full Width) ---
    const css = `
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@600;800&display=swap');

        #ms-subtitle-container {
            position: fixed;
            bottom: 40px;
            left: 0;
            right: 0;
            width: 100%;
            z-index: 2147483647;

            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;

            min-height: 130px;
            padding: 10px 0;
            box-sizing: border-box;

            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
            border-top: 1px solid rgba(255,255,255,0.05);
            border-bottom: 1px solid rgba(255,255,255,0.05);
            box-shadow: 0 -2px 20px rgba(0,0,0,0.3);

            cursor: ns-resize;
            user-select: none;
            transition: background-color 0.3s;
            pointer-events: auto;
        }

        #ms-subtitle-container:hover {
            border-top: 1px solid rgba(255,255,255,0.15);
            border-bottom: 1px solid rgba(255,255,255,0.15);
            background-color: rgba(0,0,0,0.2);
        }

        /* Class mới cho khối text thống nhất */
        .ms-sub-text {
            display: block;
            width: 90%;
            max-width: 1200px;
            font-family: 'Nunito', 'Segoe UI', sans-serif;
            font-weight: 800;
            text-align: center;
            text-shadow:
                -1px -1px 0 #000,
                 1px -1px 0 #000,
                -1px  1px 0 #000,
                 1px  1px 0 #000,
                 0 2px 5px rgba(0,0,0,0.9);
            line-height: 1.5;
            letter-spacing: 0.5px;

            /* Quan trọng: Xử lý xuống dòng tự động */
            white-space: pre-wrap;
            overflow-wrap: break-word;
        }

        .ms-status-text {
            font-size: 0.75rem;
            color: rgba(255, 255, 255, 0.6);
            margin-bottom: 6px;
            font-weight: 600;
            text-shadow: 0 1px 2px rgba(0,0,0,0.8);
            text-transform: uppercase;
            letter-spacing: 1px;
            transition: opacity 0.5s;
        }

        .ms-toggle-btn {
            position: fixed;
            top: 120px;
            right: 0;
            width: 40px;
            height: 40px;
            background: #333;
            color: white;
            border-radius: 8px 0 0 8px;
            cursor: pointer;
            z-index: 2147483647;
            box-shadow: -2px 2px 8px rgba(0,0,0,0.3);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 20px;
            transition: all 0.2s;
            opacity: 0.6;
        }
        .ms-toggle-btn:hover {
            opacity: 1;
            background: #d32f2f;
            width: 50px;
        }

        #ms-controls {
            position: fixed;
            top: 120px;
            right: 50px;
            width: 280px;
            background: rgba(20, 20, 20, 0.95);
            backdrop-filter: blur(12px);
            border-radius: 12px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.6);
            z-index: 2147483646;
            padding: 20px;
            display: none;
            font-family: 'Segoe UI', sans-serif;
            font-size: 14px;
            color: #eee;
            border: 1px solid rgba(255,255,255,0.08);
            animation: fadeIn 0.2s ease-out;
        }

        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(-10px); }
            to { opacity: 1; transform: translateY(0); }
        }

        #ms-controls h3 {
            margin: 0 0 15px 0;
            font-size: 16px;
            border-bottom: 1px solid rgba(255,255,255,0.1);
            padding-bottom: 10px;
            color: #fff;
            text-align: center;
        }

        .ms-ctrl-row {
            margin-bottom: 15px;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }

        .ms-ctrl-label {
            font-size: 13px;
            color: #bbb;
        }

        .ms-ctrl-btn {
            background: #444;
            color: white;
            border: none;
            padding: 6px 12px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 12px;
            transition: background 0.2s;
            font-weight: 600;
        }
        .ms-ctrl-btn:hover { background: #666; }
        .ms-ctrl-btn.upload { background: #1976d2; width: 100%; padding: 8px; }
        .ms-ctrl-btn.upload:hover { background: #1565c0; }

        input[type="range"] {
            width: 100px;
            height: 4px;
            background: #555;
            border-radius: 2px;
            outline: none;
            accent-color: #d32f2f;
        }
        input[type="color"] {
            border: none;
            width: 30px;
            height: 30px;
            cursor: pointer;
            padding: 0;
            background: none;
            border-radius: 50%;
            overflow: hidden;
        }
        .ms-val-display {
            font-family: monospace;
            background: rgba(0,0,0,0.3);
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 12px;
            color: #d32f2f;
        }
    `;
    GM_addStyle(css);

    function initUI() {
        const container = document.createElement('div');
        container.id = 'ms-subtitle-container';
        updateContainerStyle(container);

        const statusLine = document.createElement('div');
        statusLine.className = 'ms-status-text';
        statusLine.id = 'ms-status-line';
        statusLine.innerText = 'Đang khởi tạo...';

        // Thay đổi: Sử dụng 1 khối text duy nhất thay vì 2 dòng span
        const textBlock = document.createElement('div');
        textBlock.className = 'ms-sub-text';
        textBlock.id = 'ms-sub-block';

        container.appendChild(statusLine);
        container.appendChild(textBlock);
        document.body.appendChild(container);

        makeDraggableY(container);

        const toggleBtn = document.createElement('div');
        toggleBtn.className = 'ms-toggle-btn';
        toggleBtn.innerHTML = '⚙️';
        toggleBtn.title = "Cài đặt Phụ đề";
        toggleBtn.onclick = (e) => {
            e.stopPropagation();
            const panel = document.getElementById('ms-controls');
            panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
        };
        document.body.appendChild(toggleBtn);

        const panel = document.createElement('div');
        panel.id = 'ms-controls';
        panel.onclick = (e) => e.stopPropagation();

        panel.innerHTML = `
            <h3>Cài đặt Phụ đề</h3>

            <div class="ms-ctrl-row">
                <button class="ms-ctrl-btn upload" id="ms-load-file-btn">📂 Tải file (.srt, .ass, .lrc)</button>
                <input type="file" id="ms-file-input" accept=".srt,.lrc,.csv,.ass" style="display:none">
            </div>

            <div class="ms-ctrl-row">
                <button class="ms-ctrl-btn" id="ms-clear-sub-btn" style="width: 100%; background-color: #c62828;">🗑️ Xóa phụ đề hiện tại</button>
            </div>

            <div class="ms-ctrl-row">
                <span class="ms-ctrl-label">Lệch thời gian</span>
                <div>
                    <button class="ms-ctrl-btn" id="ms-offset-dec">-0.5s</button>
                    <span id="ms-offset-val" class="ms-val-display" style="margin: 0 5px;">0s</span>
                    <button class="ms-ctrl-btn" id="ms-offset-inc">+0.5s</button>
                </div>
            </div>

            <div class="ms-ctrl-row">
                <span class="ms-ctrl-label">Cỡ chữ</span>
                <input type="range" id="ms-font-size" min="0.8" max="3.5" step="0.1" value="${CONFIG.fontSize}">
            </div>

            <div class="ms-ctrl-row">
                <span class="ms-ctrl-label">Màu chữ</span>
                <input type="color" id="ms-font-color" value="${CONFIG.fontColor}">
            </div>

            <div class="ms-ctrl-row">
                <span class="ms-ctrl-label">Màu nền</span>
                <input type="color" id="ms-bg-color" value="${CONFIG.bgColor}">
            </div>
             <div class="ms-ctrl-row">
                <span class="ms-ctrl-label">Độ mờ nền</span>
                <input type="range" id="ms-bg-opacity" min="0" max="1" step="0.05" value="${CONFIG.bgOpacity}">
            </div>

            <div style="font-size: 11px; color: #666; text-align: center; margin-top: 15px; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 10px;">
                Missevan Subtitle v3.0
            </div>
        `;
        document.body.appendChild(panel);

        document.addEventListener('click', (e) => {
             const panel = document.getElementById('ms-controls');
             const btn = document.querySelector('.ms-toggle-btn');
             if (panel.style.display === 'block' && !panel.contains(e.target) && e.target !== btn) {
                 panel.style.display = 'none';
             }
        });

        document.getElementById('ms-load-file-btn').onclick = () => document.getElementById('ms-file-input').click();
        document.getElementById('ms-file-input').onchange = handleFileSelect;

        document.getElementById('ms-clear-sub-btn').onclick = () => {
            subtitleList = [];
            showMessage('');

            showStatus('Đã xóa phụ đề', 2000);

            if (hideContainerTimeout) clearTimeout(hideContainerTimeout);
            hideContainerTimeout = setTimeout(() => {
                const container = document.getElementById('ms-subtitle-container');
                if (container) container.style.display = 'none';
            }, 2000);
        };

        document.getElementById('ms-offset-inc').onclick = () => adjustOffset(0.5);
        document.getElementById('ms-offset-dec').onclick = () => adjustOffset(-0.5);

        document.getElementById('ms-font-size').oninput = (e) => {
            CONFIG.fontSize = e.target.value;
            GM_setValue('subtitle-size', CONFIG.fontSize);
            updateStyles();
        };
        document.getElementById('ms-font-color').oninput = (e) => {
            CONFIG.fontColor = e.target.value;
            GM_setValue('subtitle-font-color', CONFIG.fontColor);
            updateStyles();
        };
        document.getElementById('ms-bg-color').oninput = (e) => {
            CONFIG.bgColor = e.target.value;
            GM_setValue('subtitle-bg-color', CONFIG.bgColor);
            updateContainerStyle();
        };
        document.getElementById('ms-bg-opacity').oninput = (e) => {
            CONFIG.bgOpacity = e.target.value;
            GM_setValue('subtitle-bg-opacity', CONFIG.bgOpacity);
            updateContainerStyle();
        };

        updateStyles();
    }

    function updateStyles() {
        const block = document.getElementById('ms-sub-block');
        if(block) {
            block.style.color = CONFIG.fontColor;
            block.style.fontSize = `${CONFIG.fontSize}rem`;
        }
    }

    function updateContainerStyle(el) {
        const container = el || document.getElementById('ms-subtitle-container');
        if(!container) return;

        const hex = CONFIG.bgColor;
        let r = 0, g = 0, b = 0;
        if (hex.length === 4) {
            r = parseInt("0x" + hex[1] + hex[1]);
            g = parseInt("0x" + hex[2] + hex[2]);
            b = parseInt("0x" + hex[3] + hex[3]);
        } else if (hex.length === 7) {
            r = parseInt("0x" + hex[1] + hex[2]);
            g = parseInt("0x" + hex[3] + hex[4]);
            b = parseInt("0x" + hex[5] + hex[6]);
        }
        container.style.backgroundColor = `rgba(${r}, ${g}, ${b}, ${CONFIG.bgOpacity})`;
    }

    function makeDraggableY(element) {
        element.onmousedown = function(event) {
            isDragging = true;
            const rect = element.getBoundingClientRect();
            dragOffset.y = event.clientY - rect.top;

            element.style.bottom = 'auto';
            element.style.top = rect.top + 'px';
            element.style.width = '100%';
        };

        document.onmouseup = function() {
            isDragging = false;
        };

        document.onmousemove = function(event) {
            if (isDragging) {
                element.style.top = (event.clientY - dragOffset.y) + 'px';
            }
        };
    }

    function adjustOffset(value) {
        CONFIG.offset += value;
        document.getElementById('ms-offset-val').innerText = (CONFIG.offset > 0 ? '+' : '') + CONFIG.offset + 's';
        showStatus(`Offset: ${CONFIG.offset}s`, 2000);
    }

    function showMessage(msg) {
        if (hideContainerTimeout) {
            clearTimeout(hideContainerTimeout);
            hideContainerTimeout = null;
        }

        const container = document.getElementById('ms-subtitle-container');
        if (container && container.style.display === 'none') container.style.display = 'flex';

        // Sử dụng block mới để hiển thị tin nhắn
        const block = document.getElementById('ms-sub-block');
        if(block) block.innerText = msg;
    }

    function showStatus(msg, timeout = 0) {
        if (hideContainerTimeout) {
            clearTimeout(hideContainerTimeout);
            hideContainerTimeout = null;
        }

        const container = document.getElementById('ms-subtitle-container');
        if (container && container.style.display === 'none') container.style.display = 'flex';

        const status = document.getElementById('ms-status-line');
        if (status) {
            status.innerText = msg;

            if (statusTimeout) clearTimeout(statusTimeout);

            if (timeout > 0) {
                statusTimeout = setTimeout(() => {
                    status.innerText = '';
                }, timeout);
            }
        }
    }

    function handleFileSelect(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function(e) {
            const content = e.target.result;
            const ext = file.name.split('.').pop().toLowerCase();
            subtitleList = [];
            try {
                if (ext === 'srt') parseSRT(content);
                else if (ext === 'lrc') parseLRC(content);
                else if (ext === 'csv') parseCSV(content);
                else if (ext === 'ass') parseASS(content);
                else throw new Error("Định dạng không hỗ trợ");

                showStatus(`Đã tải: ${file.name}`, 3000);
                showMessage(`Sẵn sàng!`);
                setTimeout(() => showMessage(""), 2000);

                document.getElementById('ms-controls').style.display = 'none';
            } catch (err) {
                showMessage("Lỗi: " + err.message);
            } finally {
                event.target.value = '';
            }
        };
        reader.readAsText(file);
    }

    function parseSRT(text) {
        const blocks = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n\n');
        blocks.forEach(block => {
            const lines = block.split('\n');
            if (lines.length >= 3) {
                const timeLineIndex = lines.findIndex(l => l.includes('-->'));
                if (timeLineIndex !== -1) {
                    const times = lines[timeLineIndex].split(' --> ');
                    const start = parseTime(times[0]);
                    const end = parseTime(times[1]);
                    // Tự động replace \N thành xuống dòng chuẩn
                    let content = lines.slice(timeLineIndex + 1).join('\n').replace(/\\N/g, '\n');
                    if (content) subtitleList.push({ start, end, content });
                }
            }
        });
    }

    function parseLRC(text) {
        const lines = text.split(/\r?\n/);
        lines.forEach(line => {
            const match = line.match(/^\[(\d{2}):(\d{2})(?:\.|:)(\d{2,3})\](.*)/);
            if (match) {
                const min = parseInt(match[1]);
                const sec = parseInt(match[2]);
                const ms = parseInt(match[3].padEnd(3, '0').substring(0, 3));
                const start = min * 60 + sec + ms / 1000;
                let content = match[4].trim().replace(/\\N/g, '\n');
                subtitleList.push({ start, end: -1, content });
            }
        });
        subtitleList.sort((a, b) => a.start - b.start);
    }

    function parseCSV(text) {
        const rows = text.split(/\r?\n/);
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.trim() === '') continue;
            const parts = row.split(',');
            if (parts.length >= 3) {
                const start = parseTime(parts[0]);
                const end = parseTime(parts[1]);
                let content = parts.slice(2).join(',').replace(/\\N/g, '\n');
                if (content.includes(',#')) content = content.split(',#')[0];
                subtitleList.push({ start, end, content });
            }
        }
    }

    function parseASS(text) {
         const lines = text.split(/\r?\n/);
        let eventsSection = false;
        let format = [];

        lines.forEach(line => {
            line = line.trim();
            if (line === '[Events]') {
                eventsSection = true;
                return;
            }
            if (!eventsSection) return;

            if (line.startsWith('Format:')) {
                format = line.substring(7).trim().split(',').map(s => s.trim().toLowerCase());
            } else if (line.startsWith('Dialogue:')) {
                const parts = line.substring(9).trim().split(',');
                if (format.length > 0 && parts.length >= format.length) {
                    const textIndex = format.indexOf('text');
                    const startIndex = format.indexOf('start');
                    const endIndex = format.indexOf('end');

                    if (textIndex !== -1 && startIndex !== -1 && endIndex !== -1) {
                        let commaCount = 0;
                        let splitIndex = -1;
                        const contentStr = line.substring(9).trim();
                        for(let i=0; i<contentStr.length; i++) {
                            if(contentStr[i] === ',') {
                                commaCount++;
                                if(commaCount === textIndex) {
                                    splitIndex = i + 1;
                                    break;
                                }
                            }
                        }
                        if(splitIndex !== -1) {
                            let rawContent = contentStr.substring(splitIndex);
                            // Xử lý tag \N và \n
                            let content = rawContent.replace(/{[^}]+}/g, '').replace(/\\N/g, '\n').replace(/\\n/g, ' ');
                            const start = parseTime(parts[startIndex]);
                            const end = parseTime(parts[endIndex]);
                            subtitleList.push({ start, end, content });
                        }
                    }
                }
            }
        });
    }

    function parseTime(timeStr) {
        if (!timeStr) return 0;
        timeStr = timeStr.replace(',', '.');
        const parts = timeStr.split(':');
        let h=0, m=0, s=0;
        if (parts.length === 3) {
            h = parseInt(parts[0]);
            m = parseInt(parts[1]);
            s = parseFloat(parts[2]);
        } else if (parts.length === 2) {
            m = parseInt(parts[0]);
            s = parseFloat(parts[1]);
        }
        return h * 3600 + m * 60 + s;
    }

    function tryInitNativeAudio() {
        const audio = document.querySelector('audio');
        if (audio) {
            audioPlayer = audio;
            audioPlayer.addEventListener('timeupdate', () => {
                const currentTime = audioPlayer.currentTime + CONFIG.offset;
                updateSubtitleDisplay(currentTime);
            });
            audioPlayer.addEventListener('loadedmetadata', () => {
                audioDuration = audioPlayer.duration;
            });
            syncMode = 'native';
            return true;
        }
        return false;
    }

    function tryInitUISync() {
        const progressBar = document.querySelector('div.mpl');
        const timeLabel = document.querySelector('.mpsa');

        if (progressBar && timeLabel && timeLabel.innerText.includes(':')) {
            const timeParts = timeLabel.innerText.trim().split(':');
            let min = 0, sec = 0;
            if(timeParts.length >= 2) {
                min = parseInt(timeParts[0]);
                sec = parseInt(timeParts[1]);
                audioDuration = min * 60 + sec;
            }

            if (audioDuration > 0) {
                syncMode = 'ui';
                if(updateInterval) clearInterval(updateInterval);
                updateInterval = setInterval(() => {
                    const widthStyle = progressBar.style.width;
                    if(widthStyle) {
                        const percent = parseFloat(widthStyle.replace('%', ''));
                        const currentTime = (percent / 100) * audioDuration + CONFIG.offset;
                        updateSubtitleDisplay(currentTime);
                    }
                }, 100);
                return true;
            }
        }
        return false;
    }

    function updateSubtitleDisplay(currentTime) {
        if (subtitleList.length === 0) return;

        const currentSub = subtitleList.find(sub => {
            if (sub.end !== -1 && sub.end !== undefined) {
                return currentTime >= sub.start && currentTime <= sub.end;
            }
            return false;
        });

        let subToShow = null;
        if (!currentSub) {
             for (let i = 0; i < subtitleList.length; i++) {
                 if (currentTime >= subtitleList[i].start) {
                     if (i === subtitleList.length - 1 || currentTime < subtitleList[i+1].start) {
                         if (subtitleList[i].end && subtitleList[i].end !== -1) {
                             if (currentTime <= subtitleList[i].end) subToShow = subtitleList[i];
                         } else {
                             subToShow = subtitleList[i];
                         }
                         break;
                     }
                 }
             }
        } else {
            subToShow = currentSub;
        }

        renderSubtitle(subToShow);
    }

    function renderSubtitle(sub) {
        // Render Engine mới: Sử dụng 1 block duy nhất
        const block = document.getElementById('ms-sub-block');

        if (!sub) {
             const currentText = block.innerText;
             if (!currentText.includes('Chưa tải') && !currentText.includes('Sẵn sàng') && !currentText.includes('Đang kết nối') && !currentText.includes('Lỗi')) {
                 block.innerText = '';
             }
            return;
        }

        // Gán trực tiếp content, CSS white-space: pre-wrap sẽ lo việc hiển thị xuống dòng
        block.innerText = sub.content || '';
    }

    let retries = 0;
    const connectionInterval = setInterval(() => {
        retries++;
        let connected = false;

        if (tryInitNativeAudio()) {
            showStatus('● Sync: Native Audio', 3000);
            connected = true;
        }
        else if (tryInitUISync()) {
            showStatus('● Sync: UI Fallback', 3000);
            connected = true;
        }

        if (connected) {
            clearInterval(connectionInterval);
            showMessage('Đã kết nối Player!');
            setTimeout(() => { showMessage(''); }, 3000);
        } else {
            if (retries > 20) {
                clearInterval(connectionInterval);
                showStatus('⚠ Không tìm thấy Player');
            } else {
                showStatus(`Đang tìm Player... (${retries})`);
            }
        }
    }, 1000);

    window.addEventListener('load', () => {
        initUI();
        const urlParams = new URLSearchParams(window.location.search);
        const soundId = urlParams.get('id');
        if (soundId) {
            fetch('https://raw.githubusercontent.com/zhufree/subtitle-storage/main/missevan-subtitle-map.json')
                .then(res => res.json())
                .then(data => {
                    if (data[soundId]) {
                        showMessage("Đang tải sub online...");
                        fetch(data[soundId])
                            .then(r => r.text())
                            .then(text => {
                                const ext = data[soundId].split('.').pop();
                                if (ext === 'srt') parseSRT(text);
                                else if (ext === 'lrc') parseLRC(text);
                                else if (ext === 'csv') parseCSV(text);
                                else if (ext === 'ass') parseASS(text);
                                showMessage("Đã tải sub online!");
                                setTimeout(() => showMessage(""), 2000);
                            });
                    }
                }).catch(()=>{});
        }
    });

})();