// ==UserScript==
// @name         Missevan Downloader - Combined (Kitty Edition with Mode 4 Sub and Homepage Images)
// @namespace    http://tampermonkey.net/
// @version      3.4
// @description  Tự động tải phụ đề Missevan (.lrc, .json, .ass - mode 4), Audio (.m4a) và Ảnh bìa (.jpg/.png), hỗ trợ từng tập hoặc toàn bộ drama. Mặc định tải audio không nén (tùy chọn nén). Tự động chuyển JSON sang SRT khi tải phụ đề JSON. Có thể tải thêm các ảnh phụ liên quan đến sound/drama. Đã sửa đổi để ưu tiên tải ảnh bìa tập chất lượng cao (covers). Thêm tính năng tải tất cả ảnh từ trang chủ. Giao diện màu hồng dễ thương với chủ đề mèo Kitty.
// @author       Thien Truong Dia Cuu
// @match        *://www.missevan.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @grant        GM_notification
// @connect      missevan.com
// @require      https://cdnjs.cloudflare.com/ajax/libs/jszip/3.7.1/jszip.min.js
// ==/UserScript==

(function () {
    'use strict';

    // CONSTANTS
    const DRAMA_INFO_URL = "https://www.missevan.com/dramaapi/getdrama";
    const SOUND_GET_URL = "https://www.missevan.com/sound/getsound";
    const DANMAKU_GET_URL = "https://www.missevan.com/sound/getdm";
    const SOUND_IMAGES_URL = "https://www.missevan.com/sound/getimages";
    const HOMEPAGE_API_URL = "https://www.missevan.com/site/homepage";
    const UI_STATE_KEY = 'missevanDownloaderUIState';
    const DEFAULT_ASS_DURATION = 3.0;

    // UTILITIES
    const getURLParam = (key) => new URL(window.location.href).searchParams.get(key);
    const getDramaIdFromURL = () => location.pathname.match(/\/mdrama\/(\d+)/)?.[1] || null;
    const getSoundIdFromURL = () => getURLParam("id") || getURLParam("soundid");
    const isHomepage = () => location.pathname === '/' || location.pathname.startsWith('/explore');

    function log(msg) {
        const logBox = document.getElementById('logOutput');
        if (logBox) {
            const p = document.createElement('p');
            p.textContent = msg;
            logBox.appendChild(p);
            logBox.scrollTop = logBox.scrollHeight;
        }
        console.log(`[Missevan Downloader] ${msg}`);
    }

    function fetchData(url, type = 'json') {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: "GET", url, responseType: type,
                onload: res => res.status === 200 ? resolve(res.response) : reject(`Request failed: ${res.status} ${res.statusText} for ${url}`),
                onerror: err => reject(`Network error: ${err} for ${url}`)
            });
        });
    }

    const cleanFilename = (name) => name.replace(/[<>:"/\\|?*]+/g, '_').trim();
    const getFileExtension = (url) => { try { const parts = new URL(url).pathname.split('.'); return parts.length > 1 ? parts.pop().split('?')[0].toLowerCase() : ''; } catch (e) { return ''; } };
    const assTime = (sec) => {
        if (sec < 0) sec = 0;
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        const s = Math.floor(sec % 60);
        const cs = Math.round((sec - Math.floor(sec)) * 100);
        return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(cs).padStart(2,'0')}`;
    };
    const cleanText = (t) => {
        if (!t) return "";
        const el = document.createElement("textarea");
        el.innerHTML = t;
        return el.value.replace(/<[^>]+>/g, "").replace(/[\x00-\x1F\x7F]/g, "").trim().replace(/\s+/g, " ");
    };
    const parsePAttr = (p) => { const parts = p.split(","); while (parts.length < 8) parts.push(""); return parts; };

    // API FETCHERS
    async function getSoundInfo(id) {
        try {
            const data = await fetchData(`${SOUND_GET_URL}?soundid=${id}`);
            const name = cleanFilename(data?.info?.sound?.soundstr || `sound_${id}`);
            const subtitleUrl = data?.info?.sound?.subtitle_url || null;
            let audioUrl = typeof data?.info?.sound?.soundurl === 'string' ? data.info.sound.soundurl : (Array.isArray(data?.info?.sound?.soundurl) ? data.info.sound.soundurl[0]?.url : (data?.info?.sound?.soundurl?.url || data?.info?.sound?.soundurl?.url_1 || null));
            let imageUrl = data?.info?.sound?.covers?.[0] || data?.info?.sound?.front_cover || null;
            if (imageUrl && imageUrl.includes('/coversmini/')) imageUrl = imageUrl.replace('/coversmini/', '/covers/');
            return { name, subtitleUrl, audioUrl, imageUrl };
        } catch (error) { log(`❌ Lỗi lấy thông tin Sound ID ${id}: ${error}`); return { name: `sound_${id}`, subtitleUrl: null, audioUrl: null, imageUrl: null }; }
    }

    async function getDramaDetails(dramaId) {
        try {
            const res = await fetchData(`${DRAMA_INFO_URL}?drama_id=${dramaId}`);
            const name = cleanFilename(res?.info?.drama?.name || `drama_${dramaId}`);
            const imageUrl = res?.info?.drama?.cover || null;
            const ids = new Set();
            ['ft', 'music', 'episode'].forEach(type => res?.info?.episodes?.[type]?.forEach(e => e.sound_id && ids.add(e.sound_id)));
            return { name, ids: Array.from(ids), imageUrl };
        } catch (error) { log(`❌ Lỗi lấy thông tin Drama ID ${dramaId}: ${error}`); return { name: `drama_${dramaId}`, ids: [], imageUrl: null }; }
    }

    async function getAdditionalSoundImages(soundId) {
        try {
            const data = await fetchData(`${SOUND_IMAGES_URL}?soundid=${soundId}`);
            return (data?.successVal?.images || []).map(imgArray => imgArray[0]?.replace('/coversmini/', '/covers/') || null).filter(Boolean);
        } catch (error) { log(`❌ Lỗi lấy ảnh bổ sung cho Sound ID ${soundId}: ${error}`); return []; }
    }

    async function parseDanmaku(id) {
        try {
            const xmlText = await fetchData(`${DANMAKU_GET_URL}?soundid=${id}`, 'text');
            const danmakus = Array.from(new DOMParser().parseFromString(xmlText, "text/xml").querySelectorAll("d"));
            const list = {};
            danmakus.forEach(d => {
                const p = d.getAttribute("p");
                if (!p) return;
                const [stime, mode,, ,,, ,dmid] = p.split(",");
                if (mode === "4") list[dmid] = { stime, text: d.textContent };
            });
            return Object.entries(list).sort(([, a], [, b]) => parseFloat(a.stime) - parseFloat(b.stime));
        } catch (error) { log(`❌ Lỗi phân tích Danmaku cho Sound ID ${id}: ${error}`); return []; }
    }

    // SUBTITLE FORMATTERS
    function genLRC(data, title) {
        let out = `[ver:v1.0]\n[nickname:MeowMeow]\n[ti:${title}]`;
        let prev = "";
        for (const [, d] of data) {
            if (prev === d.stime) { out += " " + d.text; continue; }
            prev = d.stime;
            const [s, ms = "00"] = d.stime.split(".");
            const sec = parseInt(s);
            out += `\n[${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}.${ms.slice(0, 2)}]${d.text}`;
        }
        return out;
    }

    function convertJsonToSrt(jsonData) {
        let srtIndex = 1;
        const formatTime = ms => { const date = new Date(ms); return `${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}:${String(date.getUTCSeconds()).padStart(2, '0')},${String(date.getUTCMilliseconds()).padStart(3, '0')}`; };
        return jsonData.map(entry => {
            const [start, end] = [formatTime(entry.start_time || 0), formatTime(entry.end_time || 0)];
            let line = entry.role ? `${entry.role}: ${entry.content || ''}` : (entry.content || '');
            if (entry.color !== 16777215) line = `<font color="#${entry.color.toString(16).padStart(6, '0')}">${line}</font>`;
            if (entry.italic) line = `<i>${line}</i>`;
            if (entry.underline) line = `<u>${line}</u>`;
            return `${srtIndex++}\n${start} --> ${end}\n${line}\n`;
        }).join('\n');
    }

    function buildASS(events) {
        const ass = ["[Script Info]", "; Auto-generated by Missevan Subtitle Downloader Tampermonkey Script", "Title: Missevan Mode 4 Danmaku", "ScriptType: v4.00+", "PlayDepth: 0", "ScaledBorderAndShadow: Yes", "WrapStyle: 0", "Collisions: Normal", "", "[V4+ Styles]", "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding"];
        ass.push("Style: Default,Arial,20,&H00FFFFFF,&H0000FFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,1,1,2,10,10,10,1");
        ass.push("", "[Events]", "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text");
        events.forEach(([start, text], i) => {
            let end = (i + 1 < events.length) ? Math.min(events[i+1][0] - 0.01, start + DEFAULT_ASS_DURATION) : start + DEFAULT_ASS_DURATION;
            if (end <= start) end = start + 0.01;
            ass.push(`Dialogue: 0,${assTime(start)},${assTime(end)},Default,,0,0,0,,${text}`);
        });
        return ass.join("\n");
    }

    // DOWNLOAD LOGIC
    function downloadFile(url, name, saveAs = false) {
        return new Promise((resolve, reject) => {
            GM_download({
                url, name, saveAs,
                onload: () => { log(`✅ Đã tải: ${name}`); resolve(); },
                onerror: (e) => { log(`❌ Lỗi tải ${name}: ${e.error || e.message || e}`); reject(e); }
            });
        });
    }

    async function getASSContentForID(soundid) {
        try {
            const xmlText = await fetchData(`${DANMAKU_GET_URL}?soundid=${soundid}`, 'text');
            const events = [];
            new DOMParser().parseFromString(xmlText, "text/xml").querySelectorAll("d").forEach(d => {
                const [stime, mode] = parsePAttr(d.getAttribute("p") || "");
                const start = parseFloat(stime);
                const text = cleanText(d.textContent);
                if (mode === "4" && !isNaN(start) && text) events.push([start, text]);
            });
            events.sort((a, b) => a[0] - b[0]);
            if (events.length === 0) { log(`⚠️ Sound ID ${soundid}: Không tìm thấy danmaku mode 4.`); return null; }
            return buildASS(events);
        } catch (error) { log(`❌ Lỗi khi lấy nội dung ASS cho soundid ${soundid}: ${error}`); return null; }
    }

    async function processHomepage() {
        log(`📥 Đang xử lý trang chủ...`);
        try {
            const data = await fetchData(HOMEPAGE_API_URL);
            if (!data || !data.info) {
                log('❌ Không thể lấy dữ liệu từ trang chủ.');
                return GM_notification({ title: 'Lỗi', text: 'Không thể lấy dữ liệu từ trang chủ.', timeout: 5000 });
            }

            const zip = new JSZip();
            let filesAdded = 0;
            const info = data.info;

            const addFileToZip = async (folder, item, urlKey, nameKey) => {
                if (!item[urlKey] || !item[nameKey]) return;
                const name = cleanFilename(item[nameKey]);
                let url = item[urlKey];
                if (url.includes('/coversmini/')) url = url.replace('/coversmini/', '/covers/');

                try {
                    const ext = getFileExtension(url) || 'jpg';
                    zip.file(`${folder}/${name}.${ext}`, await fetchData(url, 'blob'));
                    filesAdded++;
                    log(`  + Đã thêm [${folder}]: ${name}`);
                    await new Promise(r => setTimeout(r, 100));
                } catch (error) {
                    log(`  ❌ Lỗi tải [${folder}] "${name}": ${error}`);
                }
            };

            if (info.links && Array.isArray(info.links)) {
                log(`- Tìm thấy ${info.links.length} ảnh banner.`);
                for (const item of info.links) await addFileToZip('Banners', item, 'pic', 'title');
            }

            if (info.albums && Array.isArray(info.albums)) {
                log(`- Tìm thấy ${info.albums.length} ảnh bìa album.`);
                for (const item of info.albums) await addFileToZip('Albums', item, 'front_cover', 'title');
            }

            if (info.sounds) {
                for (const key in info.sounds) {
                    const soundList = info.sounds[key];
                    if (Array.isArray(soundList)) {
                        log(`- Tìm thấy ${soundList.length} ảnh bìa sound từ mục '${key}'.`);
                        for (const item of soundList) await addFileToZip(`Sounds/${key}`, item, 'front_cover', 'soundstr');
                    }
                }
            }

            if (filesAdded === 0) {
                log(`⚠️ Không có file ảnh nào được tìm thấy trên trang chủ.`);
                return GM_notification({ title: 'Tải Ảnh Trang Chủ', text: 'Không có ảnh nào để tải.', timeout: 5000 });
            }

            log(`📦 Đang tạo file ZIP (${filesAdded} files)...`);
            const zipName = `Missevan_Homepage_Images_${new Date().toISOString().split('T')[0]}.zip`;
            await downloadFile(URL.createObjectURL(await zip.generateAsync({ type: "blob" })), zipName);
            GM_notification({ title: 'Tải Hoàn Tất', text: `Đã tải ${filesAdded} ảnh từ trang chủ.`, timeout: 5000 });
        } catch (error) {
            log(`❌ Lỗi nghiêm trọng khi xử lý trang chủ: ${error}`);
            GM_notification({ title: 'Lỗi', text: 'Đã xảy ra lỗi khi tải ảnh trang chủ.', timeout: 5000 });
        }
    }

    async function processDramaId(dramaId, type) {
        log(`📥 Đang xử lý drama ID: ${dramaId} (Loại: ${type.toUpperCase()})`);
        const { name: dramaName, ids, imageUrl: dramaCoverUrl } = await getDramaDetails(dramaId);
        if (ids.length === 0 && !type.includes('image')) log(`⚠️ Không tìm thấy Sound ID nào cho drama ${dramaId}.`);

        const shouldZipAudio = document.getElementById('zipAudioCheckbox')?.checked ?? false;
        const convertJsonToSrtCheckbox = document.getElementById('convertJsonToSrtCheckbox')?.checked ?? false;
        const zip = new JSZip();
        let filesAdded = 0;

        if (type === 'audio' && !shouldZipAudio) {
            log(`📦 Đang tải từng file audio cho drama ${dramaName} (không nén)...`);
            for (let i = 0; i < ids.length; i++) {
                const soundInfo = await getSoundInfo(ids[i]);
                if (soundInfo.audioUrl) await downloadFile(soundInfo.audioUrl, `${dramaName}/${soundInfo.name}.${getFileExtension(soundInfo.audioUrl) || 'm4a'}`);
                else log(`⚠️ Sound ID ${ids[i]}: Không có URL Audio.`);
                await new Promise(r => setTimeout(r, 200));
            }
            log(`✅ Hoàn tất tải từng file audio cho drama ${dramaName}.`);
            GM_notification({ title: 'Tải Drama Hoàn Tất', text: `Đã hoàn tất tải từng file audio cho drama: ${dramaName}.`, timeout: 5000 });
            return;
        }

        if (type === 'image' || type === 'all-images') {
            if (dramaCoverUrl) {
                try {
                    zip.file(`${dramaName}_cover.${getFileExtension(dramaCoverUrl) || 'jpg'}`, await fetchData(dramaCoverUrl, 'blob'));
                    filesAdded++; log(`✅ Đã thêm ảnh bìa drama vào ZIP.`);
                } catch (error) { log(`❌ Lỗi tải ảnh bìa drama từ URL ${dramaCoverUrl}: ${error}`); }
            } else { log(`⚠️ Không có URL ảnh bìa chính cho Drama ${dramaId}.`); }
        }

        for (let i = 0; i < ids.length; i++) {
            const id = ids[i]; log(`(${i + 1}/${ids.length}) Xử lý Sound ID ${id}`);
            const soundInfo = await getSoundInfo(id);
            const title = soundInfo.name;

            if (type === 'lrc') {
                const data = await parseDanmaku(id);
                if (data.length) { zip.file(`${title}.lrc`, genLRC(data, title)); filesAdded++; }
                else log(`⚠️ Sound ID ${id}: Không có dữ liệu Danmaku Mode 4 để tạo LRC.`);
            } else if (type === 'json') {
                if (soundInfo.subtitleUrl) {
                    try {
                        const jsonData = await fetchData(soundInfo.subtitleUrl, 'json');
                        const fileName = `${title}.${convertJsonToSrtCheckbox ? 'srt' : 'json'}`;
                        const fileContent = convertJsonToSrtCheckbox ? convertJsonToSrt(jsonData) : JSON.stringify(jsonData, null, 2);
                        zip.file(fileName, fileContent); filesAdded++; log(`✅ Sound ID ${id}: Đã thêm ${fileName} vào ZIP.`);
                    } catch (error) { log(`❌ Sound ID ${id}: Lỗi tải/chuyển đổi JSON từ URL ${soundInfo.subtitleUrl}: ${error}`); }
                } else { log(`⚠️ Sound ID ${id}: Không có URL phụ đề JSON.`); }
            } else if (type === 'ass') {
                try {
                    const assContent = await getASSContentForID(id);
                    if (assContent) { zip.file(`${title}.ass`, assContent); filesAdded++; log(`✅ Sound ID ${id}: Đã thêm ${title}.ass vào ZIP.`); }
                } catch (error) { log(`❌ Sound ID ${id}: Lỗi khi lấy nội dung ASS: ${error}`); }
            } else if (type === 'audio' && shouldZipAudio) {
                if (soundInfo.audioUrl) {
                    try {
                        zip.file(`${title}.${getFileExtension(soundInfo.audioUrl) || 'm4a'}`, await fetchData(soundInfo.audioUrl, 'blob'));
                        filesAdded++;
                    } catch (error) { log(`❌ Sound ID ${id}: Lỗi tải Audio để nén vào ZIP từ URL ${soundInfo.audioUrl}: ${error}`); }
                } else { log(`⚠️ Sound ID ${id}: Không có URL Audio.`); }
            } else if (type === 'all-images') {
                if (soundInfo.imageUrl) {
                     try { zip.file(`images/${title}_cover.${getFileExtension(soundInfo.imageUrl) || 'jpg'}`, await fetchData(soundInfo.imageUrl, 'blob')); filesAdded++; }
                     catch (error) { log(`❌ Sound ID ${id}: Lỗi tải ảnh bìa tập từ URL ${soundInfo.imageUrl}: ${error}`); }
                } else { log(`⚠️ Sound ID ${id}: Không có URL ảnh bìa tập.`); }
                const additionalImages = await getAdditionalSoundImages(id);
                for (let j = 0; j < additionalImages.length; j++) {
                    try { zip.file(`images/${title}_extra_${j+1}.${getFileExtension(additionalImages[j]) || 'jpg'}`, await fetchData(additionalImages[j], 'blob')); filesAdded++; }
                    catch (error) { log(`❌ Sound ID ${id}: Lỗi tải ảnh bổ sung từ URL ${additionalImages[j]}: ${error}`); }
                }
            }
            await new Promise(r => setTimeout(r, 200));
        }

        if (filesAdded === 0) { log(`⚠️ Không có file nào được tạo cho drama này.`); GM_notification({ title: 'Tải Drama Hoàn Tất', text: `Không có file nào được tạo cho drama: ${dramaName}.`, timeout: 5000 }); return; }
        log(`📦 Đang tạo file ZIP (${filesAdded} files)...`);
        try { await downloadFile(URL.createObjectURL(await zip.generateAsync({ type: "blob" })), `${dramaName}_${type}${convertJsonToSrtCheckbox && type === 'json' ? '_srt' : ''}.zip`); }
        catch (error) { log(`❌ Lỗi tạo hoặc tải file ZIP: ${error}`); }
        GM_notification({ title: 'Tải Drama Hoàn Tất', text: `Đã hoàn tất tải các file cho drama: ${dramaName}.`, timeout: 5000 });
    }

    async function processSingleSoundId(soundId, type) {
        log(`🎵 Tải từng tập với Sound ID: ${soundId} (Loại: ${type.toUpperCase()})`);
        const soundInfo = await getSoundInfo(soundId);
        const name = soundInfo.name;
        const convertJsonToSrtCheckbox = document.getElementById('convertJsonToSrtCheckbox')?.checked ?? false;

        if (type === 'lrc') {
            const data = await parseDanmaku(soundId);
            if (!data.length) return log("⚠️ Không có phụ đề LRC (Danmaku Mode 4).");
            await downloadFile(URL.createObjectURL(new Blob([genLRC(data, name)], { type: "text/plain" })), `${name}.lrc`);
        } else if (type === 'json') {
            if (!soundInfo.subtitleUrl) return log("⚠️ Không có URL phụ đề JSON.");
            try {
                const jsonData = await fetchData(soundInfo.subtitleUrl, 'json');
                const [content, mime, ext] = convertJsonToSrtCheckbox ? [convertJsonToSrt(jsonData), "text/plain", "srt"] : [JSON.stringify(jsonData, null, 2), "application/json", "json"];
                await downloadFile(URL.createObjectURL(new Blob([content], { type: mime })), `${name}.${ext}`);
            } catch (error) { log(`❌ Lỗi tải hoặc phân tích JSON: ${error}`); }
        } else if (type === 'ass') {
            try {
                const assContent = await getASSContentForID(soundId);
                if (assContent) await downloadFile(URL.createObjectURL(new Blob([assContent], { type: "text/plain" })), `${name}.ass`);
            } catch (error) { log(`❌ Lỗi tải ASS: ${error}`); }
        } else if (type === 'audio') {
            if (!soundInfo.audioUrl) return log("⚠️ Không có URL Audio.");
            try { await downloadFile(soundInfo.audioUrl, `${name}.${getFileExtension(soundInfo.audioUrl) || 'm4a'}`); }
            catch (error) { log(`❌ Lỗi tải Audio: ${error}`); }
        } else if (type === 'image') {
            if (!soundInfo.imageUrl) return log("⚠️ Không có URL ảnh bìa cho tập này.");
            try { await downloadFile(soundInfo.imageUrl, `${name}_cover.${getFileExtension(soundInfo.imageUrl) || 'jpg'}`); }
            catch (error) { log(`❌ Lỗi tải Ảnh: ${error}`); }
        } else if (type === 'all-images') {
            const zip = new JSZip(); let filesAdded = 0;
            if (soundInfo.imageUrl) {
                try { zip.file(`${name}_cover.${getFileExtension(soundInfo.imageUrl) || 'jpg'}`, await fetchData(soundInfo.imageUrl, 'blob')); filesAdded++; }
                catch (error) { log(`❌ Lỗi tải ảnh bìa tập từ URL ${soundInfo.imageUrl}: ${error}`); }
            } else { log(`⚠️ Không có URL ảnh bìa tập.`); }
            for (let j = 0, additionalImages = await getAdditionalSoundImages(soundId); j < additionalImages.length; j++) {
                try { zip.file(`${name}_extra_${j+1}.${getFileExtension(additionalImages[j]) || 'jpg'}`, await fetchData(additionalImages[j], 'blob')); filesAdded++; }
                catch (error) { log(`❌ Lỗi tải ảnh bổ sung từ URL ${additionalImages[j]}: ${error}`); }
            }
            if (filesAdded === 0) { log(`⚠️ Không có file ảnh nào được tạo cho tập này.`); GM_notification({ title: 'Tải Tập Hoàn Tất', text: `Không có file ảnh nào được tạo cho tập: ${name}.`, timeout: 5000 }); return; }
            log(`📦 Đang tạo file ZIP (${filesAdded} files)...`);
            try { await downloadFile(URL.createObjectURL(await zip.generateAsync({ type: "blob" })), `${name}_all_images.zip`); }
            catch (error) { log(`❌ Lỗi tạo hoặc tải file ZIP: ${error}`); }
        }
        GM_notification({ title: 'Tải Tập Hoàn Tất', text: `Đã hoàn tất tải file cho tập: ${name}.`, timeout: 5000 });
    }

    // UI CREATION
    function createUI() {
        document.getElementById('missevanSubtitleTool')?.remove(); // Clean up
        const box = document.createElement("div");
        box.id = "missevanSubtitleTool";
        box.style = `
            position: fixed; top: 10px; left: 10px;
            background: #ffe6f2; border: 1px solid #ffccdd; padding: 10px;
            z-index: 10000; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            font-size: 13px; width: 280px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            border-radius: 8px; display: flex; flex-direction: column; gap: 10px;
            max-height: 95vh; overflow-y: auto; resize: both; min-width: 250px; min-height: 200px;
        `;

        const isUIHidden = localStorage.getItem(UI_STATE_KEY) === 'hidden';
        if (isUIHidden) { box.style.cssText += 'width:fit-content;height:fit-content;overflow:hidden;padding:5px;'; }

        box.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #ffadd1; padding-bottom: 8px; margin-bottom: 5px;">
                <h3 style="margin: 0; text-align: left; color: #d63384; font-size: 16px; display: flex; align-items: center;">
                    <span style="font-size: 20px; margin-right: 5px;">😻</span> Missevan Downloader
                </h3>
                <button id="toggleUIBtn" title="Ẩn/Hiện giao diện" style="background: none; border: none; font-size: 18px; cursor: pointer; color: #d63384; padding: 0 5px; line-height: 1;">
                    ${isUIHidden ? '&#x25B2;' : '&#x25BC;'}
                </button>
            </div>

            <div id="uiContent" style="display: ${isUIHidden ? 'none' : 'flex'}; flex-direction: column; gap: 10px;">
                <div style="padding: 5px 0; border-bottom: 1px solid #ffadd1;">
                    <div style="margin-bottom: 8px;">
                        <input type="checkbox" id="zipAudioCheckbox" style="margin-right: 5px; transform: scale(1.1);">
                        <label for="zipAudioCheckbox" style="font-size: 12px; color: #884a6c; cursor: pointer;">Nén Audio Drama vào ZIP?</label>
                        <p style="font-size: 10px; color: #a1648a; margin: 3px 0 0 20px;">(Bỏ chọn để tải từng file audio cho Drama)</p>
                    </div>
                    <div>
                        <input type="checkbox" id="convertJsonToSrtCheckbox" checked style="margin-right: 5px; transform: scale(1.1);">
                        <label for="convertJsonToSrtCheckbox" style="font-size: 12px; color: #884a6c; cursor: pointer;">Chuyển JSON Subtitle sang SRT?</label>
                    </div>
                </div>

                <div id="homepageDownloaderContainer" style="display: none; flex-direction: column; gap: 7px; border-top: 1px solid #ffadd1; padding-top: 10px;">
                    <strong style="color: #6a8c4a; display: flex; align-items: center; gap: 5px;">
                        <span style="font-size: 16px;">🏡</span> Tải từ Trang chủ:
                    </strong>
                    <button id="downloadHomepageImagesBtn" class="btn homepage-btn"><span class="icon">🖼️</span> Tải tất cả ảnh trang chủ (ZIP)</button>
                </div>

                <div id="dramaDownloaderContainer" style="display: none; flex-direction: column; gap: 7px; border-top: 1px solid #ffadd1; padding-top: 10px;">
                    <strong style="color: #c06c84; display: flex; align-items: center; gap: 5px;">
                        <span style="font-size: 16px;">🐾</span> Tải TOÀN BỘ Drama (ZIP):
                    </strong>
                    <button id="downloadDramaLrcBtn" class="btn drama-btn pink-1"><span class="icon">💬</span> Phụ đề LRC</button>
                    <button id="downloadDramaJsonBtn" class="btn drama-btn pink-2"><span class="icon">📄</span> Phụ đề JSON / SRT</button>
                    <button id="downloadDramaAssBtn" class="btn drama-btn pink-ass"><span class="icon">📝</span> Phụ đề ASS</button>
                    <button id="downloadDramaAudioBtn" class="btn drama-btn pink-3"><span class="icon">🎧</span> Toàn bộ Audio</button>
                    <button id="downloadDramaImageBtn" class="btn drama-btn pink-4"><span class="icon">🖼️</span> Ảnh bìa Drama</button>
                    <button id="downloadDramaAllImagesBtn" class="btn drama-btn pink-5"><span class="icon">🎀</span> Tất cả ảnh Drama</button>
                </div>

                <div id="soundDownloaderContainer" style="display: none; flex-direction: column; gap: 7px; border-top: 1px solid #ffadd1; padding-top: 10px;">
                    <strong style="color: #a87ea8; display: flex; align-items: center; gap: 5px;">
                        <span style="font-size: 16px;">🐱</span> Tải TỪNG Tập (Sound ID):
                    </strong>
                    <button id="downloadSoundLrcBtn" class="btn sound-btn purple-1"><span class="icon">💬</span> Phụ đề LRC</button>
                    <button id="downloadSoundJsonBtn" class="btn sound-btn purple-2"><span class="icon">📄</span> Phụ đề JSON / SRT</button>
                    <button id="downloadSoundAssBtn" class="btn sound-btn purple-ass"><span class="icon">📝</span> Phụ đề ASS</button>
                    <button id="downloadSoundAudioBtn" class="btn sound-btn purple-3"><span class="icon">🔊</span> Audio tập</button>
                    <button id="downloadSoundImageBtn" class="btn sound-btn purple-4"><span class="icon">🖼️</span> Ảnh bìa tập</button>
                    <button id="downloadSoundAllImagesBtn" class="btn sound-btn purple-5"><span class="icon">✨</span> Tất cả ảnh tập</button>
                </div>

                <div style="border-top: 1px solid #ffadd1; padding-top: 10px;">
                    <h4 style="margin: 0 0 5px 0; color: #d63384; font-size: 14px; display: flex; align-items: center; gap: 5px;">
                        <span style="font-size: 16px;">📝</span> Nhật ký Meow:
                    </h4>
                    <div id="logOutput" style="background:#fff0f5;border:1px solid #ffc0cb;height:120px;overflow-y:auto;padding:5px;font-size:10px;color:#884a6c;border-radius:4px; line-height: 1.4;">
                        Sẵn sàng meow!
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(box);

        const style = document.createElement('style');
        style.innerHTML = `
            #missevanSubtitleTool .btn { color: white; padding: 8px 12px; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; width: 100%; text-align: center; transition: background-color 0.2s ease, transform 0.1s ease, box-shadow 0.2s ease; display: flex; align-items: center; justify-content: center; gap: 8px; }
            #missevanSubtitleTool .btn .icon { font-size: 14px; }
            #missevanSubtitleTool .btn:hover { transform: translateY(-1px); box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
            #missevanSubtitleTool .btn:active { transform: translateY(0); box-shadow: none; }
            .homepage-btn { background-color: #77dd77; } .homepage-btn:hover { background-color: #6cc46c; }
            .drama-btn.pink-1 { background-color: #ff85a2; } .drama-btn.pink-1:hover { background-color: #ff6a8e; }
            .drama-btn.pink-2 { background-color: #ff99bb; } .drama-btn.pink-2:hover { background-color: #ff7faa; }
            .drama-btn.pink-ass { background-color: #f77f8d; } .drama-btn.pink-ass:hover { background-color: #e06c7a; }
            .drama-btn.pink-3 { background-color: #ffb3cc; } .drama-btn.pink-3:hover { background-color: #ffa3be; }
            .drama-btn.pink-4 { background-color: #ffd6e6; color: #884a6c; } .drama-btn.pink-4:hover { background-color: #ffc0d9; }
            .drama-btn.pink-5 { background-color: #e0b0d6; } .drama-btn.pink-5:hover { background-color: #c993c1; }
            .sound-btn.purple-1 { background-color: #c780e0; } .sound-btn.purple-1:hover { background-color: #b36cd1; }
            .sound-btn.purple-2 { background-color: #e0b0e0; } .sound-btn.purple-2:hover { background-color: #d19fcd; }
            .sound-btn.purple-ass { background-color: #a87ea8; } .sound-btn.purple-ass:hover { background-color: #936b94; }
            .sound-btn.purple-3 { background-color: #a272b0; } .sound-btn.purple-3:hover { background-color: #90629c; }
            .sound-btn.purple-4 { background-color: #f7b7d7; } .sound-btn.purple-4:hover { background-color: #f0a4cd; }
            .sound-btn.purple-5 { background-color: #d8bfd8; } .sound-btn.purple-5:hover { background-color: #c2aac2; }
        `;
        document.head.appendChild(style);

        const dramaId = getDramaIdFromURL();
        const soundId = getSoundIdFromURL();
        let sectionsVisible = 0;

        if (isHomepage()) {
            document.getElementById('homepageDownloaderContainer').style.display = 'flex';
            document.getElementById('downloadHomepageImagesBtn').addEventListener('click', processHomepage);
            sectionsVisible++;
        }

        if (dramaId) {
            document.getElementById('dramaDownloaderContainer').style.display = 'flex';
            document.getElementById('downloadDramaLrcBtn').addEventListener('click', () => processDramaId(dramaId, 'lrc'));
            document.getElementById('downloadDramaJsonBtn').addEventListener('click', () => processDramaId(dramaId, 'json'));
            document.getElementById('downloadDramaAssBtn').addEventListener('click', () => processDramaId(dramaId, 'ass'));
            document.getElementById('downloadDramaAudioBtn').addEventListener('click', () => processDramaId(dramaId, 'audio'));
            document.getElementById('downloadDramaImageBtn').addEventListener('click', () => processDramaId(dramaId, 'image'));
            document.getElementById('downloadDramaAllImagesBtn').addEventListener('click', () => processDramaId(dramaId, 'all-images'));
            sectionsVisible++;
        }

        if (soundId) {
            document.getElementById('soundDownloaderContainer').style.display = 'flex';
            document.getElementById('downloadSoundLrcBtn').addEventListener('click', () => processSingleSoundId(soundId, 'lrc'));
            document.getElementById('downloadSoundJsonBtn').addEventListener('click', () => processSingleSoundId(soundId, 'json'));
            document.getElementById('downloadSoundAssBtn').addEventListener('click', () => processSingleSoundId(soundId, 'ass'));
            document.getElementById('downloadSoundAudioBtn').addEventListener('click', () => processSingleSoundId(soundId, 'audio'));
            document.getElementById('downloadSoundImageBtn').addEventListener('click', () => processSingleSoundId(soundId, 'image'));
            document.getElementById('downloadSoundAllImagesBtn').addEventListener('click', () => processSingleSoundId(soundId, 'all-images'));
            sectionsVisible++;
        }

        if (sectionsVisible === 0) {
            log("⚠️ Không tìm thấy ID hợp lệ hoặc không phải trang được hỗ trợ.");
        }

        const toggleUIBtn = document.getElementById('toggleUIBtn');
        const uiContent = document.getElementById('uiContent');
        const missevanSubtitleTool = document.getElementById('missevanSubtitleTool');

        toggleUIBtn.addEventListener('click', () => {
            const isHidden = uiContent.style.display === 'none';
            uiContent.style.display = isHidden ? 'flex' : 'none';
            toggleUIBtn.innerHTML = isHidden ? '&#x25BC;' : '&#x25B2;';
            missevanSubtitleTool.style.cssText += isHidden ? 'width:280px;height:auto;overflow:auto;padding:10px;' : 'width:fit-content;height:fit-content;overflow:hidden;padding:5px;';
            localStorage.setItem(UI_STATE_KEY, isHidden ? 'visible' : 'hidden');
        });
    }

    // INITIALIZATION
    window.addEventListener('load', createUI);
    let lastUrl = location.href;
    const urlCheckInterval = setInterval(() => { if (lastUrl !== location.href) { lastUrl = location.href; console.log("URL changed to:", lastUrl); createUI(); } }, 500);
    window.addEventListener('beforeunload', () => clearInterval(urlCheckInterval));
})();
