// ==UserScript==
// @updateURL    https://raw.githubusercontent.com/nengoz195/manbo-subtitle-image-downloader/refs/heads/main/manbo_subtitle_downloader_button.user.js
// @downloadURL  https://raw.githubusercontent.com/nengoz195/manbo-subtitle-image-downloader/refs/heads/main/manbo_subtitle_downloader_button.user.js
// @name         Manbo Media Downloader (Cute Pink Panel Edition - Optimized Images)
// @namespace    manbo.kilamanbo.media
// @version      3.5 // Chuyển đổi ASS - không dòng trống + Sửa lỗi trùng tên tệp ZIP
// @description  Tải phụ đề và ảnh từ Manbo với giao diện cute hồng, trực quan và dễ sử dụng! Các tùy chọn tải xuống được đặt trong một bảng điều khiển nổi. Ảnh lấy từ API (setPic) và các phần tử DOM cụ thể.
// @author       Thien Truong Dia Cuu
// @match        https://kilamanbo.com/manbo/pc/detail*
// @match        https://manbo.kilakila.cn/manbo/pc/detail*
// @match        https://manbo.hongdoulive.com/Activecard/radioplay*
// @match        https://kilamanbo.com/*
// @match        https://www.kilamanbo.com/*
// @require      https://greasyfork.org/scripts/455943-ajaxhooker/code/ajaxHooker.js?version=1124435
// @require      https://cdn.jsdelivr.net/npm/@zip.js/zip.js/dist/zip-full.min.js
// @require      https://unpkg.com/sweetalert2@11.6.15/dist/sweetalert2.min.js
// @resource     swalStyle https://unpkg.com/sweetalert2@11.7.2/dist/sweetalert2.min.css
// @require      https://unpkg.com/layui@2.7.6/dist/layui.js
// @resource     layuiStyle https://unpkg.com/layui@2.7.6/dist/css/layui.css
// @icon         https://img.hongrenshuo.com.cn/h5/websiteManbo-pc-favicon-cb.ico
// @grant        GM_getResourceText
// @grant        GM_addStyle
// @grant        GM_setClipboard
// @grant        GM_xmlhttpRequest
// @run-at       document-start
// @connect      img.kilamanbo.com
// @license      MIT
// ==/UserScript==

