// ==UserScript==
// @name         Missevan LRC/JSON/Audio/Image Subtitle Downloader (Auto Detect + Optional Audio ZIP)
// @namespace    http://tampermonkey.net/
// @version      1.9 // Tăng version để dễ quản lý
// @description  Tự động tải phụ đề Missevan (.lrc và .json), Audio (.m4a) và Ảnh bìa (.jpg/.png), hỗ trợ từng tập hoặc toàn bộ drama. Mặc định tải audio không nén (tùy chọn nén). Có thể tải thêm các ảnh phụ liên quan đến sound/drama. Đã sửa đổi để ưu tiên tải ảnh bìa tập chất lượng cao (covers).
// @author       Thien Truong Dia Cuu
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
        let out = `[ver:v1.0]\n[nickname:涛之雨]\n[ti:${title}]`;
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

    async function processDramaId(dramaId, type = 'lrc') {
        log(`📥 Đang xử lý drama ID: ${dramaId} (Loại: ${type.toUpperCase()})`);
        const { name: dramaName, ids, imageUrl: dramaCoverUrl } = await getDramaDetails(dramaId);

        if (ids.length === 0 && type !== 'image' && type !== 'all-images') {
            log(`⚠️ Không tìm thấy Sound ID nào cho drama ${dramaId}.`);
        }

        const shouldZipAudio = document.getElementById('zipAudioCheckbox')?.checked ?? false;

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
                        zip.file(`${title}.json`, JSON.stringify(jsonData, null, 2));
                        filesAdded++;
                    } catch (error) {
                        log(`❌ Sound ID ${id}: Lỗi tải JSON từ URL ${subtitleUrl}: ${error}`);
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
        const zipFileName = `${dramaName}_${type}.zip`;
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
                const jsonString = JSON.stringify(jsonData, null, 2);
                const blob = new Blob([jsonString], { type: "application/json" });
                GM_download({
                    url: URL.createObjectURL(blob),
                    name: `${name}.json`,
                    saveAs: false,
                    onload: () => log(`✅ Đã tải ${name}.json`),
                    onerror: e => log(`❌ Lỗi tải JSON: ${e.error || e.message || e}`)
                });
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
        // --- ĐIỀU CHỈNH KÍCH THƯỚC VÀ KIỂU DÁNG GIAO DIỆN Ở ĐÂY ---
        box.style = `
            position: fixed;
            top: 10px;
            right: 10px;
            background: #fff;
            border: 1px solid #ccc;
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
        // Lấy trạng thái hiển thị từ localStorage
        const uiState = localStorage.getItem(UI_STATE_KEY);
        let isUIHidden = false;
        if (uiState === 'hidden') {
            isUIHidden = true;
            box.style.width = 'fit-content'; // Thu gọn khi ẩn
            box.style.height = 'fit-content';
            box.style.overflow = 'hidden';
            box.style.padding = '5px';
        }

        box.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #eee; padding-bottom: 8px; margin-bottom: 5px;">
                <h3 style="margin: 0; text-align: left; color: #333; font-size: 16px;">
                    🎧 Missevan Downloader
                </h3>
                <button id="toggleUIBtn" style="background: none; border: none; font-size: 18px; cursor: pointer; color: #555; padding: 0 5px;">
                    ${isUIHidden ? '▲' : '▼'} <!-- Biểu tượng mũi tên lên/xuống -->
                </button>
            </div>

            <div id="uiContent" style="display: ${isUIHidden ? 'none' : 'flex'}; flex-direction: column; gap: 10px;">
                <div style="padding: 5px 0; border-bottom: 1px solid #eee;">
                    <input type="checkbox" id="zipAudioCheckbox" style="margin-right: 5px; transform: scale(1.1);">
                    <label for="zipAudioCheckbox" style="font-size: 12px; color: #555; cursor: pointer;">
                        Nén Audio Drama vào ZIP?
                    </label>
                    <p style="font-size: 10px; color: #777; margin: 3px 0 0 20px;">
                        (Bỏ chọn để tải từng file audio cho Drama)
                    </p>
                </div>

                <div style="display: flex; flex-direction: column; gap: 7px;">
                    <strong style="color: #4CAF50;">Tải TOÀN BỘ Drama (ZIP):</strong>
                    <button id="downloadDramaLrcBtn" class="btn drama-btn green">📥 Drama (LRC)</button>
                    <button id="downloadDramaJsonBtn" class="btn drama-btn blue">📥 Drama (JSON)</button>
                    <button id="downloadDramaAudioBtn" class="btn drama-btn orange">📥 Drama (AUDIO)</button>
                    <button id="downloadDramaImageBtn" class="btn drama-btn light-green">📸 Drama bìa (Ảnh)</button>
                    <button id="downloadDramaAllImagesBtn" class="btn drama-btn gray">🖼️ Drama tất cả ảnh</button>
                </div>

                <div style="display: flex; flex-direction: column; gap: 7px; border-top: 1px solid #eee; padding-top: 10px;">
                    <strong style="color: #FFC107;">Tải TỪNG Tập (Sound ID):</strong>
                    <button id="downloadSoundLrcBtn" class="btn sound-btn yellow">🎵 Tập (LRC)</button>
                    <button id="downloadSoundJsonBtn" class="btn sound-btn purple">🎵 Tập (JSON)</button>
                    <button id="downloadSoundAudioBtn" class="btn sound-btn dark-blue">🎵 Tập (AUDIO)</button>
                    <button id="downloadSoundImageBtn" class="btn sound-btn cyan">📸 Tập bìa (Ảnh)</button>
                    <button id="downloadSoundAllImagesBtn" class="btn sound-btn teal">🖼️ Tập tất cả ảnh</button>
                </div>

                <div style="border-top: 1px solid #eee; padding-top: 10px;">
                    <h4 style="margin: 0 0 5px 0; color: #333; font-size: 14px;">Log Output:</h4>
                    <div id="logOutput" style="background:#f9f9f9;border:1px solid #eee;height:120px;overflow-y:auto;padding:5px;font-size:10px;color:#444;border-radius:4px;">
                        Sẵn sàng!
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(box);

        // Add CSS for buttons
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
                transition: background-color 0.2s ease, transform 0.1s ease;
            }
            #missevanSubtitleTool .btn:hover {
                transform: translateY(-1px);
                box-shadow: 0 2px 5px rgba(0,0,0,0.1);
            }
            #missevanSubtitleTool .btn:active {
                transform: translateY(0);
                box-shadow: none;
            }

            /* Drama Buttons */
            .drama-btn.green { background-color: #4CAF50; }
            .drama-btn.green:hover { background-color: #45a049; }
            .drama-btn.blue { background-color: #2196F3; }
            .drama-btn.blue:hover { background-color: #1e88e5; }
            .drama-btn.orange { background-color: #FF5722; }
            .drama-btn.orange:hover { background-color: #e64a19; }
            .drama-btn.light-green { background-color: #8BC34A; }
            .drama-btn.light-green:hover { background-color: #7cb342; }
            .drama-btn.gray { background-color: #9E9E9E; }
            .drama-btn.gray:hover { background-color: #7c7c7c; }

            /* Sound Buttons */
            .sound-btn.yellow { background-color: #FFC107; color: #333; }
            .sound-btn.yellow:hover { background-color: #ffb300; }
            .sound-btn.purple { background-color: #9C27B0; }
            .sound-btn.purple:hover { background-color: #8e24aa; }
            .sound-btn.dark-blue { background-color: #607D8B; }
            .sound-btn.dark-blue:hover { background-color: #546e7a; }
            .sound-btn.cyan { background-color: #00BCD4; }
            .sound-btn.cyan:hover { background-color: #00acc1; }
            .sound-btn.teal { background-color: #009688; }
            .sound-btn.teal:hover { background-color: #00796b; }
        `;
        document.head.appendChild(style);

        const dramaId = getDramaIdFromURL();
        const soundId = getSoundIdFromURL();

        if (!dramaId && !soundId) {
            log("⚠️ Không tìm thấy Drama ID hoặc Sound ID trên trang này. Vui lòng truy cập trang drama hoặc tập.");
        }

        // Event listener for toggling UI visibility
        const toggleUIBtn = document.getElementById('toggleUIBtn');
        const uiContent = document.getElementById('uiContent');
        const missevanSubtitleTool = document.getElementById('missevanSubtitleTool');

        toggleUIBtn.addEventListener('click', () => {
            const isHidden = uiContent.style.display === 'none';
            if (isHidden) {
                uiContent.style.display = 'flex';
                toggleUIBtn.innerHTML = '▼'; // Mũi tên xuống
                missevanSubtitleTool.style.width = '280px'; // Khôi phục chiều rộng mặc định
                missevanSubtitleTool.style.height = 'fit-content'; // Khôi phục chiều cao tự động
                missevanSubtitleTool.style.overflow = 'auto'; // Cho phép cuộn lại
                missevanSubtitleTool.style.padding = '10px';
                localStorage.setItem(UI_STATE_KEY, 'visible');
            } else {
                uiContent.style.display = 'none';
                toggleUIBtn.innerHTML = '▲'; // Mũi tên lên
                missevanSubtitleTool.style.width = 'fit-content'; // Thu gọn
                missevanSubtitleTool.style.height = 'fit-content';
                missevanSubtitleTool.style.overflow = 'hidden'; // Ẩn thanh cuộn
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
