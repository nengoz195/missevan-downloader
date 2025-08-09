// ==UserScript==
// @name         Missevan Downloader - Combined (Kitty Edition with Mode 4 Sub)
// @namespace    http://tampermonkey.net/
// @version      3.2 // Tăng version để đánh dấu thay đổi này
// @description  Tự động tải phụ đề Missevan (.lrc, .json, .ass - mode 4), Audio (.m4a) và Ảnh bìa (.jpg/.png), hỗ trợ từng tập hoặc toàn bộ drama. Mặc định tải audio không nén (tùy chọn nén). Tự động chuyển JSON sang SRT khi tải phụ đề JSON. Có thể tải thêm các ảnh phụ liên quan đến sound/drama. Đã sửa đổi để ưu tiên tải ảnh bìa tập chất lượng cao (covers). Giao diện màu hồng dễ thương với chủ đề mèo Kitty.
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

    // ================================================================
    //                           CONSTANTS
    // ================================================================
    const DRAMA_INFO_URL = "https://www.missevan.com/dramaapi/getdrama";
    const SOUND_GET_URL = "https://www.missevan.com/sound/getsound";
    const DANMAKU_GET_URL = "https://www.missevan.com/sound/getdm";
    const SOUND_IMAGES_URL = "https://www.missevan.com/sound/getimages";

    const UI_STATE_KEY = 'missevanDownloaderUIState'; // Key for localStorage
    const DEFAULT_ASS_DURATION = 3.0; // Default duration for ASS mode 4 subtitles


    // ================================================================
    //                            UTILITIES
    // ================================================================

    /**
     * Lấy giá trị của một tham số từ URL.
     * @param {string} key - Tên tham số.
     * @returns {string|null} Giá trị tham số hoặc null nếu không tìm thấy.
     */
    function getURLParam(key) {
        const url = new URL(window.location.href);
        return url.searchParams.get(key);
    }

    /**
     * Lấy Drama ID từ pathname của URL.
     * @returns {string|null} Drama ID hoặc null.
     */
    function getDramaIdFromURL() {
        const match = location.pathname.match(/\/mdrama\/(\d+)/);
        return match ? match[1] : null;
    }

    /**
     * Lấy Sound ID từ URL (tham số 'id').
     * @returns {string|null} Sound ID hoặc null.
     */
    function getSoundIdFromURL() {
        return getURLParam("id") || getURLParam("soundid"); // Support both 'id' and 'soundid'
    }

    /**
     * Ghi log ra hộp log trên UI và console.
     * @param {string} msg - Tin nhắn cần ghi log.
     */
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

    /**
     * Thực hiện HTTP request bằng GM_xmlhttpRequest.
     * @param {string} url - URL đích.
     * @param {string} type - Kiểu phản hồi ('json', 'text', 'blob').
     * @returns {Promise<any>} Dữ liệu phản hồi.
     */
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
                        reject(`Request failed with status: ${res.status} ${res.statusText} for URL: ${url}`);
                    }
                },
                onerror: err => reject(`Network error: ${err} for URL: ${url}`)
            });
        });
    }

    /**
     * Làm sạch tên file/thư mục, loại bỏ các ký tự không hợp lệ.
     * @param {string} name - Tên gốc.
     * @returns {string} Tên đã được làm sạch.
     */
    function cleanFilename(name) {
        // Loại bỏ các ký tự không hợp lệ cho tên file/thư mục
        return name.replace(/[<>:"/\\|?*]+/g, '_').trim();
    }

    /**
     * Lấy phần mở rộng của file từ URL.
     * @param {string} url - URL của file.
     * @returns {string} Phần mở rộng (ví dụ: 'jpg', 'mp3') hoặc chuỗi rỗng.
     */
    function getFileExtension(url) {
        try {
            const urlObj = new URL(url);
            const pathname = urlObj.pathname;
            const parts = pathname.split('.');
            if (parts.length > 1) {
                return parts.pop().split('?')[0].toLowerCase();
            }
        } catch (e) {
            // Invalid URL
        }
        return '';
    }

    /**
     * Chuyển đổi giây sang định dạng thời gian ASS (h:mm:ss.cs).
     * @param {number} sec - Thời gian tính bằng giây.
     * @returns {string} Thời gian ở định dạng ASS.
     */
    function assTime(sec) {
        if (sec < 0) sec = 0;
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        const s = Math.floor(sec % 60);
        const cs = Math.round((sec - Math.floor(sec)) * 100); // Centiseconds
        return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(cs).padStart(2,'0')}`;
    }

    /**
     * Làm sạch văn bản HTML, loại bỏ thẻ và các ký tự không hợp lệ.
     * @param {string} t - Văn bản cần làm sạch.
     * @returns {string} Văn bản đã được làm sạch.
     */
    function cleanText(t) {
        if (!t) return "";
        const el = document.createElement("textarea");
        el.innerHTML = t;
        let s = el.value;
        // Loại bỏ thẻ HTML, ký tự điều khiển và các ký tự không in được
        s = s.replace(/<[^>]+>/g, "").replace(/[\x00-\x1F\x7F]/g, "").trim();
        // Thay thế nhiều khoảng trắng bằng một khoảng trắng duy nhất
        return s.replace(/\s+/g, " ");
    }

    /**
     * Phân tích thuộc tính 'p' của thẻ danmaku.
     * @param {string} p - Chuỗi thuộc tính 'p'.
     * @returns {Array<string>} Mảng chứa các phần của thuộc tính 'p'.
     */
    function parsePAttr(p) {
        const parts = p.split(",");
        while (parts.length < 8) parts.push(""); // Đảm bảo có đủ 8 phần tử
        return parts;
    }


    // ================================================================
    //                            API FETCHERS
    // ================================================================

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
            const cleanedName = cleanFilename(name);
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

            // Chuyển đổi coversmini SANG covers
            if (imageUrl && imageUrl.includes('/coversmini/')) {
                imageUrl = imageUrl.replace('/coversmini/', '/covers/');
                // log(`Đã chuyển đổi URL ảnh (coversmini -> covers): ${imageUrl}`); // Ghi log để bạn thấy sự thay đổi
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
            const name = cleanFilename(res?.info?.drama?.name || `drama_${dramaId}`);
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
            if (data?.successVal?.images && Array.isArray(data.successVal.images)) {
                // Áp dụng chuyển đổi coversmini -> covers cho ảnh bổ sung nếu cần
                return data.successVal.images.map(imgArray => {
                    let imgUrl = imgArray[0];
                    if (imgUrl && imgUrl.includes('/coversmini/')) {
                        imgUrl = imgUrl.replace('/coversmini/', '/covers/');
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

    /**
     * Phân tích danmaku (kiểu XML) từ Sound ID để tạo dữ liệu LRC.
     * @param {string} id - Sound ID.
     * @returns {Promise<Array<[string, {stime: string, text: string}]>>} Danh sách danmaku đã sắp xếp.
     */
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
                // Giữ nguyên logic cũ của LRC là lấy tất cả danmaku, không lọc mode 4.
                list[dmid] = { stime, text: d.textContent };
            });
            return Object.entries(list).sort(([, a], [, b]) => parseFloat(a.stime) - parseFloat(b.stime));
        } catch (error) {
            log(`❌ Lỗi phân tích Danmaku cho Sound ID ${id}: ${error}`);
            return [];
        }
    }

    // ================================================================
    //                           SUBTITLE FORMATTERS
    // ================================================================

    /**
     * Tạo nội dung LRC từ dữ liệu danmaku đã phân tích.
     * @param {Array<[string, {stime: string, text: string}]>} data - Dữ liệu danmaku.
     * @param {string} title - Tiêu đề bài hát/tập.
     * @returns {string} Nội dung file LRC.
     */
    function genLRC(data, title) {
        let out = `[ver:v1.0]\n[nickname:MeowMeow]\n[ti:${title}]`;
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
            const color = entry.color ?? 16777215; // Default white
            const italic = entry.italic || false;
            const underline = entry.underline || false;

            let line = role ? `${role}: ${content}` : content;

            // Apply HTML formatting for SRT
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

    /**
     * Xây dựng nội dung file ASS từ các sự kiện danmaku mode 4.
     * @param {Array<Array<number, string>>} events - Mảng các sự kiện [thời gian bắt đầu, văn bản].
     * @returns {string} Nội dung file ASS.
     */
    function buildASS(events) {
        const ass = [];
        // Script Info
        ass.push("[Script Info]");
        ass.push("; Auto-generated by Missevan Subtitle Downloader Tampermonkey Script");
        ass.push("Title: Missevan Mode 4 Danmaku");
        ass.push("ScriptType: v4.00+");
        ass.push("PlayDepth: 0");
        ass.push("ScaledBorderAndShadow: Yes");
        ass.push("WrapStyle: 0"); // No automatic wrapping
        ass.push("Collisions: Normal"); // Collision handling
        ass.push("");

        // Styles
        ass.push("[V4+ Styles]");
        ass.push("Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, "
                 + "Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, "
                 + "MarginL, MarginR, MarginV, Encoding");
        // Default style, white color, no bold, no italic, no underline
        // Outline: 1px, Shadow: 1px, Alignment: bottom-center (2)
        ass.push("Style: Default,Arial,20,&H00FFFFFF,&H0000FFFF,&H00000000,&H00000000,"
                 + "0,0,0,0,100,100,0,0,1,1,1,2,10,10,10,1");
        ass.push("");

        // Events
        ass.push("[Events]");
        ass.push("Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text");

        events.forEach(([start, text], i) => {
            let end;
            if (i + 1 < events.length) {
                // End 0.01 seconds before the next line or after default duration
                end = Math.min(events[i+1][0] - 0.01, start + DEFAULT_ASS_DURATION);
                if (end <= start) { // Ensure end time is greater than start time
                    end = start + 0.01;
                }
            } else {
                // If last line, end after default duration
                end = start + DEFAULT_ASS_DURATION;
            }
            ass.push(`Dialogue: 0,${assTime(start)},${assTime(end)},Default,,0,0,0,,${text}`);
        });
        return ass.join("\n");
    }

    // ================================================================
    //                           DOWNLOAD LOGIC
    // ================================================================

    /**
     * Tải file sử dụng GM_download, hiển thị log lỗi.
     * @param {string} url - URL của file.
     * @param {string} name - Tên file.
     * @param {boolean} saveAs - True để hỏi vị trí lưu, false để tải thẳng.
     * @returns {Promise<void>}
     */
    function downloadFile(url, name, saveAs = false) {
        return new Promise((resolve, reject) => {
            GM_download({
                url: url,
                name: name,
                saveAs: saveAs,
                onload: () => {
                    log(`✅ Đã tải: ${name}`);
                    resolve();
                },
                onerror: (e) => {
                    log(`❌ Lỗi tải ${name}: ${e.error || e.message || e}`);
                    reject(e);
                }
            });
        });
    }

    /**
     * Lấy nội dung ASS (mode 4) từ một sound ID.
     * Hàm này được thiết kế để *trả về* nội dung, không tải trực tiếp.
     * @param {string} soundid - ID của âm thanh.
     * @returns {Promise<string|null>} Nội dung ASS hoặc null nếu có lỗi/không có danmaku mode 4.
     */
    async function getASSContentForID(soundid) {
        try {
            const xmlText = await fetchData(`${DANMAKU_GET_URL}?soundid=${soundid}`, 'text');
            const parsedXml = new DOMParser().parseFromString(xmlText, "text/xml");
            const events = [];
            parsedXml.querySelectorAll("d").forEach(d => {
                const pAttr = d.getAttribute("p") || "";
                const [stime, mode] = parsePAttr(pAttr);
                if (mode !== "4") return; // Only process mode 4 danmaku
                const start = parseFloat(stime);
                if (isNaN(start)) return;
                const text = cleanText(d.textContent);
                if (text) events.push([start, text]);
            });
            events.sort((a, b) => a[0] - b[0]);
            if (events.length === 0) {
                log(`⚠️ Sound ID ${soundid}: Không tìm thấy danmaku mode 4.`);
                return null;
            }
            return buildASS(events);
        } catch (error) {
            log(`❌ Lỗi khi lấy nội dung ASS cho soundid ${soundid}: ${error}`);
            return null;
        }
    }


    async function processDramaId(dramaId, type) {
        log(`📥 Đang xử lý drama ID: ${dramaId} (Loại: ${type.toUpperCase()})`);
        const { name: dramaName, ids, imageUrl: dramaCoverUrl } = await getDramaDetails(dramaId);

        if (ids.length === 0 && !type.includes('image')) {
            log(`⚠️ Không tìm thấy Sound ID nào cho drama ${dramaId}.`);
        }

        const shouldZipAudio = document.getElementById('zipAudioCheckbox')?.checked ?? false;
        const convertJsonToSrtCheckbox = document.getElementById('convertJsonToSrtCheckbox')?.checked ?? false;

        const zip = new JSZip();
        let filesAdded = 0;
        let downloadedIndividually = 0; // Counter for individually downloaded files (like audio not in zip)

        // Special handling for 'audio' type when not zipping (download individually)
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
                        await downloadFile(audioUrl, `${dramaName}/${title}.${extension}`);
                        downloadedIndividually++;
                    } catch (e) {
                        // Error already logged by downloadFile
                    }
                } else {
                    log(`⚠️ Sound ID ${id}: Không có URL Audio.`);
                }
                await new Promise(r => setTimeout(r, 200)); // Small delay
            }
            log(`✅ Hoàn tất tải ${downloadedIndividually} file audio cho drama ${dramaName}.`);
            GM_notification({
                title: 'Tải Drama Hoàn Tất',
                text: `Đã hoàn tất tải ${downloadedIndividually} file audio cho drama: ${dramaName}.`,
                timeout: 5000
            });
            return; // Exit here as audio is handled
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

        // Iterate through Sound IDs for other types (LRC, JSON, Audio for ZIP, ASS, and additional images)
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
            } else if (type === 'ass') { // Handle ASS for drama (add to ZIP)
                try {
                    const assContent = await getASSContentForID(id);
                    if (assContent) {
                        zip.file(`${title}.ass`, assContent); // Add to zip
                        filesAdded++;
                        log(`✅ Sound ID ${id}: Đã thêm ${title}.ass vào ZIP.`);
                    }
                } catch (error) {
                    log(`❌ Sound ID ${id}: Lỗi khi lấy nội dung ASS: ${error}`);
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
            await new Promise(r => setTimeout(r, 200)); // Small delay between episodes
        }

        if (filesAdded === 0) {
            log(`⚠️ Không có file nào được tạo cho drama này.`);
            GM_notification({
                title: 'Tải Drama Hoàn Tất',
                text: `Không có file nào được tạo cho drama: ${dramaName}.`,
                timeout: 5000
            });
            return;
        }

        log(`📦 Đang tạo file ZIP (${filesAdded} files)...`);
        // Filename for zip will include '_ass' if type is 'ass'
        const zipFileName = `${dramaName}_${type}${convertJsonToSrtCheckbox && type === 'json' ? '_srt' : ''}.zip`;
        try {
            const blob = await zip.generateAsync({ type: "blob" });
            await downloadFile(URL.createObjectURL(blob), zipFileName);
        } catch (error) {
            log(`❌ Lỗi tạo hoặc tải file ZIP: ${error}`);
        }

        GM_notification({
            title: 'Tải Drama Hoàn Tất',
            text: `Đã hoàn tất tải các file cho drama: ${dramaName}.`,
            timeout: 5000
        });
    }

    async function processSingleSoundId(soundId, type) {
        log(`🎵 Tải từng tập với Sound ID: ${soundId} (Loại: ${type.toUpperCase()})`);

        const soundInfo = await getSoundInfo(soundId);
        const name = soundInfo.name;
        const convertJsonToSrtCheckbox = document.getElementById('convertJsonToSrtCheckbox')?.checked ?? false;

        if (type === 'lrc') {
            const data = await parseDanmaku(soundId);
            if (!data.length) {
                return log("⚠️ Không có phụ đề LRC (Danmaku).");
            }
            const lrc = genLRC(data, name);
            const blob = new Blob([lrc], { type: "text/plain" });
            await downloadFile(URL.createObjectURL(blob), `${name}.lrc`);
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
                    await downloadFile(URL.createObjectURL(blob), `${name}.srt`);
                } else {
                    const jsonString = JSON.stringify(jsonData, null, 2);
                    const blob = new Blob([jsonString], { type: "application/json" });
                    await downloadFile(URL.createObjectURL(blob), `${name}.json`);
                }
            } catch (error) {
                log(`❌ Lỗi tải hoặc phân tích JSON: ${error}`);
            }
        } else if (type === 'ass') { // Handle ASS for single sound (download individually)
            try {
                const assContent = await getASSContentForID(soundId);
                if (assContent) {
                    const blob = new Blob([assContent], { type: "text/plain" });
                    await downloadFile(URL.createObjectURL(blob), `${name}.ass`);
                }
            } catch (error) {
                log(`❌ Lỗi tải ASS: ${error}`);
            }
        } else if (type === 'audio') {
            const audioUrl = soundInfo.audioUrl;
            if (!audioUrl) {
                return log("⚠️ Không có URL Audio.");
            }
            try {
                log(`Tải audio từ: ${audioUrl}`);
                const extension = getFileExtension(audioUrl) || 'm4a';
                await downloadFile(audioUrl, `${name}.${extension}`);
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
                await downloadFile(imageUrl, `${name}_cover.${extension}`);
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
                GM_notification({
                    title: 'Tải Tập Hoàn Tất',
                    text: `Không có file ảnh nào được tạo cho tập: ${name}.`,
                    timeout: 5000
                });
                return;
            }

            log(`📦 Đang tạo file ZIP (${filesAdded} files)...`);
            const zipFileName = `${name}_all_images.zip`;
            try {
                const blob = await zip.generateAsync({ type: "blob" });
                await downloadFile(URL.createObjectURL(blob), zipFileName);
            } catch (error) {
                log(`❌ Lỗi tạo hoặc tải file ZIP: ${error}`);
            }
        }

        GM_notification({
            title: 'Tải Tập Hoàn Tất',
            text: `Đã hoàn tất tải file cho tập: ${name}.`,
            timeout: 5000
        });
    }

    // ================================================================
    //                           UI CREATION
    // ================================================================

    function createUI() {
        // Remove existing UI if any (for script updates or re-initialization)
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
            resize: both; /* Allow user to resize */
            min-width: 250px;
            min-height: 200px;
        `;

        // Load UI state from localStorage
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
                    <button id="downloadDramaAssBtn" class="btn drama-btn pink-ass">
                        <span class="icon">📝</span> Phụ đề ASS
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
                    <button id="downloadSoundAssBtn" class="btn sound-btn purple-ass">
                        <span class="icon">📝</span> Phụ đề ASS
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
            .drama-btn.pink-ass { background-color: #f77f8d; } /* Slightly different pink for ASS */
            .drama-btn.pink-ass:hover { background-color: #e06c7a; }
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
            .sound-btn.purple-ass { background-color: #a87ea8; } /* Slightly different purple for ASS */
            .sound-btn.purple-ass:hover { background-color: #936b94; }
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


        // Event Listeners for Drama buttons
        document.getElementById('downloadDramaLrcBtn').addEventListener('click', () => {
            if (dramaId) processDramaId(dramaId, 'lrc');
            else log("❌ Không tìm thấy Drama ID.");
        });
        document.getElementById('downloadDramaJsonBtn').addEventListener('click', () => {
            if (dramaId) processDramaId(dramaId, 'json');
            else log("❌ Không tìm thấy Drama ID.");
        });
        document.getElementById('downloadDramaAssBtn').addEventListener('click', () => {
            if (dramaId) processDramaId(dramaId, 'ass');
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

        // Event Listeners for Single Sound buttons
        document.getElementById('downloadSoundLrcBtn').addEventListener('click', () => {
            if (soundId) processSingleSoundId(soundId, 'lrc');
            else log("❌ Không tìm thấy Sound ID. Vui lòng truy cập trang từng tập.");
        });
        document.getElementById('downloadSoundJsonBtn').addEventListener('click', () => {
            if (soundId) processSingleSoundId(soundId, 'json');
            else log("❌ Không tìm thấy Sound ID. Vui lòng truy cập trang từng tập.");
        });
        document.getElementById('downloadSoundAssBtn').addEventListener('click', () => {
            if (soundId) processSingleSoundId(soundId, 'ass');
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

    // ================================================================
    //                           INITIALIZATION
    // ================================================================

    // Initialize UI on page load
    window.addEventListener('load', createUI);

    // Re-initialize UI if URL changes (for SPA navigation)
    let lastUrl = location.href;
    const urlCheckInterval = setInterval(() => {
        if (lastUrl !== location.href) {
            lastUrl = location.href;
            console.log("URL changed to:", lastUrl);
            createUI(); // Re-create UI to update button visibility and context
        }
    }, 500); // Check every 0.5 seconds

    // Clean up interval on page unload (best effort)
    window.addEventListener('beforeunload', () => {
        clearInterval(urlCheckInterval);
    });

})();