(function () {
    'use strict';

    let isDownloading = false;
    let subtitleData = []; // Để lưu thông tin phụ đề: [tiêu đề, lrcUrl, setIdStr] cho TẤT CẢ các tập
    let currentEpisodeLrcUrl = null; // Để lưu URL LRC của tập đang xem
    let imageData = [];    // Để lưu các URL ảnh (từ trang hiện tại API/DOM)
    let allDramaImageData = []; // Để lưu TẤT CẢ ảnh từ TẤT CẢ các tập (từ setPic)
    let currentDramaTitle = 'Manbo';
    let currentEpisodeTitle = 'Tập hiện tại'; // Tiêu đề mặc định cho tập hiện tại

    // --- Các kiểu tùy chỉnh cho Phiên bản Bảng điều khiển màu hồng dễ thương ---
    GM_addStyle(`
        /* Vùng chứa bảng điều khiển chính */
        #manbo-downloader-panel {
            position: fixed;
            top: 20%;
            right: 20px;
            width: 280px; /* Chiều rộng được điều chỉnh để vừa vặn hơn */
            background: linear-gradient(135deg, #ffe0ee, #fff0f6); /* Gradient hồng nhạt */
            border-radius: 15px;
            box-shadow: 0 8px 20px rgba(255, 126, 185, 0.4);
            z-index: 9999;
            font-family: 'Quicksand', sans-serif, 'Comic Sans MS';
            padding: 15px;
            box-sizing: border-box; /* Bao gồm phần đệm trong chiều rộng */
            border: 1px solid #ffb3d9; /* Viền tinh tế */
            max-height: 90vh; /* Giới hạn chiều cao tổng thể của panel theo viewport height */
            overflow: hidden; /* Ẩn tràn tổng thể nếu nội dung vẫn quá dài */
            display: flex; /* Dùng flexbox để footer dính dưới cùng */
            flex-direction: column;
            transition: all 0.3s ease-in-out; /* Thêm transition cho panel */
        }

        /* Khi panel bị ẩn hoàn toàn */
        #manbo-downloader-panel.collapsed {
            right: -300px; /* Đẩy ra ngoài màn hình */
            opacity: 0;
            pointer-events: none; /* Vô hiệu hóa tương tác khi ẩn */
        }


        /* Tiêu đề bảng điều khiển */
        #manbo-downloader-panel .panel-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
            padding-bottom: 10px;
            border-bottom: 1px dashed #ffb3d9; /* Đường gạch ngang */
            flex-shrink: 0; /* Không cho header co lại */
        }
        #manbo-downloader-panel .panel-title {
            color: #ff4d94;
            font-size: 1.2em;
            font-weight: bold;
            display: flex;
            align-items: center;
        }
        #manbo-downloader-panel .panel-title span {
            margin-right: 8px;
            font-size: 1.5em; /* Biểu tượng cảm xúc lớn hơn */
        }
        #manbo-downloader-panel .toggle-button {
            background: none;
            border: none;
            color: #ff4d94;
            font-size: 1.5em;
            cursor: pointer;
            transition: transform 0.2s ease;
        }
        #manbo-downloader-panel .toggle-button.collapsed {
            transform: rotate(-90deg);
        }

        /* Thân bảng điều khiển (có thể thu gọn nội dung) */
        #manbo-downloader-panel .panel-body {
            /* max-height được tính toán bằng JS */
            overflow-y: auto; /* Cuộn nếu nội dung tràn */
            transition: max-height 0.3s ease-out, opacity 0.3s ease-out;
            opacity: 1;
            flex-grow: 1; /* Cho phép body mở rộng và chiếm không gian còn lại */
        }
        #manbo-downloader-panel .panel-body.collapsed { /* Cập nhật: Chỉ áp dụng cho .panel-body */
            max-height: 0 !important;
            opacity: 0;
            overflow: hidden;
        }

        /* Tiêu đề phần */
        .panel-section-title {
            color: #d63384;
            font-weight: bold;
            margin-top: 15px;
            margin-bottom: 10px;
            font-size: 1.1em;
            display: flex;
            align-items: center;
        }
        .panel-section-title i {
            margin-right: 8px;
            font-size: 1.2em;
        }


        /* Nút tải xuống */
        .download-option-btn {
            display: flex;
            align-items: center;
            width: 100%;
            padding: 10px 15px;
            margin-bottom: 8px;
            background: linear-gradient(135deg, #ffcce5, #ffaad5); /* Hồng nhạt hơn cho các tùy chọn */
            color: #8c004d; /* Văn bản màu hồng đậm hơn */
            font-weight: bold;
            border: none;
            border-radius: 10px;
            cursor: pointer;
            box-shadow: 0 2px 5px rgba(255, 126, 185, 0.2);
            transition: all 0.2s ease;
            text-align: left;
            box-sizing: border-box;
        }
        .download-option-btn:hover {
            background: linear-gradient(135deg, #ffaad5, #ff8dc4);
            box-shadow: 0 4px 8px rgba(255, 126, 185, 0.3);
            transform: translateY(-2px);
        }
        .download-option-btn i {
            margin-right: 10px;
            font-size: 1.2em; /* Kích thước biểu tượng */
            color: #ff4d94; /* Màu biểu tượng */
        }
        /* Kiểu biểu tượng (sử dụng ký tự unicode cho đơn giản, có thể sử dụng hình ảnh/svg thực tế nếu muốn) */
        .icon-lrc:before { content: '💬'; }
        .icon-json-srt:before { content: '📄'; }
        .icon-ass:before { content: '📝'; }
        .icon-audio:before { content: '🎧'; }
        .icon-cover:before { content: '🖼️'; }
        .icon-all-images:before { content: '🎀'; }
        .icon-single-image:before { content: '📸'; }

        /* Nút ẩn hiện chính */
        #manbo-downloader-toggle-main-button {
            position: fixed;
            bottom: 20px; /* Vị trí dưới cùng */
            right: 20px; /* Vị trí bên phải */
            width: 40px; /* Nhỏ hơn một chút */
            height: 40px; /* Nhỏ hơn một chút */
            background: linear-gradient(135deg, #ff7eb9, #ff4d94); /* Màu hồng đậm */
            color: white;
            border: none;
            border-radius: 50%; /* Hình tròn */
            box-shadow: 0 4px 12px rgba(255, 77, 148, 0.4); /* Bóng nhỏ hơn một chút */
            font-size: 1.5em; /* Kích thước biểu tượng nhỏ hơn */
            font-weight: bold;
            cursor: pointer;
            z-index: 10000; /* Đảm bảo nổi trên mọi thứ */
            display: flex;
            justify-content: center;
            align-items: center;
            transition: all 0.2s ease;
        }
        #manbo-downloader-toggle-main-button:hover {
            background: linear-gradient(135deg, #ff4d94, #d63384);
            transform: scale(1.08); /* Phóng to nhẹ hơn khi hover */
        }
        /* Kiểu SweetAlert2 (chủ đề màu hồng nhất quán) */
        .swal2-popup {
            border-radius: 20px !important;
            background: #fff0f6 !important; /* Nền hồng nhạt */
            font-family: 'Quicksand', sans-serif, 'Arial' !important;
        }
        .swal2-title {
            color: #ff4d94 !important; /* Hồng đậm hơn cho tiêu đề */
            font-weight: bold !important;
        }
        .swal2-content {
            color: #d63384 !important; /* Hồng vừa cho nội dung */
        }
        .swal2-styled.swal2-confirm {
            background-color: #ff7eb9 !important; /* Hồng nút chính */
            border-radius: 20px !important;
            font-weight: bold !important;
            color: white !important;
        }
        .swal2-styled.swal2-deny {
            background-color: #ffb3d9 !important; /* Hồng nút phụ */
            border-radius: 20px !important;
            font-weight: bold !important;
            color: white !important;
        }
        .swal2-styled.swal2-cancel {
            background-color: #ffe0ee !important; /* Hồng nhạt nhất cho hủy */
            border-radius: 20px !important;
            font-weight: bold !important;
            color: #d63384 !important;
        }
        .swal2-progress-bar {
            background-color: #ff7eb9 !important; /* Thanh tiến trình màu hồng */
        }
        .swal2-timer-progress-bar {
            background-color: #ff7eb9 !important; /* Thanh thời gian màu hồng */
        }
        /* Vô hiệu hóa chọn văn bản trên toast */
        .disableSelection {
            user-select: none;
            -webkit-user-select: none;
            -moz-user-select: none;
            -ms-user-select: none;
        }
    `);

    // Tải tài nguyên CSS bên ngoài
    GM_addStyle(GM_getResourceText('swalStyle'));
    GM_addStyle(GM_getResourceText('layuiStyle'));

    // --- SweetAlert2 Mixin cho Toasts ---
    const toast = Swal.mixin({
        toast: true,
        position: 'top',
        timer: 3000,
        timerProgressBar: true,
        didOpen: (toast) => {
            toast.addEventListener('mouseenter', Swal.stopTimer);
            toast.addEventListener('mouseleave', Swal.resumeTimer);
        },
        customClass: { container: 'disableSelection' }
    });

    // --- Hàm tiện ích ---

    /**
     * Theo dõi tiến độ của nhiều Promise.
     * @param {Promise[]} proms - Mảng các Promise.
     * @param {(progress: number) => void} progress_cb - Callback cho cập nhật tiến độ (0-100).
     */
    function allProgress(proms, progress_cb) {
        let done = 0;
        progress_cb(0);
        return Promise.all(proms.map(p => p.then(() => {
            done++;
            progress_cb((done * 100) / proms.length);
        })));
    }

    /**
     * Lấy tệp bằng GM_xmlhttpRequest.
     * @param {string} url - URL của tệp.
     * @param {string} [responseType='blob'] - Loại phản hồi mong muốn.
     * @returns {Promise<Blob|string>} Một Promise giải quyết với phản hồi.
     */
    const fetchFile = (url, responseType = 'blob') => new Promise((resolve, reject) => {
        if (!url) {
            return reject(new Error("Liên kết bị lỗi, vui lòng liên hệ với tác giả."));
        }
        GM_xmlhttpRequest({
            method: "GET",
            url: url,
            onload: resp => {
                if (resp.status === 200) {
                    resolve(resp.response);
                } else {
                    reject(new Error(`Lỗi tải tệp: ${resp.status} ${resp.statusText}`));
                }
            },
            onerror: () => reject(new Error("Yêu cầu mạng thất bại.")),
            responseType: responseType
        });
    });

    /**
     * Bắt đầu tải tệp trong trình duyệt.
     * @param {Blob|string} data - Blob hoặc URL của tệp để tải xuống.
     * @param {string} fileName - Tên tệp mong muốn.
     */
    const downloadFile = (data, fileName) => {
        const a = document.createElement("a");
        a.download = fileName;
        a.href = typeof data === "string" ? data : URL.createObjectURL(data);
        a.style.display = "none";
        document.body.appendChild(a);
        a.click();
        a.remove();
        if (typeof data !== "string") {
            URL.revokeObjectURL(a.href); // Dọn dẹp URL Blob
        }
        isDownloading = false;
    };

    /**
     * Làm sạch một chuỗi để sử dụng làm tên tệp bằng cách loại bỏ các ký tự không hợp lệ.
     * @param {string} name - Chuỗi gốc.
     * @returns {string} Chuỗi đã làm sạch.
     */
    const sanitizeFilename = (name) => {
        // Loại bỏ các ký tự không hợp lệ cho tên tệp: / \ ? % * : | " < >
        return name.replace(/[\/\\?%*:|"<>]/g, '_')
                   .replace(/\s+/g, ' ') // Thay thế nhiều khoảng trắng bằng một khoảng trắng
                   .trim(); // Cắt bỏ khoảng trắng đầu/cuối
    };

    /**
     * Chuyển đổi văn bản phụ đề định dạng LRC sang định dạng ASS (Advanced SubStation Alpha).
     * Đây là một chuyển đổi cơ bản, chỉ xử lý dấu thời gian và văn bản.
     * @param {string} lrcText - Nội dung phụ đề LRC.
     * @returns {string} Nội dung phụ đề ASS.
     */
    function convertLrcToAss(lrcText) {
        let assContent = `[Script Info]
; Script được tạo bởi Manbo Media Downloader
Title: Chuyển đổi từ LRC
ScriptType: v4.00+
Collisions: Normal
PlayResX: 1280
PlayResY: 720
Timer: 100.0000

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,0,2,20,20,20,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

        const parsedLines = [];
        lrcText.split('\n').forEach(line => {
            // Regex để bắt dấu thời gian và phần văn bản còn lại.
            const match = line.match(/^\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/);
            if (match) {
                const minutes = parseInt(match[1]);
                const seconds = parseInt(match[2]);
                const milliseconds = parseInt(match[3]) * (match[3].length === 2 ? 10 : 1);
                const text = match[4].trim(); // Lấy phần văn bản và cắt bỏ khoảng trắng

                // Chỉ thêm vào nếu có văn bản thực sự sau dấu thời gian
                if (text.length > 0) {
                    parsedLines.push({
                        time: minutes * 60000 + seconds * 1000 + milliseconds, // Tổng số mili giây
                        text: text
                    });
                }
            }
        });

        // Sắp xếp các dòng theo thời gian để đảm bảo thứ tự thời gian chính xác
        parsedLines.sort((a, b) => a.time - b.time);

        // Hàm định dạng mili giây sang định dạng thời gian ASS H:MM:SS.CC
        const formatAssTime = (ms) => {
            const h = Math.floor(ms / 3600000);
            const m = Math.floor((ms % 3600000) / 60000);
            const s = Math.floor((ms % 60000) / 1000);
            const cs = Math.floor((ms % 1000) / 10); // Centiseconds

            return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
        };

        for (let i = 0; i < parsedLines.length; i++) {
            const current = parsedLines[i];
            const next = parsedLines[i + 1];

            const startTime = current.time;
            let endTime;

            if (next) {
                // Đặt thời gian kết thúc là 1 mili giây trước khi dòng tiếp theo bắt đầu
                endTime = next.time - 1;
                // Đảm bảo thời gian kết thúc không nhỏ hơn thời gian bắt đầu
                if (endTime < startTime) {
                    endTime = startTime; // Nếu dòng tiếp theo bắt đầu ngay lập tức hoặc trước đó, kết thúc tại thời gian bắt đầu
                }
            } else {
                // Nếu là dòng cuối cùng, cho nó một khoảng thời gian mặc định (ví dụ: 5 giây)
                endTime = startTime + 5000;
            }

            const assStartTime = formatAssTime(startTime);
            const assEndTime = formatAssTime(endTime);

            // Thoát các ký tự đặc biệt của ASS như '{', '}', và '\'
            const escapedText = current.text.replace(/\\/g, '\\\\').replace(/{/g, '\\{').replace(/}/g, '\\}');

            // Chỉ thêm dòng nếu có nội dung văn bản thực tế để tránh các sự kiện phụ đề thực sự trống
            if (escapedText.length > 0) {
                 assContent += `Dialogue: 0,${assStartTime},${assEndTime},Default,,0,0,0,,${escapedText}\n`;
            }
        }

        return assContent;
    }


    // --- Logic tải phụ đề ---

    /**
     * Bắt đầu quá trình nén và tải xuống phụ đề.
     * @param {Array<Array<string>>} lists - Mảng [tiêu đề, lrcUrl, setIdStr] cho phụ đề.
     * @param {string} dramaTitle - Tiêu đề của drama âm thanh.
     * @param {string} targetFormat - 'lrc' hoặc 'ass'.
     */
    const startZipSubtitles = async (lists, dramaTitle, targetFormat) => {
        if (isDownloading) {
            return toast.fire({ title: 'Đang tải về, vui lòng chờ...', icon: 'warning' });
        }
        isDownloading = true;
        const subtitlesToDownload = lists.filter(a => a[1]); // Lọc các mục không có URL
        if (subtitlesToDownload.length === 0) {
            toast.fire({ title: 'Tạm thời không có file phụ đề để tải.', icon: 'error' });
            isDownloading = false;
            return;
        }

        const zipWriter = new zip.ZipWriter(new zip.BlobWriter("application/zip"));
        toast.fire({ title: `Đang chuẩn bị phụ đề ${targetFormat.toUpperCase()}...`, icon: 'info' });

        try {
            const subtitleFetchPromises = subtitlesToDownload.map(s => fetchFile(s[1], 'text'));
            const subtitleTexts = await Promise.all(subtitleFetchPromises).catch(e => {
                throw new Error(`Lỗi tải phụ đề: ${e.message}`);
            });

            const processedSubtitles = [];
            const filenameSet = new Set(); // Dùng để theo dõi tên tệp đã sử dụng

            subtitleTexts.forEach((text, i) => {
                const originalTitle = subtitlesToDownload[i][0];
                const setId = subtitlesToDownload[i][2]; // Lấy setIdStr
                const originalUrl = subtitlesToDownload[i][1];

                let processedText = text;
                if (targetFormat === 'ass') {
                    processedText = convertLrcToAss(text);
                }

                // Tạo tên tệp duy nhất bằng cách kết hợp tên đã làm sạch và setId
                // Ví dụ: "TenTap_setId.lrc" hoặc "TenTap_setId.ass"
                let baseFilename = sanitizeFilename(originalTitle);
                let uniqueFilename = `${baseFilename}_${setId}.${targetFormat}`;

                // Nếu tên tệp đã tồn tại (mặc dù đã thêm setId, vẫn có thể xảy ra nếu setIdStr có trùng lặp hoặc rất ngắn),
                // thêm một hậu tố số. Mặc dù khả năng này thấp với setIdStr, nhưng tốt hơn là có.
                let counter = 1;
                let finalFilename = uniqueFilename;
                while (filenameSet.has(finalFilename)) {
                    finalFilename = `${baseFilename}_${setId}_${counter}.${targetFormat}`;
                    counter++;
                }
                filenameSet.add(finalFilename);

                processedSubtitles.push({
                    title: originalTitle, // Tên gốc để hiển thị
                    url: originalUrl,
                    content: processedText,
                    format: targetFormat,
                    filenameInZip: finalFilename // Tên tệp sẽ được sử dụng trong ZIP
                });
            });

            // Tạo nội dung CSV
            const CSVContent = "\ufeff文件名,tải xuống liên kết\n" +
                               processedSubtitles.map(s => `${s.filenameInZip},${s.url}`).join("\n") + // Sử dụng filenameInZip
                               `\n\n(C) ChatGPT Script by Ne\nĐóng gói thời gian：${new Date().toISOString()}`;
            const CSVBlob = new zip.TextReader(CSVContent);

            // Thêm tệp vào zip
            const addPromises = [
                zipWriter.add("filelist.csv", CSVBlob),
                ...processedSubtitles.map(s =>
                    zipWriter.add(s.filenameInZip, new zip.TextReader(s.content)) // Sử dụng filenameInZip
                )
            ];

            // Hiển thị thanh tiến trình cho quá trình nén
            const swalProgressBar = Swal.fire({
                title: `Đang đóng gói phụ đề ${targetFormat.toUpperCase()}...`,
                html: `0% hoàn thành<br><progress id="swal-zip-progress-subtitle" max="100" value="0"></progress>`,
                allowOutsideClick: false,
                allowEscapeKey: false,
                showConfirmButton: false,
                willOpen: () => {
                    Swal.showLoading();
                }
            });

            await allProgress(addPromises, p => {
                const progressBar = document.getElementById('swal-zip-progress-subtitle');
                if (progressBar) {
                    progressBar.value = p;
                    Swal.update({
                        html: `${p.toFixed(2)}% hoàn thành<br><progress id="swal-zip-progress-subtitle" max="100" value="${p}"></progress>`
                    });
                }
            }).catch(e => {
                throw new Error(`Lỗi khi thêm tệp phụ đề vào ZIP: ${e.message}`);
            });
            swalProgressBar.then(() => Swal.close()); // Đóng thanh tiến trình

            downloadFile(await zipWriter.close(), `Manbo_Subtitles_${sanitizeFilename(dramaTitle)}_${targetFormat.toUpperCase()}.zip`);
            toast.fire({ title: `Tải phụ đề ${targetFormat.toUpperCase()} hoàn tất!`, icon: 'success' });

        } catch (e) {
            toast.fire({ title: `Lỗi khi đóng gói phụ đề ${targetFormat.toUpperCase()}.`, icon: 'error', text: e.message });
            isDownloading = false;
        }
    };


    // --- Logic tải ảnh (API setPic & DOM cụ thể) ---

    /**
     * Trích xuất URL ảnh từ các phần tử DOM cụ thể.
     * @returns {string[]} Một mảng các URL ảnh tìm thấy trong các phần tử DOM được chỉ định.
     */
    function getImagesFromSpecificDOM() {
        const urls = new Set(); // Sử dụng Set để tự động xử lý trùng lặp

        // 1. Lấy từ background-image của div.filter-bg-image
        document.querySelectorAll('div.filter-bg-image').forEach(div => {
            const style = div.style.backgroundImage;
            if (style) {
                const match = style.match(/url\(['"]?(.*?)['"]?\)/);
                if (match && match[1]) {
                    urls.add(match[1].replace(/\?.*/, '')); // Thêm và loại bỏ các tham số truy vấn
                }
            }
        });

        // 2. Lấy từ src của img.bgimg
        document.querySelectorAll('img.bgimg').forEach(img => {
            if (img.src) {
                urls.add(img.src.replace(/\?.*/, '')); // Thêm và loại bỏ các tham số truy vấn
            }
        });

        // Lọc để đảm bảo chúng từ kilamanbo.com nếu cần, mặc dù các lớp cụ thể đã thu hẹp nó
        return Array.from(urls).filter(url => url.includes('img.kilamanbo.com'));
    }

    /**
     * Cập nhật `imageData` toàn cầu cho tập hiện tại.
     * Phiên bản này kết hợp các URL API mới (từ chi tiết tập hiện tại) và các URL DOM mới được cạo.
     * @param {string[]} [newApiUrlsFromCurrentEpisode=[]] - Các URL ảnh mới để thêm từ API cho tập hiện tại.
     */
    function updateCurrentEpisodeImageList(newApiUrlsFromCurrentEpisode = []) {
        const domUrls = getImagesFromSpecificDOM();
        // Kết hợp các URL mới từ API với các URL DOM hiện có, loại bỏ trùng lặp
        imageData = [...new Set([...imageData, ...newApiUrlsFromCurrentEpisode, ...domUrls])];
        console.log("Danh sách ảnh tập hiện tại (API & DOM cụ thể):", imageData);
    }

    /**
     * Bắt đầu quá trình nén và tải xuống ảnh.
     * @param {string[]} list - Mảng các URL ảnh.
     * @param {string} fileNamePrefix - Tiền tố cho tên tệp zip.
     */
    const startZipImages = async (list, fileNamePrefix) => {
        if (isDownloading) {
            return toast.fire({ title: 'Đang tải về, vui lòng chờ...', icon: 'warning' });
        }
        isDownloading = true;

        if (list.length === 0) {
            toast.fire({ title: 'Không tìm thấy ảnh để tải.', icon: 'error' });
            isDownloading = false;
            return;
        }

        const zipWriter = new zip.ZipWriter(new zip.BlobWriter("application/zip"));
        toast.fire({ title: 'Đang đóng gói ảnh...', icon: 'info' });

        try {
            const imageBlobs = await Promise.all(list.map(url => fetchFile(url, 'blob'))).catch(e => {
                throw new Error(`Lỗi tải ảnh: ${e.message}`);
            });

            // Sử dụng Set để đảm bảo tên tệp duy nhất trong ZIP
            const addedFilenames = new Set();
            const addPromises = [];

            list.forEach((url, i) => {
                const parts = url.split('/');
                const originalFilename = parts[parts.length - 1].split('?')[0]; // Lấy tên tệp và loại bỏ các tham số truy vấn
                let filename = originalFilename;
                let counter = 1;

                // Tạo tên tệp duy nhất nếu tên gốc đã tồn tại
                while (addedFilenames.has(filename)) {
                    const extIndex = originalFilename.lastIndexOf('.');
                    if (extIndex > -1) {
                        filename = `${originalFilename.substring(0, extIndex)}_${counter}${originalFilename.substring(extIndex)}`;
                    } else {
                        filename = `${originalFilename}_${counter}`;
                    }
                    counter++;
                }
                addedFilenames.add(filename);
                addPromises.push(zipWriter.add(filename, new zip.BlobReader(imageBlobs[i])));
            });

            const swalProgressBar = Swal.fire({
                title: 'Đang đóng gói ảnh...',
                html: `0% hoàn thành<br><progress id="swal-zip-progress" max="100" value="0"></progress>`,
                allowOutsideClick: false,
                allowEscapeKey: false,
                showConfirmButton: false,
                willOpen: () => {
                    Swal.showLoading();
                }
            });

            await allProgress(addPromises, p => {
                const progressBar = document.getElementById('swal-zip-progress');
                if (progressBar) {
                    progressBar.value = p;
                    Swal.update({
                        html: `${p.toFixed(2)}% hoàn thành<br><progress id="swal-zip-progress" max="100" value="${p}"></progress>`
                    });
                }
            }).catch(e => {
                throw new Error(`Lỗi khi thêm tệp vào ZIP: ${e.message}`);
            });
            swalProgressBar.then(() => Swal.close()); // Đóng thanh tiến trình

            downloadFile(await zipWriter.close(), `${sanitizeFilename(fileNamePrefix)}_Images.zip`);
            toast.fire({ title: 'Tải ảnh hoàn tất!', icon: 'success' });

        } catch (e) {
            toast.fire({ title: 'Lỗi khi đóng gói hoặc tải ảnh.', icon: 'error', text: e.message });
            isDownloading = false;
        }
    };

    // --- Tạo bảng điều khiển UI ---

    let panelBodyElement = null; // Biến toàn cục để lưu trữ phần tử panel-body

    /**
     * Điều chỉnh chiều cao tối đa của panel-body dựa trên chiều cao cửa sổ.
     */
    function adjustPanelHeight() {
        if (!panelBodyElement) return;

        // Lấy tham chiếu đến panel chính và header
        const panel = document.getElementById('manbo-downloader-panel');
        const header = panel.querySelector('.panel-header');

        if (!panel || !header) return;

        // Tính toán khoảng trống còn lại cho body
        // 20px * 2 là top/bottom: 20% + 20px (panel top) + 20px (panel bottom)
        const panelVerticalPadding = 30; // 15px top + 15px bottom padding của panel
        const headerHeight = header.offsetHeight;
        const panelTopOffset = panel.offsetTop;
        const windowHeight = window.innerHeight;

        // Chiều cao tối đa khả dụng cho toàn bộ panel, trừ đi một biên an toàn (ví dụ: 20px)
        const availableHeightForPanel = windowHeight - panelTopOffset - 20;

        // Chiều cao tối đa cho panelBodyElement
        // Lấy chiều cao tối đa của panel, trừ đi chiều cao header và padding
        const maxBodyHeight = availableHeightForPanel - headerHeight - panelVerticalPadding;

        panelBodyElement.style.maxHeight = `${Math.max(100, maxBodyHeight)}px`; // Đảm bảo tối thiểu 100px
    }

    /**
     * Tạo và thêm bảng điều khiển tải xuống chính vào trang.
     */
    function createDownloaderPanel() {
        if (document.getElementById('manbo-downloader-panel')) {
            return; // Bảng điều khiển đã tồn tại
        }

        const panel = document.createElement('div');
        panel.id = 'manbo-downloader-panel';
        document.body.appendChild(panel); // Thêm panel trước để nó có thể được điều khiển

        // Tiêu đề bảng điều khiển
        const panelHeader = document.createElement('div');
        panelHeader.classList.add('panel-header');
        panel.appendChild(panelHeader);

        const panelTitle = document.createElement('div');
        panelTitle.classList.add('panel-title');
        panelTitle.innerHTML = '<span>💖</span> Manbo Downloader';
        panelHeader.appendChild(panelTitle);

        // Nút toggle nội bộ panel (thu gọn/mở rộng nội dung)
        const internalToggleButton = document.createElement('button');
        internalToggleButton.classList.add('toggle-button');
        internalToggleButton.innerHTML = '▼'; // Mũi tên xuống
        panelHeader.appendChild(internalToggleButton);

        // Thân bảng điều khiển (nội dung có thể thu gọn)
        panelBodyElement = document.createElement('div'); // Gán vào biến toàn cục
        panelBodyElement.classList.add('panel-body');
        panel.appendChild(panelBodyElement);

        // --- Phần phụ đề ---
        const subtitleSectionTitle = document.createElement('div');
        subtitleSectionTitle.classList.add('panel-section-title');
        subtitleSectionTitle.innerHTML = '<i>🐾</i> Tải phụ đề:'; // Biểu tượng đổi thành dấu chân
        panelBodyElement.appendChild(subtitleSectionTitle);

        // Phụ đề LRC (Tải tất cả) - Giả sử Lrc là loại phụ đề chính cho Manbo
        const btnDownloadAllLRC = document.createElement('button');
        btnDownloadAllLRC.classList.add('download-option-btn');
        btnDownloadAllLRC.innerHTML = '<i></i> Tải phụ đề LRC (Toàn bộ Drama)';
        btnDownloadAllLRC.querySelector('i').classList.add('icon-json-srt'); // Tái sử dụng biểu tượng cho tải phụ đề chung
        panelBodyElement.appendChild(btnDownloadAllLRC);
        btnDownloadAllLRC.onclick = () => {
            if (subtitleData.length === 0) return Swal.fire('Không có dữ liệu phụ đề', 'Bạn đã vào trang chi tiết drama chính chưa?', 'error');
            startZipSubtitles(subtitleData, currentDramaTitle, 'lrc');
        };

        // Tải phụ đề ASS (Tải tất cả) - Nút mới
        const btnDownloadAllASS = document.createElement('button');
        btnDownloadAllASS.classList.add('download-option-btn');
        btnDownloadAllASS.innerHTML = '<i></i> Tải phụ đề ASS (Toàn bộ Drama)';
        btnDownloadAllASS.querySelector('i').classList.add('icon-ass'); // Sử dụng icon-ass
        panelBodyElement.appendChild(btnDownloadAllASS);
        btnDownloadAllASS.onclick = () => {
            if (subtitleData.length === 0) return Swal.fire('Không có dữ liệu phụ đề', 'Bạn đã vào trang chi tiết drama chính chưa?', 'error');
            startZipSubtitles(subtitleData, currentDramaTitle, 'ass');
        };

        // Tải phụ đề LRC tập hiện tại
        const btnDownloadCurrentEpisodeLRC = document.createElement('button');
        btnDownloadCurrentEpisodeLRC.classList.add('download-option-btn');
        btnDownloadCurrentEpisodeLRC.innerHTML = '<i></i> Tải phụ đề LRC (Tập hiện tại)';
        btnDownloadCurrentEpisodeLRC.querySelector('i').classList.add('icon-lrc'); // Sử dụng icon-lrc cho phụ đề đơn
        panelBodyElement.appendChild(btnDownloadCurrentEpisodeLRC);
        btnDownloadCurrentEpisodeLRC.onclick = async () => {
            if (isDownloading) {
                return toast.fire({ title: 'Đang tải về, vui lòng chờ...', icon: 'warning' });
            }
            if (!currentEpisodeLrcUrl) {
                return Swal.fire('Không tìm thấy phụ đề LRC', 'Hãy đảm bảo bạn đang ở trang chi tiết của một tập và phụ đề đã tải.', 'error');
            }
            isDownloading = true;
            toast.fire({ title: 'Đang tải phụ đề LRC tập hiện tại...', icon: 'info' });
            try {
                const lrcText = await fetchFile(currentEpisodeLrcUrl, 'text');
                // Sử dụng currentEpisodeTitle và DramaTitle để tạo tên tệp duy nhất và rõ ràng
                const filename = `${sanitizeFilename(currentDramaTitle)}_${sanitizeFilename(currentEpisodeTitle)}.lrc`;
                downloadFile(new Blob([lrcText], { type: 'text/plain;charset=utf-8' }), filename);
                toast.fire({ title: 'Tải phụ đề LRC tập hiện tại hoàn tất!', icon: 'success' });
            } catch (e) {
                toast.fire({ title: 'Lỗi khi tải phụ đề LRC tập hiện tại.', icon: 'error', text: e.message });
            } finally {
                isDownloading = false;
            }
        };

        // Tải phụ đề ASS tập hiện tại
        const btnDownloadCurrentEpisodeASS = document.createElement('button');
        btnDownloadCurrentEpisodeASS.classList.add('download-option-btn');
        btnDownloadCurrentEpisodeASS.innerHTML = '<i></i> Tải phụ đề ASS (Tập hiện tại)';
        btnDownloadCurrentEpisodeASS.querySelector('i').classList.add('icon-ass'); // Sử dụng icon-ass
        panelBodyElement.appendChild(btnDownloadCurrentEpisodeASS);
        btnDownloadCurrentEpisodeASS.onclick = async () => {
            if (isDownloading) {
                return toast.fire({ title: 'Đang tải về, vui lòng chờ...', icon: 'warning' });
            }
            if (!currentEpisodeLrcUrl) {
                return Swal.fire('Không tìm thấy phụ đề LRC để chuyển đổi', 'Hãy đảm bảo bạn đang ở trang chi tiết của một tập và phụ đề đã tải.', 'error');
            }
            isDownloading = true;
            toast.fire({ title: 'Đang tải và chuyển đổi phụ đề ASS...', icon: 'info' });
            try {
                const lrcText = await fetchFile(currentEpisodeLrcUrl, 'text');
                const assText = convertLrcToAss(lrcText);
                const filename = `${sanitizeFilename(currentDramaTitle)}_${sanitizeFilename(currentEpisodeTitle)}.ass`;
                downloadFile(new Blob([assText], { type: 'text/plain;charset=utf-8' }), filename);
                toast.fire({ title: 'Tải phụ đề ASS tập hiện tại hoàn tất!', icon: 'success' });
            } catch (e) {
                toast.fire({ title: 'Lỗi khi tải hoặc chuyển đổi phụ đề ASS.', icon: 'error', text: e.message });
            } finally {
                isDownloading = false;
            }
        };


        // --- Phần ảnh ---
        const imageSectionTitle = document.createElement('div');
        imageSectionTitle.classList.add('panel-section-title');
        imageSectionTitle.innerHTML = '<i></i> Tải ảnh Drama:';
        imageSectionTitle.querySelector('i').classList.add('icon-all-images');
        panelBodyElement.appendChild(imageSectionTitle);

        // Tải ảnh tập hiện tại
        const btnDownloadCurrentEpisodeImages = document.createElement('button');
        btnDownloadCurrentEpisodeImages.classList.add('download-option-btn');
        btnDownloadCurrentEpisodeImages.innerHTML = '<i></i> Tải ảnh tập hiện tại';
        btnDownloadCurrentEpisodeImages.querySelector('i').classList.add('icon-single-image'); // Biểu tượng mới
        panelBodyElement.appendChild(btnDownloadCurrentEpisodeImages);
        btnDownloadCurrentEpisodeImages.onclick = () => {
            updateCurrentEpisodeImageList(); // Cạo ảnh DOM một lần nữa ngay trước khi hành động
            if (imageData.length === 0) return Swal.fire('Không tìm thấy ảnh', 'Hãy cuộn trang hoặc chờ tải API để có thêm ảnh.', 'error');
            startZipImages(imageData, `${sanitizeFilename(currentDramaTitle)}_${sanitizeFilename(currentEpisodeTitle)}`);
        };

        // Tải TẤT CẢ ảnh Drama (toàn bộ các tập)
        const btnDownloadAllDramaImages = document.createElement('button');
        btnDownloadAllDramaImages.classList.add('download-option-btn');
        btnDownloadAllDramaImages.innerHTML = '<i></i> Tải TẤT CẢ ảnh Drama';
        btnDownloadAllDramaImages.querySelector('i').classList.add('icon-all-images');
        panelBodyElement.appendChild(btnDownloadAllDramaImages);
        btnDownloadAllDramaImages.onclick = () => {
            if (allDramaImageData.length === 0) return Swal.fire('Không tìm thấy ảnh', 'Chưa có dữ liệu ảnh cho toàn bộ drama. Hãy đảm bảo bạn đã vào trang chi tiết drama chính.', 'warning');
            startZipImages(allDramaImageData, `${sanitizeFilename(currentDramaTitle)}_All_Drama`);
        };


        // --- Chức năng chuyển đổi bảng điều khiển nội bộ (thu gọn nội dung) ---
        internalToggleButton.addEventListener('click', () => {
            panelBodyElement.classList.toggle('collapsed'); // Chỉ thu gọn phần body
            internalToggleButton.innerHTML = panelBodyElement.classList.contains('collapsed') ? '►' : '▼'; // Thay đổi mũi tên
            // Không cần điều chỉnh chiều cao tổng thể của panel khi chỉ thu gọn nội dung bên trong
        });

        // Tạo nút ẩn/hiện chính (nút nổi ngoài cùng)
        const mainToggleButton = document.createElement('button');
        mainToggleButton.id = 'manbo-downloader-toggle-main-button';
        mainToggleButton.innerHTML = '💖'; // Biểu tượng trái tim hoặc mũi tên
        document.body.appendChild(mainToggleButton);

        mainToggleButton.addEventListener('click', () => {
            const panel = document.getElementById('manbo-downloader-panel');
            const isPanelCollapsed = panel.classList.toggle('collapsed');
            // Cập nhật biểu tượng nút chính
            mainToggleButton.innerHTML = isPanelCollapsed ? '💖' : '❌'; // Ví dụ: hiện trái tim khi ẩn, X khi hiện
            // Nếu panel được hiện lại, điều chỉnh chiều cao
            if (!isPanelCollapsed) {
                setTimeout(adjustPanelHeight, 300); // Đảm bảo transition CSS kết thúc
            }
        });

        adjustPanelHeight(); // Điều chỉnh chiều cao ban đầu khi panel được tạo
    }

    // --- Móc API để thu thập dữ liệu ---
    ajaxHooker.hook(request => {
        // Chặn các phản hồi để thu thập dữ liệu phụ đề và hình ảnh
        request.response = res => {
            if (res.responseText) {
                try {
                    const data = JSON.parse(res.responseText);
                    let apiImageUrlsFromResponse = []; // Tạm thời lưu trữ URL ảnh từ phản hồi API này

                    // Case 1: dramaSetDetail (chi tiết của một tập cụ thể) - ví dụ: kilamanbo.com/web_manbo/dramaSetDetail
                    if (request.url.includes('dramaSetDetail')) {
                        const episodeData = data?.data;
                        if (episodeData) {
                            currentEpisodeLrcUrl = episodeData.setLrcUrl || null;
                            currentEpisodeTitle = episodeData.setTitle || episodeData.setName || 'Tập hiện tại';
                            currentDramaTitle = episodeData.radioDramaResp?.title || currentDramaTitle;

                            const setList = episodeData.radioDramaResp?.setRespList || [];
                            // subtitleData: [tiêu đề, lrcUrl, setIdStr]
                            subtitleData = setList.map(a => [a.subTitle || a.setTitle || a.setName, a.setLrcUrl, a.setIdStr]);

                            const uniqueAllImages = new Set();
                            setList.forEach(ep => {
                                if (ep.setPic) {
                                    uniqueAllImages.add(ep.setPic.replace(/\?.*/, ''));
                                }
                            });
                            if (episodeData.radioDramaResp?.coverPic) {
                                uniqueAllImages.add(episodeData.radioDramaResp.coverPic.replace(/\?.*/, ''));
                            }
                            allDramaImageData = Array.from(uniqueAllImages);

                            // Lấy ảnh từ `picUrlSet` hoặc `backgroundImgUrl` cho tập hiện tại
                            if (episodeData.picUrlSet) {
                                apiImageUrlsFromResponse.push(...episodeData.picUrlSet);
                            }
                            if (episodeData.backgroundImgUrl) {
                                apiImageUrlsFromResponse.push(episodeData.backgroundImgUrl);
                            }
                        }
                    }
                    // Case 2: dramaDetail (trang drama chính) - ví dụ: kilamanbo.com/manbo/pc/detail
                    else if (request.url.includes('dramaDetail')) {
                        const radioDramaResp = data?.data?.radioDramaResp || data?.data;
                        const setList = radioDramaResp?.setRespList || [];
                        // subtitleData: [tiêu đề, lrcUrl, setIdStr]
                        subtitleData = setList.map(a => [a.subTitle || a.setTitle || a.setName, a.setLrcUrl, a.setIdStr]);
                        currentDramaTitle = radioDramaResp?.title || 'Manbo';

                        currentEpisodeLrcUrl = null;
                        currentEpisodeTitle = 'Tập hiện tại';

                        const uniqueAllImages = new Set();
                        setList.forEach(episode => {
                            if (episode.setPic) {
                                uniqueAllImages.add(episode.setPic.replace(/\?.*/, ''));
                            }
                        });
                        if (radioDramaResp?.coverPic) {
                            uniqueAllImages.add(radioDramaResp.coverPic.replace(/\?.*/, ''));
                        }
                        allDramaImageData = Array.from(uniqueAllImages);

                        // Lấy ảnh từ `backgroundImgList` cho trang drama chính
                        if (radioDramaResp?.backgroundImgList) {
                            apiImageUrlsFromResponse.push(...radioDramaResp.backgroundImgList.map(i => i.backPic));
                        }
                    }
                    // Case 3: kilamanbo.com/web_manbo/getBackground - API riêng để lấy ảnh cho tập hiện tại
                    else if (request.url.includes('web_manbo/getBackground') && data?.data?.backgroundImgList) {
                        apiImageUrlsFromResponse.push(...data.data.backgroundImgList.map(i => i.backPic));
                        console.log("Đã phát hiện ảnh từ getBackground:", apiImageUrlsFromResponse);
                    }

                    // Sau khi xử lý tất cả các loại phản hồi API, cập nhật danh sách ảnh của tập hiện tại
                    // Chỉ thêm các URL hợp lệ và loại bỏ các tham số truy vấn
                    const cleanApiUrls = apiImageUrlsFromResponse.filter(Boolean).map(url => url.replace(/\?.*/, ''));
                    if (cleanApiUrls.length > 0) {
                        updateCurrentEpisodeImageList(cleanApiUrls);
                    }

                    console.log("Tiêu đề Drama hiện tại:", currentDramaTitle);
                    console.log("Tiêu đề tập hiện tại:", currentEpisodeTitle);
                    console.log("URL LRC tập hiện tại:", currentEpisodeLrcUrl);
                    console.log("Dữ liệu phụ đề (Tất cả các tập):", subtitleData);
                    console.log("Dữ liệu ảnh toàn bộ Drama:", allDramaImageData);

                } catch (e) {
                    console.error("Manbo Downloader: Lỗi phân tích JSON hoặc trích xuất dữ liệu:", e);
                }
            }
        };
    });

    // --- Thiết lập ban đầu ---
    document.addEventListener('DOMContentLoaded', () => {
        // Tạo bảng điều khiển khi DOM đã sẵn sàng
        createDownloaderPanel();

        // Đảm bảo nút ẩn hiện chính được tạo và panel ẩn đi ban đầu
        const mainToggleButton = document.getElementById('manbo-downloader-toggle-main-button');
        const panel = document.getElementById('manbo-downloader-panel');
        if (panel && mainToggleButton) {
            // Ẩn panel ban đầu và cập nhật biểu tượng nút
            panel.classList.add('collapsed');
            mainToggleButton.innerHTML = '💖'; // Biểu tượng ban đầu khi ẩn
        }

        // Thực hiện cập nhật danh sách ảnh ban đầu cho tập hiện tại sau khi DOM sẵn sàng
        // Điều này sẽ thu thập các ảnh từ DOM khi trang vừa tải.
        updateCurrentEpisodeImageList();

        // Lắng nghe sự kiện resize của cửa sổ để điều chỉnh chiều cao panel
        window.addEventListener('resize', adjustPanelHeight);

        // Thiết lập MutationObserver để bắt các ảnh được tải động cho tập hiện tại
        const observer = new MutationObserver((mutationsList, observer) => {
            for (const mutation of mutationsList) {
                // Kiểm tra xem có node mới nào được thêm vào DOM không
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    // Nếu có, chạy lại updateCurrentEpisodeImageList để nắm bắt các ảnh DOM mới
                    // và đảm bảo các ảnh từ API (nếu đã được thêm vào `imageData` trước đó) vẫn còn.
                    updateCurrentEpisodeImageList();
                }
            }
        });

        // Quan sát body để tìm các thay đổi (ví dụ: các phần tử mới được thêm vào)
        // Cần quan sát cả `subtree` để bắt các thay đổi sâu trong DOM.
        observer.observe(document.body, { childList: true, subtree: true });

        // Fallback để nắm bắt bất kỳ ảnh còn lại nào từ DOM sau một khoảng thời gian ngắn
        // Điều này giúp ích cho các phần tử có thể tải muộn hơn một chút sau khi DOM sẵn sàng ban đầu,
        // hoặc nếu một số API bị bỏ lỡ.
        setTimeout(() => {
            updateCurrentEpisodeImageList();
        }, 1500);
    });

})();
