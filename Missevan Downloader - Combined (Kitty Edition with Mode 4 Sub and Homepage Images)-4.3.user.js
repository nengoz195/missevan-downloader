// ==UserScript==
// @name         Missevan Downloader - Combined (Kitty Edition with Mode 4 Sub and Homepage Images)
// @namespace    http://tampermonkey.net/
// @version      4.3
// @description  Giao diện phong cách cute xanh lá, panel hiện ở góc trái. Tự động tải phụ đề Missevan (.lrc, .json, .ass - mode 4), Audio (.m4a) và Ảnh bìa, hỗ trợ từng tập hoặc toàn bộ drama. Tự động chuyển JSON sang SRT. Tải ảnh từ trang chủ.
// @author       Thien Truong Dia Cuu
// @match        *://www.missevan.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @grant        GM_notification
// @connect      missevan.com
// @connect      *
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
    const UI_STATE_KEY = 'missevanDownloaderUIState_v4_green';
    const DEFAULT_ASS_DURATION = 3.0;

    // UTILITIES
    const getURLParam = (key) => new URL(window.location.href).searchParams.get(key);
    const getDramaIdFromURL = () => location.pathname.match(/\/mdrama\/(\d+)/)?.[1] || null;
    const getSoundIdFromURL = () => getURLParam("id") || getURLParam("soundid");
    const isHomepage = () => location.pathname === '/' || location.pathname.startsWith('/explore');

    function log(msg) {
        const logBox = document.getElementById('mde-log-output');
        if (logBox) {
            const p = document.createElement('p');
            p.innerHTML = msg;
            logBox.appendChild(p);
            logBox.scrollTop = logBox.scrollHeight;
        }
        console.log(`[Missevan Downloader] ${msg.replace(/<[^>]+>/g, '')}`);
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

    // --- CORE LOGIC ---
    async function getSoundInfo(id) { try { const data = await fetchData(`${SOUND_GET_URL}?soundid=${id}`); const name = cleanFilename(data?.info?.sound?.soundstr || `sound_${id}`); const subtitleUrl = data?.info?.sound?.subtitle_url || null; let audioUrl = typeof data?.info?.sound?.soundurl === 'string' ? data.info.sound.soundurl : (Array.isArray(data?.info?.sound?.soundurl) ? data.info.sound.soundurl[0]?.url : (data?.info?.sound?.soundurl?.url || data?.info?.sound?.soundurl?.url_1 || null)); let imageUrl = data?.info?.sound?.covers?.[0] || data?.info?.sound?.front_cover || null; if (imageUrl && imageUrl.includes('/coversmini/')) imageUrl = imageUrl.replace('/coversmini/', '/covers/'); return { name, subtitleUrl, audioUrl, imageUrl }; } catch (error) { log(`❌ <span class="error">Lỗi lấy thông tin Sound ID ${id}:</span> ${error}`); return { name: `sound_${id}`, subtitleUrl: null, audioUrl: null, imageUrl: null }; } }
    async function getDramaDetails(dramaId) { try { const res = await fetchData(`${DRAMA_INFO_URL}?drama_id=${dramaId}`); const name = cleanFilename(res?.info?.drama?.name || `drama_${dramaId}`); const imageUrl = res?.info?.drama?.cover || null; const ids = new Set(); ['ft', 'music', 'episode'].forEach(type => res?.info?.episodes?.[type]?.forEach(e => e.sound_id && ids.add(e.sound_id))); return { name, ids: Array.from(ids), imageUrl }; } catch (error) { log(`❌ <span class="error">Lỗi lấy thông tin Drama ID ${dramaId}:</span> ${error}`); return { name: `drama_${dramaId}`, ids: [], imageUrl: null }; } }
    async function getAdditionalSoundImages(soundId) { try { const data = await fetchData(`${SOUND_IMAGES_URL}?soundid=${soundId}`); return (data?.successVal?.images || []).map(imgArray => imgArray[0]?.replace('/coversmini/', '/covers/') || null).filter(Boolean); } catch (error) { log(`❌ <span class="error">Lỗi lấy ảnh bổ sung cho Sound ID ${soundId}:</span> ${error}`); return []; } }
    async function parseDanmaku(id) { try { const xmlText = await fetchData(`${DANMAKU_GET_URL}?soundid=${id}`, 'text'); const danmakus = Array.from(new DOMParser().parseFromString(xmlText, "text/xml").querySelectorAll("d")); const list = {}; danmakus.forEach(d => { const p = d.getAttribute("p"); if (!p) return; const [stime, mode,, ,,, , dmid] = p.split(","); if (mode === "4") list[dmid] = { stime, text: d.textContent }; }); return Object.entries(list).sort(([, a], [, b]) => parseFloat(a.stime) - parseFloat(b.stime)); } catch (error) { log(`❌ <span class="error">Lỗi phân tích Danmaku cho Sound ID ${id}:</span> ${error}`); return []; } }
    function genLRC(data, title) { let out = `[ver:v1.0]\n[nickname:Froggie]\n[ti:${title}]`; let prev = ""; for (const [, d] of data) { if (prev === d.stime) { out += " " + d.text; continue; } prev = d.stime; const [s, ms = "00"] = d.stime.split("."); const sec = parseInt(s); out += `\n[${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}.${ms.slice(0, 2)}]${d.text}`; } return out; }
    function convertJsonToSrt(jsonData) { let srtIndex = 1; const formatTime = ms => { const date = new Date(ms); return `${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}:${String(date.getUTCSeconds()).padStart(2, '0')},${String(date.getUTCMilliseconds()).padStart(3, '0')}`; }; return jsonData.map(entry => { const [start, end] = [formatTime(entry.start_time || 0), formatTime(entry.end_time || 0)]; let line = entry.role ? `${entry.role}: ${entry.content || ''}` : (entry.content || ''); if (entry.color !== 16777215) line = `<font color="#${entry.color.toString(16).padStart(6, '0')}">${line}</font>`; if (entry.italic) line = `<i>${line}</i>`; if (entry.underline) line = `<u>${line}</u>`; return `${srtIndex++}\n${start} --> ${end}\n${line}\n`; }).join('\n'); }
    function buildASS(events) { const ass = ["[Script Info]", "; Auto-generated by Missevan Subtitle Downloader", "Title: Missevan Mode 4 Danmaku", "ScriptType: v4.00+", "PlayDepth: 0", "ScaledBorderAndShadow: Yes", "WrapStyle: 0", "Collisions: Normal", "", "[V4+ Styles]", "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding"]; ass.push("Style: Default,Arial,20,&H00FFFFFF,&H0000FFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,1,1,2,10,10,10,1"); ass.push("", "[Events]", "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text"); events.forEach(([start, text], i) => { let end = (i + 1 < events.length) ? Math.min(events[i + 1][0] - 0.01, start + DEFAULT_ASS_DURATION) : start + DEFAULT_ASS_DURATION; if (end <= start) end = start + 0.01; ass.push(`Dialogue: 0,${assTime(start)},${assTime(end)},Default,,0,0,0,,${text}`); }); return ass.join("\n"); }

    // SỬA LỖI: Chia làm 2 hàm tải.
    // 1. Tải bằng anchor tag cho file (Blob) được tạo ra (LRC, ASS, ZIP, v.v.) để tránh lỗi 'not_whitelisted'.
    function downloadGeneratedFile(blob, name) {
        return new Promise((resolve, reject) => {
            try {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.style.display = 'none';
                a.href = url;
                a.download = name;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                log(`✅ <span class="success">Đã tải:</span> ${name}`);
                resolve();
            } catch (e) {
                log(`❌ <span class="error">Lỗi tải (anchor) ${name}:</span> ${e.message || e}`);
                reject(e);
            }
        });
    }

    // 2. Dùng GM_download cho các URL trực tiếp (Audio, Ảnh)
    function downloadDirectUrl(url, name, saveAs = false) {
        return new Promise((resolve, reject) => {
            GM_download({
                url,
                name,
                saveAs,
                onload: () => {
                    log(`✅ <span class="success">Đã tải:</span> ${name}`);
                    resolve();
                },
                onerror: (e) => {
                    log(`❌ <span class="error">Lỗi tải (GM) ${name}:</span> ${e.error || e.message || e}`);
                    reject(e);
                }
            });
        });
    }

    async function getASSContentForID(soundid) { try { const xmlText = await fetchData(`${DANMAKU_GET_URL}?soundid=${soundid}`, 'text'); const events = []; new DOMParser().parseFromString(xmlText, "text/xml").querySelectorAll("d").forEach(d => { const [stime, mode] = parsePAttr(d.getAttribute("p") || ""); const start = parseFloat(stime); const text = cleanText(d.textContent); if (mode === "4" && !isNaN(start) && text) events.push([start, text]); }); events.sort((a, b) => a[0] - b[0]); if (events.length === 0) { log(`⚠️ <span class="warning">Sound ID ${soundid}:</span> Không tìm thấy danmaku mode 4.`); return null; } return buildASS(events); } catch (error) { log(`❌ <span class="error">Lỗi khi lấy nội dung ASS cho soundid ${soundid}:</span> ${error}`); return null; } }
    async function processHomepage() { log(`📥 <strong>Đang xử lý trang chủ...</strong>`); try { const data = await fetchData(HOMEPAGE_API_URL); if (!data || !data.info) { log('❌ <span class="error">Không thể lấy dữ liệu từ trang chủ.</span>'); return GM_notification({ title: 'Lỗi', text: 'Không thể lấy dữ liệu từ trang chủ.', timeout: 5000 }); } const zip = new JSZip(); let filesAdded = 0; const info = data.info; const addFileToZip = async (folder, item, urlKey, nameKey) => { if (!item[urlKey] || !item[nameKey]) return; const name = cleanFilename(item[nameKey]); let url = item[urlKey]; if (url.includes('/coversmini/')) url = url.replace('/coversmini/', '/covers/'); try { const ext = getFileExtension(url) || 'jpg'; zip.file(`${folder}/${name}.${ext}`, await fetchData(url, 'blob')); filesAdded++; log(`  + Đã thêm [${folder}]: ${name}`); await new Promise(r => setTimeout(r, 100)); } catch (error) { log(`  ❌ Lỗi tải [${folder}] "${name}": ${error}`); } }; if (info.links && Array.isArray(info.links)) { log(`- Tìm thấy ${info.links.length} ảnh banner.`); for (const item of info.links) await addFileToZip('Banners', item, 'pic', 'title'); } if (info.albums && Array.isArray(info.albums)) { log(`- Tìm thấy ${info.albums.length} ảnh bìa album.`); for (const item of info.albums) await addFileToZip('Albums', item, 'front_cover', 'title'); } if (info.sounds) { for (const key in info.sounds) { const soundList = info.sounds[key]; if (Array.isArray(soundList)) { log(`- Tìm thấy ${soundList.length} ảnh bìa sound từ mục '${key}'.`); for (const item of soundList) await addFileToZip(`Sounds/${key}`, item, 'front_cover', 'soundstr'); } } } if (filesAdded === 0) { log(`⚠️ <span class="warning">Không có file ảnh nào được tìm thấy trên trang chủ.</span>`); return GM_notification({ title: 'Tải Ảnh Trang Chủ', text: 'Không có ảnh nào để tải.', timeout: 5000 }); } log(`📦 Đang tạo file ZIP (${filesAdded} files)...`); const zipName = `Missevan_Homepage_Images_${new Date().toISOString().split('T')[0]}.zip`;
        // THAY ĐỔI: Dùng hàm downloadGeneratedFile
        await downloadGeneratedFile(await zip.generateAsync({ type: "blob" }), zipName);
        GM_notification({ title: 'Tải Hoàn Tất', text: `Đã tải ${filesAdded} ảnh từ trang chủ.`, timeout: 5000 }); } catch (error) { log(`❌ <span class="error">Lỗi nghiêm trọng khi xử lý trang chủ:</span> ${error}`); GM_notification({ title: 'Lỗi', text: 'Đã xảy ra lỗi khi tải ảnh trang chủ.', timeout: 5000 }); } }
    async function processDramaId(dramaId, type) { log(`📥 <strong>Đang xử lý drama ID: ${dramaId} (Loại: ${type.toUpperCase()})</strong>`); const { name: dramaName, ids, imageUrl: dramaCoverUrl } = await getDramaDetails(dramaId); if (ids.length === 0 && !type.includes('image')) log(`⚠️ <span class="warning">Không tìm thấy Sound ID nào cho drama ${dramaId}.</span>`); const shouldZipAudio = document.getElementById('zipAudioCheckbox')?.checked ?? false; const convertJsonToSrtCheckbox = document.getElementById('convertJsonToSrtCheckbox')?.checked ?? false; const zip = new JSZip(); let filesAdded = 0; if (type === 'audio' && !shouldZipAudio) { log(`📦 Đang tải từng file audio cho drama ${dramaName} (không nén)...`); for (let i = 0; i < ids.length; i++) { const soundInfo = await getSoundInfo(ids[i]);
            // THAY ĐỔI: Dùng hàm downloadDirectUrl
            if (soundInfo.audioUrl) await downloadDirectUrl(soundInfo.audioUrl, `${dramaName}/${soundInfo.name}.${getFileExtension(soundInfo.audioUrl) || 'm4a'}`); else log(`⚠️ Sound ID ${ids[i]}: Không có URL Audio.`); await new Promise(r => setTimeout(r, 200)); } log(`✅ Hoàn tất tải từng file audio cho drama ${dramaName}.`); GM_notification({ title: 'Tải Drama Hoàn Tất', text: `Đã hoàn tất tải từng file audio cho drama: ${dramaName}.`, timeout: 5000 }); return; } if (type === 'image' || type === 'all-images') { if (dramaCoverUrl) { try { zip.file(`${dramaName}_cover.${getFileExtension(dramaCoverUrl) || 'jpg'}`, await fetchData(dramaCoverUrl, 'blob')); filesAdded++; log(`✅ Đã thêm ảnh bìa drama vào ZIP.`); } catch (error) { log(`❌ Lỗi tải ảnh bìa drama từ URL ${dramaCoverUrl}: ${error}`); } } else { log(`⚠️ Không có URL ảnh bìa chính cho Drama ${dramaId}.`); } } for (let i = 0; i < ids.length; i++) { const id = ids[i]; log(`(${i + 1}/${ids.length}) Xử lý Sound ID ${id}`); const soundInfo = await getSoundInfo(id); const title = soundInfo.name; switch (type) { case 'lrc': const data = await parseDanmaku(id); if (data.length) { zip.file(`${title}.lrc`, genLRC(data, title)); filesAdded++; } else log(`⚠️ Sound ID ${id}: Không có dữ liệu Danmaku Mode 4 để tạo LRC.`); break; case 'json': if (soundInfo.subtitleUrl) { try { const jsonData = await fetchData(soundInfo.subtitleUrl, 'json'); const fileName = `${title}.${convertJsonToSrtCheckbox ? 'srt' : 'json'}`; const fileContent = convertJsonToSrtCheckbox ? convertJsonToSrt(jsonData) : JSON.stringify(jsonData, null, 2); zip.file(fileName, fileContent); filesAdded++; log(`✅ Sound ID ${id}: Đã thêm ${fileName} vào ZIP.`); } catch (error) { log(`❌ Sound ID ${id}: Lỗi tải/chuyển đổi JSON từ URL ${soundInfo.subtitleUrl}: ${error}`); } } else { log(`⚠️ Sound ID ${id}: Không có URL phụ đề JSON.`); } break; case 'ass': try { const assContent = await getASSContentForID(id); if (assContent) { zip.file(`${title}.ass`, assContent); filesAdded++; log(`✅ Sound ID ${id}: Đã thêm ${title}.ass vào ZIP.`); } } catch (error) { log(`❌ Sound ID ${id}: Lỗi khi lấy nội dung ASS: ${error}`); } break; case 'audio': if (shouldZipAudio && soundInfo.audioUrl) { try { zip.file(`${title}.${getFileExtension(soundInfo.audioUrl) || 'm4a'}`, await fetchData(soundInfo.audioUrl, 'blob')); filesAdded++; } catch (error) { log(`❌ Sound ID ${id}: Lỗi tải Audio để nén vào ZIP từ URL ${soundInfo.audioUrl}: ${error}`); } } else if(!soundInfo.audioUrl) { log(`⚠️ Sound ID ${id}: Không có URL Audio.`); } break; case 'all-images': if (soundInfo.imageUrl) { try { zip.file(`images/${title}_cover.${getFileExtension(soundInfo.imageUrl) || 'jpg'}`, await fetchData(soundInfo.imageUrl, 'blob')); filesAdded++; } catch (error) { log(`❌ Sound ID ${id}: Lỗi tải ảnh bìa tập từ URL ${soundInfo.imageUrl}: ${error}`); } } else { log(`⚠️ Sound ID ${id}: Không có URL ảnh bìa tập.`); } const additionalImages = await getAdditionalSoundImages(id); for (let j = 0; j < additionalImages.length; j++) { try { zip.file(`images/${title}_extra_${j+1}.${getFileExtension(additionalImages[j]) || 'jpg'}`, await fetchData(additionalImages[j], 'blob')); filesAdded++; } catch (error) { log(`❌ Sound ID ${id}: Lỗi tải ảnh bổ sung từ URL ${additionalImages[j]}: ${error}`); } } break; } await new Promise(r => setTimeout(r, 200)); } if (filesAdded === 0) { log(`⚠️ <span class="warning">Không có file nào được tạo cho drama này.</span>`); GM_notification({ title: 'Tải Drama Hoàn Tất', text: `Không có file nào được tạo cho drama: ${dramaName}.`, timeout: 5000 }); return; } log(`📦 Đang tạo file ZIP (${filesAdded} files)...`); try {
            // THAY ĐỔI: Dùng hàm downloadGeneratedFile
            await downloadGeneratedFile(await zip.generateAsync({ type: "blob" }), `${dramaName}_${type}${convertJsonToSrtCheckbox && type === 'json' ? '_srt' : ''}.zip`);
        } catch (error) { log(`❌ Lỗi tạo hoặc tải file ZIP: ${error}`); } GM_notification({ title: 'Tải Drama Hoàn Tất', text: `Đã hoàn tất tải các file cho drama: ${dramaName}.`, timeout: 5000 }); }
    async function processSingleSoundId(soundId, type) { log(`🎵 <strong>Tải từng tập với Sound ID: ${soundId} (Loại: ${type.toUpperCase()})</strong>`); const soundInfo = await getSoundInfo(soundId); const name = soundInfo.name; const convertJsonToSrtCheckbox = document.getElementById('convertJsonToSrtCheckbox')?.checked ?? false; switch (type) { case 'lrc': const data = await parseDanmaku(soundId); if (!data.length) return log("⚠️ <span class='warning'>Không có phụ đề LRC (Danmaku Mode 4).</span>");
            // THAY ĐỔI: Dùng hàm downloadGeneratedFile
            await downloadGeneratedFile(new Blob([genLRC(data, name)], { type: "text/plain" }), `${name}.lrc`);
            break; case 'json': if (!soundInfo.subtitleUrl) return log("⚠️ <span class='warning'>Không có URL phụ đề JSON.</span>"); try { const jsonData = await fetchData(soundInfo.subtitleUrl, 'json'); const [content, mime, ext] = convertJsonToSrtCheckbox ? [convertJsonToSrt(jsonData), "text/plain", "srt"] : [JSON.stringify(jsonData, null, 2), "application/json", "json"];
            // THAY ĐỔI: Dùng hàm downloadGeneratedFile
            await downloadGeneratedFile(new Blob([content], { type: mime }), `${name}.${ext}`);
        } catch (error) { log(`❌ Lỗi tải hoặc phân tích JSON: ${error}`); } break; case 'ass': try { const assContent = await getASSContentForID(soundId);
            // THAY ĐỔI: Dùng hàm downloadGeneratedFile
            if (assContent) await downloadGeneratedFile(new Blob([assContent], { type: "text/plain" }), `${name}.ass`);
        } catch (error) { log(`❌ Lỗi tải ASS: ${error}`); } break; case 'audio': if (!soundInfo.audioUrl) return log("⚠️ <span class='warning'>Không có URL Audio.</span>"); try {
            // THAY ĐỔI: Dùng hàm downloadDirectUrl
            await downloadDirectUrl(soundInfo.audioUrl, `${name}.${getFileExtension(soundInfo.audioUrl) || 'm4a'}`);
        } catch (error) { log(`❌ Lỗi tải Audio: ${error}`); } break; case 'image': if (!soundInfo.imageUrl) return log("⚠️ <span class'warning'>Không có URL ảnh bìa cho tập này.</span>"); try {
            // THAY ĐỔI: Dùng hàm downloadDirectUrl
            await downloadDirectUrl(soundInfo.imageUrl, `${name}_cover.${getFileExtension(soundInfo.imageUrl) || 'jpg'}`);
        } catch (error) { log(`❌ Lỗi tải Ảnh: ${error}`); } break; case 'all-images': const zip = new JSZip(); let filesAdded = 0; if (soundInfo.imageUrl) { try { zip.file(`${name}_cover.${getFileExtension(soundInfo.imageUrl) || 'jpg'}`, await fetchData(soundInfo.imageUrl, 'blob')); filesAdded++; } catch (error) { log(`❌ Lỗi tải ảnh bìa tập từ URL ${soundInfo.imageUrl}: ${error}`); } } else { log(`⚠️ Không có URL ảnh bìa tập.`); } for (let j = 0, additionalImages = await getAdditionalSoundImages(soundId); j < additionalImages.length; j++) { try { zip.file(`${name}_extra_${j+1}.${getFileExtension(additionalImages[j]) || 'jpg'}`, await fetchData(additionalImages[j], 'blob')); filesAdded++; } catch (error) { log(`❌ Lỗi tải ảnh bổ sung từ URL ${additionalImages[j]}: ${error}`); } } if (filesAdded === 0) { log(`⚠️ <span class="warning">Không có file ảnh nào được tạo cho tập này.</span>`); GM_notification({ title: 'Tải Tập Hoàn Tất', text: `Không có file ảnh nào được tạo cho tập: ${name}.`, timeout: 5000 }); return; } log(`📦 Đang tạo file ZIP (${filesAdded} files)...`); try {
            // THAY ĐỔI: Dùng hàm downloadGeneratedFile
            await downloadGeneratedFile(await zip.generateAsync({ type: "blob" }), `${name}_all_images.zip`);
        } catch (error) { log(`❌ Lỗi tạo hoặc tải file ZIP: ${error}`); } break; } GM_notification({ title: 'Tải Tập Hoàn Tất', text: `Đã hoàn tất tải file cho tập: ${name}.`, timeout: 5000 }); }

    // UI CREATION
    function createUI() {
        document.getElementById('missevanDownloaderCanvas')?.remove();
        document.getElementById('mde-trigger-btn')?.remove();
        document.getElementById('mde-styles')?.remove();

        const style = document.createElement('style');
        style.id = 'mde-styles';
        style.innerHTML = `
            :root {
                --mde-primary: #8DECB4;
                --mde-primary-dark: #65c18c;
                --mde-secondary: #43A047;
                --mde-bg: #FBFFF8;
                --mde-header-bg: #F0F9F0;
                --mde-text: #3d4a3d;
                --mde-text-light: #6a7b6a;
                --mde-border: #DCEAD5;
                --mde-shadow: rgba(101, 193, 140, 0.2);
                --mde-success: #28a745;
                --mde-warning: #ffc107;
                --mde-error: #dc3545;
            }
            #mde-trigger-btn {
                position: fixed;
                bottom: 25px;
                right: 25px;
                width: 60px;
                height: 60px;
                background-color: var(--mde-secondary);
                color: white;
                border-radius: 50%;
                border: 3px solid #fff;
                font-size: 28px;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                box-shadow: 0 5px 20px var(--mde-shadow);
                transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
                z-index: 9998;
            }
            #mde-trigger-btn:hover {
                background-color: #4CAF50;
                transform: translateY(-5px) scale(1.1);
                box-shadow: 0 8px 25px rgba(101, 193, 140, 0.3);
            }
            #missevanDownloaderCanvas {
                position: fixed;
                top: 20px;
                left: 20px;
                width: 360px;
                max-height: calc(100vh - 40px);
                background: var(--mde-bg);
                border-radius: 20px;
                border: 1px solid var(--mde-border);
                box-shadow: 0 10px 40px var(--mde-shadow);
                z-index: 9999;
                display: flex;
                flex-direction: column;
                font-family: 'Segoe UI', 'Roboto', sans-serif;
                color: var(--mde-text);
                opacity: 0;
                transform: translateY(-20px) scale(0.98);
                transition: opacity 0.3s ease, transform 0.3s ease;
                visibility: hidden;
            }
            #missevanDownloaderCanvas.visible {
                opacity: 1;
                transform: translateY(0) scale(1);
                visibility: visible;
            }
            .mde-header {
                padding: 15px 20px;
                border-bottom: 1px solid var(--mde-border);
                display: flex;
                justify-content: space-between;
                align-items: center;
                cursor: move;
                background-color: var(--mde-header-bg);
                background-image: radial-gradient(var(--mde-border) 0.5px, transparent 0.5px);
                background-size: 8px 8px;
                border-top-left-radius: 20px;
                border-top-right-radius: 20px;
            }
            .mde-header h3 {
                margin: 0;
                font-size: 20px;
                font-weight: 700;
                color: var(--mde-secondary);
            }
            .mde-header-controls button { background: none; border: none; font-size: 16px; cursor: pointer; color: #aaa; padding: 5px; line-height: 1; transition: color 0.2s; }
            .mde-header-controls button:hover { color: var(--mde-text); }
            .mde-content { padding: 20px; overflow-y: auto; flex-grow: 1; display: flex; flex-direction: column; gap: 18px; }
            .mde-section { border: 1px solid var(--mde-border); border-radius: 12px; background: #fff; }
            .mde-section-header { font-weight: 600; padding: 12px 18px; color: var(--mde-secondary); }
            .mde-section-content { padding: 0 18px 18px; display: flex; flex-direction: column; gap: 10px; }
            .mde-btn {
                padding: 12px 15px; border: 1px solid var(--mde-border); border-radius: 8px; cursor: pointer; font-size: 14px;
                font-weight: 500; text-align: left; width: 100%; transition: all 0.2s ease;
                display: flex; align-items: center; gap: 12px; background-color: #f8fcf8; color: var(--mde-text);
            }
            .mde-btn .icon { font-size: 18px; color: var(--mde-primary-dark); }
            .mde-btn:hover { border-color: var(--mde-primary); background-color: #F0F9F0; transform: translateY(-2px); box-shadow: 0 2px 8px var(--mde-shadow); }
            .mde-btn.primary { background-color: var(--mde-primary); color: #fff; border-color: var(--mde-primary); }
            .mde-btn.primary:hover { background-color: var(--mde-primary-dark); border-color: var(--mde-primary-dark); }
            .mde-btn.primary .icon { color: #fff; }

            .mde-checkbox { display: flex; align-items: center; cursor: pointer; padding: 5px; }
            .mde-checkbox input { display: none; }
            .mde-checkbox .checkmark { width: 20px; height: 20px; border: 2px solid #ccc; border-radius: 6px; margin-right: 12px; transition: all 0.2s; position: relative; }
            .mde-checkbox input:checked + .checkmark { background-color: var(--mde-secondary); border-color: var(--mde-secondary); }
            .mde-checkbox .checkmark:after { content: '✔'; position: absolute; display: none; color: white; font-size: 14px; left: 50%; top: 50%; transform: translate(-50%, -50%); }
            .mde-checkbox input:checked + .checkmark:after { display: block; }
            .mde-checkbox span { font-size: 14px; }

            #mde-log-output { background: #f8f8f8; border-top: 1px solid var(--mde-border); max-height: 150px; overflow-y: auto; padding: 12px; font-size: 12px; color: var(--mde-text-light); line-height: 1.6; border-bottom-left-radius: 20px; border-bottom-right-radius: 20px; }
            #mde-log-output p { margin: 0 0 5px; }
            #mde-log-output .error { color: var(--mde-error); }
            #mde-log-output .success { color: var(--mde-success); }
            #mde-log-output .warning { color: var(--mde-warning); font-weight: bold; }
        `;
        document.head.appendChild(style);

        const panel = document.createElement("div");
        panel.id = "missevanDownloaderCanvas";
        const dramaId = getDramaIdFromURL(), soundId = getSoundIdFromURL(), homepage = isHomepage();
        let sectionsVisible = !!dramaId + !!soundId + !!homepage;

        panel.innerHTML = `
            <div class="mde-header">
                <h3>🐸 Missevan Downloader</h3>
                <div class="mde-header-controls">
                    <button id="mde-close-btn" title="Đóng">✖</button>
                </div>
            </div>
            <div class="mde-content">
                <div class="mde-section">
                    <div class="mde-section-header">⚙️ Cài đặt chung</div>
                    <div class="mde-section-content">
                        <label class="mde-checkbox"><input type="checkbox" id="zipAudioCheckbox"><span class="checkmark"></span><span>Nén Audio Drama vào ZIP?</span></label>
                        <label class="mde-checkbox"><input type="checkbox" id="convertJsonToSrtCheckbox" checked><span class="checkmark"></span><span>Chuyển JSON Subtitle sang SRT?</span></label>
                    </div>
                </div>

                <div id="homepageDownloaderContainer" class="mde-section" style="display: ${homepage ? 'block' : 'none'}">
                    <div class="mde-section-header">🌿 Tải từ Trang chủ</div>
                    <div class="mde-section-content">
                        <button id="downloadHomepageImagesBtn" class="mde-btn primary"><span class="icon">🖼️</span> Tải tất cả ảnh trang chủ (ZIP)</button>
                    </div>
                </div>

                <div id="dramaDownloaderContainer" class="mde-section" style="display: ${dramaId ? 'block' : 'none'}">
                    <div class="mde-section-header">🍀 Tải toàn bộ</div>
                    <div class="mde-section-content">
                        <button id="downloadDramaAudioBtn" class="mde-btn"><span class="icon">🎧</span> Toàn bộ Audio</button>
                        <button id="downloadDramaJsonBtn" class="mde-btn"><span class="icon">📄</span> Phụ đề khung</button>
                        <button id="downloadDramaLrcBtn" class="mde-btn"><span class="icon">💬</span> Phụ đề LRC</button>
                        <button id="downloadDramaAssBtn" class="mde-btn"><span class="icon">📝</span> Phụ đề ASS</button>
                        <button id="downloadDramaAllImagesBtn" class="mde-btn"><span class="icon">🎀</span> Tất cả ảnh (Bìa + Tập)</button>
                    </div>
                </div>

                <div id="soundDownloaderContainer" class="mde-section" style="display: ${soundId ? 'block' : 'none'}">
                    <div class="mde-section-header">🍃 Tải từng tập</div>
                    <div class="mde-section-content">
                        <button id="downloadSoundAudioBtn" class="mde-btn"><span class="icon">🔊</span> Audio tập này</button>
                        <button id="downloadSoundJsonBtn" class="mde-btn"><span class="icon">📄</span> Phụ đề khung</button>
                        <button id="downloadSoundLrcBtn" class="mde-btn"><span class="icon">💬</span> Phụ đề LRC</button>
                        <button id="downloadSoundAssBtn" class="mde-btn"><span class="icon">📝</span> Phụ đề ASS</button>
                        <button id="downloadSoundAllImagesBtn" class="mde-btn"><span class="icon">✨</span> Tất cả ảnh của tập</button>
                    </div>
                </div>
                 ${sectionsVisible === 0 ? '<p style="text-align: center; color: #999;">Không tìm thấy ID hợp lệ trên trang này.</p>' : ''}
            </div>
            <div id="mde-log-output"><p>Sẵn sàng tải!</p></div>
        `;
        document.body.appendChild(panel);

        const triggerBtn = document.createElement("button");
        triggerBtn.id = "mde-trigger-btn";
        triggerBtn.innerHTML = "🐸";
        document.body.appendChild(triggerBtn);

        triggerBtn.addEventListener('click', () => panel.classList.toggle('visible'));
        panel.querySelector('#mde-close-btn').addEventListener('click', () => panel.classList.remove('visible'));

        const header = panel.querySelector('.mde-header');
        let isDragging = false, offsetX, offsetY;
        header.addEventListener('mousedown', (e) => { isDragging = true; offsetX = e.clientX - panel.offsetLeft; offsetY = e.clientY - panel.offsetTop; panel.style.transition = 'none'; });
        document.addEventListener('mousemove', (e) => { if (isDragging) { panel.style.left = `${e.clientX - offsetX}px`; panel.style.top = `${e.clientY - offsetY}px`; } });
        document.addEventListener('mouseup', () => { isDragging = false; panel.style.transition = 'opacity 0.3s ease, transform 0.3s ease'; });

        if (homepage) { panel.querySelector('#downloadHomepageImagesBtn').addEventListener('click', processHomepage); }
        if (dramaId) { panel.querySelector('#downloadDramaLrcBtn').addEventListener('click', () => processDramaId(dramaId, 'lrc')); panel.querySelector('#downloadDramaJsonBtn').addEventListener('click', () => processDramaId(dramaId, 'json')); panel.querySelector('#downloadDramaAssBtn').addEventListener('click', () => processDramaId(dramaId, 'ass')); panel.querySelector('#downloadDramaAudioBtn').addEventListener('click', () => processDramaId(dramaId, 'audio')); panel.querySelector('#downloadDramaAllImagesBtn').addEventListener('click', () => processDramaId(dramaId, 'all-images')); }
        if (soundId) { panel.querySelector('#downloadSoundLrcBtn').addEventListener('click', () => processSingleSoundId(soundId, 'lrc')); panel.querySelector('#downloadSoundJsonBtn').addEventListener('click', () => processSingleSoundId(soundId, 'json')); panel.querySelector('#downloadSoundAssBtn').addEventListener('click', () => processSingleSoundId(soundId, 'ass')); panel.querySelector('#downloadSoundAudioBtn').addEventListener('click', () => processSingleSoundId(soundId, 'audio')); panel.querySelector('#downloadSoundAllImagesBtn').addEventListener('click', () => processSingleSoundId(soundId, 'all-images')); }
    }

    window.addEventListener('load', createUI);
    let lastUrl = location.href;
    const urlCheckInterval = setInterval(() => { if (lastUrl !== location.href) { lastUrl = location.href; createUI(); } }, 500);
    window.addEventListener('beforeunload', () => clearInterval(urlCheckInterval));
})();

