// ==UserScript==
// @name         Missevan Downloader with SRT Converter (Auto SRT) - Pink Cute Kitty Edition
// @namespace    http://tampermonkey.net/
// @version      2.4 // Tăng version để đánh dấu phiên bản Kitty
// @description  Tự động tải phụ đề Missevan (.lrc và .json), Audio (.m4a) và Ảnh bìa (.jpg/.png), hỗ trợ từng tập hoặc toàn bộ drama. Mặc định tải audio không nén (tùy chọn nén). Tự động chuyển JSON sang SRT khi tải phụ đề JSON. Có thể tải thêm các ảnh phụ liên quan đến sound/drama. Đã sửa đổi để ưu tiên tải ảnh bìa tập chất lượng cao (covers). Giao diện màu hồng dễ thương với chủ đề mèo Kitty.
// @author       MeowMeow
// @match        *://www.missevan.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @connect      missevan.com
// @require      https://cdnjs.cloudflare.com/ajax/libs/jszip/3.7.1/jszip.min.js
// ==/UserScript==

(function () {
    'use strict';

    const DRAMA_INFO_URL = "https://www.missevan.com/dramaapi/getdrama";
    const SOUND_GET_URL = "https://www.missevan.com/sound/getsound";
    const DANMAKU_GET_URL = "https://www.missevan.com/sound/getdm";
    const SOUND_IMAGES_URL = "https://www.missevan.com/sound/getimages";

    const UI_STATE_KEY = 'missevanDownloaderUIState'; // Key for localStorage

    function getURLParam(key) {
        const url = new URL(window.location.href);
        return url.searchParams.get(key);
    }

    function getDramaIdFromURL() {
        const match = location.pathname.match(/\/mdrama\/(\d+)/);
        return match ? match[1] : null;
    }

    function getSoundIdFromURL() {
        return getURLParam("id");
    }

    function log(msg) {
        const logBox = document.getElementById('logOutput');
        if (!logBox) return;
        const p = document.createElement('p');
        p.textContent = msg;
        logBox.appendChild(p);
        logBox.scrollTop = logBox.scrollHeight;
    }

    function fetchData(url, type = 'json') {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: "GET",
                url,
                responseType: type,
                onload: res => {
                    if (res.status === 200) {
                        resolve(res.response);
                    } else {
                        reject(`Request failed with status: ${res.status} for URL: ${url}`);
                    }
                },
                onerror: err => reject(`Network error: ${err} for URL: ${url}`)
            });
        });
    }

    /**
     * Lấy thông tin Sound ID, bao gồm tên, URL phụ đề, URL audio, URL ảnh bìa.
     * @param {string} id - Sound ID.
     * @returns {Promise<{name: string, subtitleUrl: string|null, audioUrl: string|null, imageUrl: string|null}>}
     */
    async function getSoundInfo(id) {
        const url = `${SOUND_GET_URL}?soundid=${id}`;
        try {
            const data = await fetchData(url);
            const name = data?.info?.sound?.soundstr || `sound_${id}`;
            const cleanedName = name.replace(/[/\\:*?"<>|]/g, "");
            const subtitleUrl = data?.info?.sound?.subtitle_url || null;

            let audioUrl = null;
            if (data?.info?.sound?.soundurl) {
                if (typeof data.info.sound.soundurl === 'string') {
                    audioUrl = data.info.sound.soundurl;
                } else if (Array.isArray(data.info.sound.soundurl) && data.info.sound.soundurl.length > 0) {
                    audioUrl = data.info.sound.soundurl[0]?.url || null;
                } else if (typeof data.info.sound.soundurl === 'object' && data.info.sound.soundurl !== null) {
                    audioUrl = data.info.sound.soundurl.url || data.info.sound.soundurl.url_1 || null;
                }
            }

            // Lấy URL ảnh bìa ban đầu, ưu tiên 'covers' nếu là mảng, sau đó đến 'front_cover'
            let imageUrl = data?.info?.sound?.covers?.[0] || data?.info?.sound?.front_cover || null;

            // *** THÊM LOGIC CHUYỂN ĐỔI coversmini SANG covers Ở ĐÂY ***
            if (imageUrl && imageUrl.includes('/coversmini/')) {
                imageUrl = imageUrl.replace('/coversmini/', '/covers/');
                log(`Đã chuyển đổi URL ảnh (coversmini -> covers): ${imageUrl}`); // Ghi log để bạn thấy sự thay đổi
            }

            return { name: cleanedName, subtitleUrl: subtitleUrl, audioUrl: audioUrl, imageUrl: imageUrl };
        } catch (error) {
            log(`❌ Lỗi lấy thông tin Sound ID ${id}: ${error}`);
            return { name: `sound_${id}`, subtitleUrl: null, audioUrl: null, imageUrl: null };
        }
    }

    /**
     * Lấy thông tin Drama ID, bao gồm tên, các Sound ID và URL ảnh bìa drama.
     * @param {string} dramaId - Drama ID.
     * @returns {Promise<{name: string, ids: string[], imageUrl: string|null}>}
     */
    async function getDramaDetails(dramaId) {
        const url = `${DRAMA_INFO_URL}?drama_id=${dramaId}`;
        try {
            const res = await fetchData(url);
            const name = res?.info?.drama?.name?.replace(/[/\\:*?"<>|]/g, "") || `drama_${dramaId}`;
            const imageUrl = res?.info?.drama?.cover || null; // Ảnh bìa của Drama
            const ids = new Set();
            for (const type of ['ft', 'music', 'episode']) {
                res?.info?.episodes?.[type]?.forEach(e => e.sound_id && ids.add(e.sound_id));
            }
            return { name, ids: Array.from(ids), imageUrl: imageUrl };
        } catch (error) {
            log(`❌ Lỗi lấy thông tin Drama ID ${dramaId}: ${error}`);
            return { name: `drama_${dramaId}`, ids: [], imageUrl: null };
        }
    }

    /**
     * Lấy danh sách URL ảnh bổ sung cho một Sound ID.
     * Dựa trên cấu trúc `getimages.htm` bạn cung cấp.
     * @param {string} soundId - Sound ID.
     * @returns {Promise<string[]>} Mảng các URL ảnh.
     */
    async function getAdditionalSoundImages(soundId) {
        const url = `${SOUND_IMAGES_URL}?soundid=${soundId}`;
        try {
            const data = await fetchData(url);
            // Kiểm tra cấu trúc phản hồi của getimages.htm
            if (data?.successVal?.images && Array.isArray(data.successVal.images)) {
                // Áp dụng chuyển đổi coversmini -> covers cho ảnh bổ sung nếu cần
                return data.successVal.images.map(imgArray => {
                    let imgUrl = imgArray[0];
                    if (imgUrl && imgUrl.includes('/coversmini/')) {
                        imgUrl = imgUrl.replace('/coversmini/', '/covers/');
                        // log(`Đã chuyển đổi URL ảnh bổ sung (coversmini -> covers): ${imgUrl}`); // Có thể gây nhiều log nếu có nhiều ảnh
                    }
                    return imgUrl;
                }).filter(Boolean); // Lọc bỏ các giá trị null/undefined sau khi chuyển đổi
            }
            return [];
        } catch (error) {
            log(`❌ Lỗi lấy ảnh bổ sung cho Sound ID ${soundId}: ${error}`);
            return [];
        }
    }


    async function parseDanmaku(id) {
        const url = `${DANMAKU_GET_URL}?soundid=${id}`;
        try {
            const xmlText = await fetchData(url, 'text');
            const xml = new DOMParser().parseFromString(xmlText, "text/xml");
            const danmakus = Array.from(xml.querySelectorAll("d"));
            const list = {};
            danmakus.forEach(d => {
                const p = d.getAttribute("p");
                if (!p) return;
                const [stime, mode,, ,,, ,dmid] = p.split(",");
                if (mode === "4") list[dmid] = { stime, text: d.textContent };
            });
            return Object.entries(list).sort(([, a], [, b]) => parseFloat(a.stime) - parseFloat(b.stime));
        } catch (error) {
            log(`❌ Lỗi phân tích Danmaku cho Sound ID ${id}: ${error}`);
            return [];
        }
    }

    function genLRC(data, title) {
        let out = `[ver:v1.0]\n[nickname:MeowMeow]\n[ti:${title}]`; // Changed nickname
        let prev = "";
        for (const [, d] of data) {
            if (prev === d.stime) {
                out += " " + d.text;
                continue;
            }
            prev = d.stime;
            const [s, ms = "00"] = d.stime.split(".");
            const sec = parseInt(s);
            out += `\n[${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}.${ms.slice(0, 2)}]${d.text}`;
        }
        return out;
    }

    // Helper function to get file extension from URL
    function getFileExtension(url) {
        try {
            const urlObj = new URL(url);
            const pathname = urlObj.pathname;
            const parts = pathname.split('.');
            if (parts.length > 1) {
                return parts.pop().split('?')[0].toLowerCase();
            }
        } catch (e) {
            // Invalid URL, fallback to default
        }
        return ''; // Default empty if no extension found
    }

    /**
     * Chuyển đổi dữ liệu JSON phụ đề sang định dạng SRT.
     * @param {Array<Object>} jsonData - Mảng các đối tượng phụ đề JSON.
     * @returns {string} Chuỗi SRT đã định dạng.
     */
    function convertJsonToSrt(jsonData) {
        const subtitles = [];
        let srtIndex = 1;

        const formatTime = ms => {
            const date = new Date(ms);
            const hh = String(date.getUTCHours()).padStart(2, '0');
            const mm = String(date.getUTCMinutes()).padStart(2, '0');
            const ss = String(date.getUTCSeconds()).padStart(2, '0');
            const msPart = String(date.getUTCMilliseconds()).padStart(3, '0');
            return `${hh}:${mm}:${ss},${msPart}`;
        };

        jsonData.forEach(entry => {
            const startMs = entry.start_time || 0;
            const endMs = entry.end_time || 0;
            const role = entry.role || '';
            let content = entry.content || '';
            const color = entry.color ?? 16777215; // Mặc định trắng
            const italic = entry.italic || false;
            const underline = entry.underline || false;

            let line = role ? `${role}: ${content}` : content;

            // Áp dụng định dạng HTML cho SRT
            if (color !== 16777215) {
                const hex = `#${color.toString(16).padStart(6, '0')}`;
                line = `<font color="${hex}">${line}</font>`;
            }
            if (italic) line = `<i>${line}</i>`;
            if (underline) line = `<u>${line}</u>`;

            const start = formatTime(startMs);
            const end = formatTime(endMs);

            subtitles.push(`${srtIndex++}\n${start} --> ${end}\n${line}\n`);
        });

        return subtitles.join('\n');
    }

    async function processDramaId(dramaId, type = 'lrc') {
        log(`📥 Đang xử lý drama ID: ${dramaId} (Loại: ${type.toUpperCase()})`);
        const { name: dramaName, ids, imageUrl: dramaCoverUrl } = await getDramaDetails(dramaId);

        if (ids.length === 0 && type !== 'image' && type !== 'all-images') {
            log(`⚠️ Không tìm thấy Sound ID nào cho drama ${dramaId}.`);
        }

        const shouldZipAudio = document.getElementById('zipAudioCheckbox')?.checked ?? false;
        const convertJsonToSrtCheckbox = document.getElementById('convertJsonToSrtCheckbox')?.checked ?? false;
        log(`Trạng thái 'Chuyển JSON sang SRT': ${convertJsonToSrtCheckbox ? 'ĐÃ TÍCH' : 'CHƯA TÍCH'}`); // Debug log

        const zip = new JSZip();
        let filesAdded = 0;

        // Special handling for 'audio' type when not zipping
        if (type === 'audio' && !shouldZipAudio) {
            log(`📦 Đang tải từng file audio cho drama ${dramaName} (không nén)...`);
            for (let i = 0; i < ids.length; i++) {
                const id = ids[i];
                log(`(${i + 1}/${ids.length}) Đang chuẩn bị tải audio Sound ID ${id}...`);
                const soundInfo = await getSoundInfo(id);
                const title = soundInfo.name;
                const audioUrl = soundInfo.audioUrl;

                if (audioUrl) {
                    const extension = getFileExtension(audioUrl) || 'm4a';
                    try {
                        await new Promise((resolve, reject) => {
                             GM_download({
                                url: audioUrl,
                                name: `${dramaName}/${title}.${extension}`,
                                saveAs: false,
                                onload: () => {
                                    log(`✅ Đã tải ${title}.${extension}`);
                                    resolve();
                                },
                                onerror: e => {
                                    log(`❌ Lỗi tải Audio ${title}.${extension}: ${e.error || e.message || e}`);
                                    reject(e);
                                }
                            });
                        });
                        filesAdded++;
                    } catch (error) {
                        // Error already logged by GM_download's onerror
                    }
                } else {
                    log(`⚠️ Sound ID ${id}: Không có URL Audio.`);
                }
            }
            log(`✅ Hoàn tất tải ${filesAdded} file audio cho drama ${dramaName}.`);
            return;
        }

        // --- Handle Image downloads for Drama ---
        if (type === 'image' || type === 'all-images') {
            if (dramaCoverUrl) {
                try {
                    const imgBlob = await fetchData(dramaCoverUrl, 'blob');
                    const extension = getFileExtension(dramaCoverUrl) || 'jpg';
                    zip.file(`${dramaName}_cover.${extension}`, imgBlob);
                    filesAdded++;
                    log(`✅ Đã thêm ảnh bìa drama vào ZIP.`);
                } catch (error) {
                    log(`❌ Lỗi tải ảnh bìa drama từ URL ${dramaCoverUrl}: ${error}`);
                }
            } else {
                log(`⚠️ Không có URL ảnh bìa chính cho Drama ${dramaId}.`);
            }
        }

        // Iterate through Sound IDs for other types (LRC, JSON, Audio for ZIP, and additional images)
        for (let i = 0; i < ids.length; i++) {
            const id = ids[i];
            log(`(${i + 1}/${ids.length}) Xử lý Sound ID ${id}`);

            const soundInfo = await getSoundInfo(id);
            const title = soundInfo.name;

            if (type === 'lrc') {
                const data = await parseDanmaku(id);
                if (data.length) {
                    const lrc = genLRC(data, title);
                    zip.file(`${title}.lrc`, lrc);
                    filesAdded++;
                } else {
                    log(`⚠️ Sound ID ${id}: Không có dữ liệu Danmaku để tạo LRC.`);
                }
            } else if (type === 'json') {
                const subtitleUrl = soundInfo.subtitleUrl;
                if (subtitleUrl) {
                    try {
                        const jsonData = await fetchData(subtitleUrl, 'json');
                        if (convertJsonToSrtCheckbox) {
                            const srtData = convertJsonToSrt(jsonData);
                            zip.file(`${title}.srt`, srtData);
                            filesAdded++;
                            log(`✅ Sound ID ${id}: Đã chuyển đổi và thêm ${title}.srt vào ZIP.`);
                        } else {
                            zip.file(`${title}.json`, JSON.stringify(jsonData, null, 2));
                            filesAdded++;
                            log(`✅ Sound ID ${id}: Đã thêm ${title}.json vào ZIP.`);
                        }
                    } catch (error) {
                        log(`❌ Sound ID ${id}: Lỗi tải/chuyển đổi JSON từ URL ${subtitleUrl}: ${error}`);
                    }
                } else {
                    log(`⚠️ Sound ID ${id}: Không có URL phụ đề JSON.`);
                }
            } else if (type === 'audio' && shouldZipAudio) {
                const audioUrl = soundInfo.audioUrl;
                if (audioUrl) {
                    try {
                        const audioBlob = await fetchData(audioUrl, 'blob');
                        const extension = getFileExtension(audioUrl) || 'm4a';
                        zip.file(`${title}.${extension}`, audioBlob);
                        filesAdded++;
                    } catch (error) {
                        log(`❌ Sound ID ${id}: Lỗi tải Audio để nén vào ZIP từ URL ${audioUrl}: ${error}`);
                    }
                } else {
                    log(`⚠️ Sound ID ${id}: Không có URL Audio.`);
                }
            } else if (type === 'all-images') {
                if (soundInfo.imageUrl) {
                     try {
                        const imgBlob = await fetchData(soundInfo.imageUrl, 'blob');
                        const extension = getFileExtension(soundInfo.imageUrl) || 'jpg';
                        zip.file(`images/${title}_cover.${extension}`, imgBlob);
                        filesAdded++;
                    } catch (error) {
                        log(`❌ Sound ID ${id}: Lỗi tải ảnh bìa tập từ URL ${soundInfo.imageUrl}: ${error}`);
                    }
                } else {
                    log(`⚠️ Sound ID ${id}: Không có URL ảnh bìa tập.`);
                }

                const additionalImages = await getAdditionalSoundImages(id);
                for (let j = 0; j < additionalImages.length; j++) {
                    const imgUrl = additionalImages[j];
                    try {
                        const imgBlob = await fetchData(imgUrl, 'blob');
                        const extension = getFileExtension(imgUrl) || 'jpg';
                        zip.file(`images/${title}_extra_${j+1}.${extension}`, imgBlob);
                        filesAdded++;
                    } catch (error) {
                        log(`❌ Sound ID ${id}: Lỗi tải ảnh bổ sung từ URL ${imgUrl}: ${error}`);
                    }
                }
            }
        }

        if (filesAdded === 0) {
            log(`⚠️ Không có file nào được tạo cho drama này.`);
            return;
        }

        log(`📦 Đang tạo file ZIP (${filesAdded} files)...`);
        const zipFileName = `${dramaName}_${type}${convertJsonToSrtCheckbox && type === 'json' ? '_srt' : ''}.zip`;
        const blob = await zip.generateAsync({ type: "blob" });
        GM_download({
            url: URL.createObjectURL(blob),
            name: zipFileName,
            saveAs: false,
            onload: () => log(`✅ Đã tải ${zipFileName}`),
            onerror: e => log(`❌ Lỗi tải ZIP: ${e.error || e.message || e}`)
        });
    }

    async function processSingleSoundId(soundId, type = 'lrc') {
        log(`🎵 Tải từng tập với Sound ID: ${soundId} (Loại: ${type.toUpperCase()})`);

        const soundInfo = await getSoundInfo(soundId);
        const name = soundInfo.name;
        const convertJsonToSrtCheckbox = document.getElementById('convertJsonToSrtCheckbox')?.checked ?? false;
        log(`Trạng thái 'Chuyển JSON sang SRT': ${convertJsonToSrtCheckbox ? 'ĐÃ TÍCH' : 'CHƯA TÍCH'}`); // Debug log


        if (type === 'lrc') {
            const data = await parseDanmaku(soundId);
            if (!data.length) {
                return log("⚠️ Không có phụ đề LRC (Danmaku).");
            }
            const lrc = genLRC(data, name);
            const blob = new Blob([lrc], { type: "text/plain" });
            GM_download({
                url: URL.createObjectURL(blob),
                name: `${name}.lrc`,
                saveAs: false,
                onload: () => log(`✅ Đã tải ${name}.lrc`),
                onerror: e => log(`❌ Lỗi tải LRC: ${e.error || e.message || e}`)
            });
        } else if (type === 'json') {
            const subtitleUrl = soundInfo.subtitleUrl;
            if (!subtitleUrl) {
                return log("⚠️ Không có URL phụ đề JSON.");
            }
            try {
                const jsonData = await fetchData(subtitleUrl, 'json');
                if (convertJsonToSrtCheckbox) {
                    const srtData = convertJsonToSrt(jsonData);
                    const blob = new Blob([srtData], { type: "text/plain" });
                    GM_download({
                        url: URL.createObjectURL(blob),
                        name: `${name}.srt`,
                        saveAs: false,
                        onload: () => log(`✅ Đã tải ${name}.srt (đã chuyển từ JSON)`),
                        onerror: e => log(`❌ Lỗi tải SRT (từ JSON): ${e.error || e.message || e}`)
                    });
                } else {
                    const jsonString = JSON.stringify(jsonData, null, 2);
                    const blob = new Blob([jsonString], { type: "application/json" });
                    GM_download({
                        url: URL.createObjectURL(blob),
                        name: `${name}.json`,
                        saveAs: false,
                        onload: () => log(`✅ Đã tải ${name}.json`),
                        onerror: e => log(`❌ Lỗi tải JSON: ${e.error || e.message || e}`)
                    });
                }
            } catch (error) {
                log(`❌ Lỗi tải hoặc phân tích JSON: ${error}`);
            }
        } else if (type === 'audio') {
            const audioUrl = soundInfo.audioUrl;
            if (!audioUrl) {
                return log("⚠️ Không có URL Audio.");
            }
            try {
                log(`Tải audio từ: ${audioUrl}`);
                const extension = getFileExtension(audioUrl) || 'm4a';
                GM_download({
                    url: audioUrl,
                    name: `${name}.${extension}`,
                    saveAs: false,
                    onload: () => log(`✅ Đã tải ${name}.${extension}`),
                    onerror: e => log(`❌ Lỗi tải Audio: ${e.error || e.message || e}`)
                });
            } catch (error) {
                log(`❌ Lỗi tải Audio: ${error}`);
            }
        } else if (type === 'image') {
            const imageUrl = soundInfo.imageUrl;
            if (!imageUrl) {
                return log("⚠️ Không có URL ảnh bìa cho tập này.");
            }
            try {
                log(`Tải ảnh bìa tập từ: ${imageUrl}`);
                const extension = getFileExtension(imageUrl) || 'jpg';
                GM_download({
                    url: imageUrl,
                    name: `${name}_cover.${extension}`,
                    saveAs: false,
                    onload: () => log(`✅ Đã tải ${name}_cover.${extension}`),
                    onerror: e => log(`❌ Lỗi tải Ảnh: ${e.error || e.message || e}`)
                });
            } catch (error) {
                log(`❌ Lỗi tải Ảnh: ${error}`);
            }
        } else if (type === 'all-images') {
            const zip = new JSZip();
            let filesAdded = 0;

            if (soundInfo.imageUrl) {
                try {
                    const imgBlob = await fetchData(soundInfo.imageUrl, 'blob');
                    const extension = getFileExtension(soundInfo.imageUrl) || 'jpg';
                    zip.file(`${name}_cover.${extension}`, imgBlob);
                    filesAdded++;
                    log(`✅ Đã thêm ảnh bìa tập vào ZIP.`);
                } catch (error) {
                    log(`❌ Lỗi tải ảnh bìa tập từ URL ${soundInfo.imageUrl}: ${error}`);
                }
            } else {
                log(`⚠️ Không có URL ảnh bìa tập.`);
            }

            const additionalImages = await getAdditionalSoundImages(soundId);
            for (let j = 0; j < additionalImages.length; j++) {
                const imgUrl = additionalImages[j];
                try {
                    const imgBlob = await fetchData(imgUrl, 'blob');
                    const extension = getFileExtension(imgUrl) || 'jpg';
                    zip.file(`${name}_extra_${j+1}.${extension}`, imgBlob);
                    filesAdded++;
                } catch (error) {
                    log(`❌ Lỗi tải ảnh bổ sung từ URL ${imgUrl}: ${error}`);
                }
            }

            if (filesAdded === 0) {
                log(`⚠️ Không có file ảnh nào được tạo cho tập này.`);
                return;
            }

            log(`📦 Đang tạo file ZIP (${filesAdded} files)...`);
            const zipFileName = `${name}_all_images.zip`;
            const blob = await zip.generateAsync({ type: "blob" });
            GM_download({
                url: URL.createObjectURL(blob),
                name: zipFileName,
                saveAs: false,
                onload: () => log(`✅ Đã tải ${zipFileName}`),
                onerror: e => log(`❌ Lỗi tải ZIP: ${e.error || e.message || e}`)
            });
        }
    }


    function createUI() {
        // Remove existing UI if any (for script updates)
        const existingBox = document.getElementById('missevanSubtitleTool');
        if (existingBox) {
            existingBox.remove();
        }

        const box = document.createElement("div");
        box.id = "missevanSubtitleTool";
        box.style = `
            position: fixed;
            top: 10px;
            right: 10px;
            background: #ffe6f2; /* Light pink background */
            border: 1px solid #ffccdd; /* Pink border */
            padding: 10px;
            z-index: 10000;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            font-size: 13px;
            width: 280px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            border-radius: 8px;
            display: flex;
            flex-direction: column;
            gap: 10px;
            max-height: 95vh;
            overflow-y: auto;
            resize: both; /* Cho phép người dùng resize */
            min-width: 250px;
            min-height: 200px;
        `;
        const uiState = localStorage.getItem(UI_STATE_KEY);
        let isUIHidden = false;
        if (uiState === 'hidden') {
            isUIHidden = true;
            box.style.width = 'fit-content';
            box.style.height = 'fit-content';
            box.style.overflow = 'hidden';
            box.style.padding = '5px';
        }

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
                        <label for="zipAudioCheckbox" style="font-size: 12px; color: #884a6c; cursor: pointer;">
                            Nén Audio Drama vào ZIP?
                        </label>
                        <p style="font-size: 10px; color: #a1648a; margin: 3px 0 0 20px;">
                            (Bỏ chọn để tải từng file audio cho Drama)
                        </p>
                    </div>
                    <div>
                        <input type="checkbox" id="convertJsonToSrtCheckbox" checked style="margin-right: 5px; transform: scale(1.1);">
                        <label for="convertJsonToSrtCheckbox" style="font-size: 12px; color: #884a6c; cursor: pointer;">
                            Chuyển JSON Subtitle sang SRT?
                        </label>
                    </div>
                </div>

                <div style="display: flex; flex-direction: column; gap: 7px;">
                    <strong style="color: #c06c84; display: flex; align-items: center; gap: 5px;">
                        <span style="font-size: 16px;">🐾</span> Tải TOÀN BỘ Drama (ZIP):
                    </strong>
                    <button id="downloadDramaLrcBtn" class="btn drama-btn pink-1">
                        <span class="icon">💬</span> Phụ đề LRC
                    </button>
                    <button id="downloadDramaJsonBtn" class="btn drama-btn pink-2">
                        <span class="icon">📄</span> Phụ đề JSON / SRT
                    </button>
                    <button id="downloadDramaAudioBtn" class="btn drama-btn pink-3">
                        <span class="icon">🎧</span> Toàn bộ Audio
                    </button>
                    <button id="downloadDramaImageBtn" class="btn drama-btn pink-4">
                        <span class="icon">🖼️</span> Ảnh bìa Drama
                    </button>
                    <button id="downloadDramaAllImagesBtn" class="btn drama-btn pink-5">
                        <span class="icon">🎀</span> Tất cả ảnh Drama
                    </button>
                </div>

                <div style="display: flex; flex-direction: column; gap: 7px; border-top: 1px solid #ffadd1; padding-top: 10px;">
                    <strong style="color: #a87ea8; display: flex; align-items: center; gap: 5px;">
                        <span style="font-size: 16px;">🐱</span> Tải TỪNG Tập (Sound ID):
                    </strong>
                    <button id="downloadSoundLrcBtn" class="btn sound-btn purple-1">
                        <span class="icon">💬</span> Phụ đề LRC
                    </button>
                    <button id="downloadSoundJsonBtn" class="btn sound-btn purple-2">
                        <span class="icon">📄</span> Phụ đề JSON / SRT
                    </button>
                    <button id="downloadSoundAudioBtn" class="btn sound-btn purple-3">
                        <span class="icon">🔊</span> Audio tập
                    </button>
                    <button id="downloadSoundImageBtn" class="btn sound-btn purple-4">
                        <span class="icon">🖼️</span> Ảnh bìa tập
                    </button>
                    <button id="downloadSoundAllImagesBtn" class="btn sound-btn purple-5">
                        <span class="icon">✨</span> Tất cả ảnh tập
                    </button>
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
            #missevanSubtitleTool .btn {
                color: white;
                padding: 8px 12px;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 12px;
                width: 100%;
                text-align: center;
                transition: background-color 0.2s ease, transform 0.1s ease, box-shadow 0.2s ease;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
            }
            #missevanSubtitleTool .btn .icon {
                font-size: 14px;
            }
            #missevanSubtitleTool .btn:hover {
                transform: translateY(-1px);
                box-shadow: 0 2px 5px rgba(0,0,0,0.1);
            }
            #missevanSubtitleTool .btn:active {
                transform: translateY(0);
                box-shadow: none;
            }

            /* Drama Buttons - Pink shades */
            .drama-btn.pink-1 { background-color: #ff85a2; }
            .drama-btn.pink-1:hover { background-color: #ff6a8e; }
            .drama-btn.pink-2 { background-color: #ff99bb; }
            .drama-btn.pink-2:hover { background-color: #ff7faa; }
            .drama-btn.pink-3 { background-color: #ffb3cc; }
            .drama-btn.pink-3:hover { background-color: #ffa3be; }
            .drama-btn.pink-4 { background-color: #ffd6e6; color: #884a6c; } /* Lighter pink, darker text */
            .drama-btn.pink-4:hover { background-color: #ffc0d9; }
            .drama-btn.pink-5 { background-color: #e0b0d6; } /* Lilac/Lavender */
            .drama-btn.pink-5:hover { background-color: #c993c1; }

            /* Sound Buttons - Purple/Pink-Purple shades */
            .sound-btn.purple-1 { background-color: #c780e0; }
            .sound-btn.purple-1:hover { background-color: #b36cd1; }
            .sound-btn.purple-2 { background-color: #e0b0e0; } /* Rosy purple */
            .sound-btn.purple-2:hover { background-color: #d19fcd; }
            .sound-btn.purple-3 { background-color: #a272b0; }
            .sound-btn.purple-3:hover { background-color: #90629c; }
            .sound-btn.purple-4 { background-color: #f7b7d7; } /* Soft light pink */
            .sound-btn.purple-4:hover { background-color: #f0a4cd; }
            .sound-btn.purple-5 { background-color: #d8bfd8; } /* Thistle (muted purple) */
            .sound-btn.purple-5:hover { background-color: #c2aac2; }
        `;
        document.head.appendChild(style);

        const dramaId = getDramaIdFromURL();
        const soundId = getSoundIdFromURL();

        if (!dramaId && !soundId) {
            log("⚠️ Không tìm thấy Drama ID hoặc Sound ID trên trang này. Vui lòng truy cập trang drama hoặc tập.");
        }

        const toggleUIBtn = document.getElementById('toggleUIBtn');
        const uiContent = document.getElementById('uiContent');
        const missevanSubtitleTool = document.getElementById('missevanSubtitleTool');

        toggleUIBtn.addEventListener('click', () => {
            const isHidden = uiContent.style.display === 'none';
            if (isHidden) {
                uiContent.style.display = 'flex';
                toggleUIBtn.innerHTML = '&#x25BC;';
                missevanSubtitleTool.style.width = '280px';
                missevanSubtitleTool.style.height = 'fit-content';
                missevanSubtitleTool.style.overflow = 'auto';
                missevanSubtitleTool.style.padding = '10px';
                localStorage.setItem(UI_STATE_KEY, 'visible');
            } else {
                uiContent.style.display = 'none';
                toggleUIBtn.innerHTML = '&#x25B2;';
                missevanSubtitleTool.style.width = 'fit-content';
                missevanSubtitleTool.style.height = 'fit-content';
                missevanSubtitleTool.style.overflow = 'hidden';
                missevanSubtitleTool.style.padding = '5px';
                localStorage.setItem(UI_STATE_KEY, 'hidden');
            }
        });


        document.getElementById('downloadDramaLrcBtn').addEventListener('click', () => {
            if (dramaId) processDramaId(dramaId, 'lrc');
            else log("❌ Không tìm thấy Drama ID.");
        });
        document.getElementById('downloadDramaJsonBtn').addEventListener('click', () => {
            if (dramaId) processDramaId(dramaId, 'json');
            else log("❌ Không tìm thấy Drama ID.");
        });
        document.getElementById('downloadDramaAudioBtn').addEventListener('click', () => {
            if (dramaId) processDramaId(dramaId, 'audio');
            else log("❌ Không tìm thấy Drama ID.");
        });
        document.getElementById('downloadDramaImageBtn').addEventListener('click', () => {
            if (dramaId) processDramaId(dramaId, 'image');
            else log("❌ Không tìm thấy Drama ID.");
        });
        document.getElementById('downloadDramaAllImagesBtn').addEventListener('click', () => {
            if (dramaId) processDramaId(dramaId, 'all-images');
            else log("❌ Không tìm thấy Drama ID.");
        });

        document.getElementById('downloadSoundLrcBtn').addEventListener('click', () => {
            if (soundId) processSingleSoundId(soundId, 'lrc');
            else log("❌ Không tìm thấy Sound ID. Vui lòng truy cập trang từng tập.");
        });
        document.getElementById('downloadSoundJsonBtn').addEventListener('click', () => {
            if (soundId) processSingleSoundId(soundId, 'json');
            else log("❌ Không tìm thấy Sound ID. Vui lòng truy cập trang từng tập.");
        });
        document.getElementById('downloadSoundAudioBtn').addEventListener('click', () => {
            if (soundId) processSingleSoundId(soundId, 'audio');
            else log("❌ Không tìm thấy Sound ID. Vui lòng truy cập trang từng tập.");
        });
        document.getElementById('downloadSoundImageBtn').addEventListener('click', () => {
            if (soundId) processSingleSoundId(soundId, 'image');
            else log("❌ Không tìm thấy Sound ID. Vui lòng truy cập trang từng tập.");
        });
        document.getElementById('downloadSoundAllImagesBtn').addEventListener('click', () => {
            if (soundId) processSingleSoundId(soundId, 'all-images');
            else log("❌ Không tìm thấy Sound ID. Vui lòng truy cập trang từng tập.");
        });
    }

    // Initialize UI
    window.addEventListener('load', createUI);

})();
