(() => {
  'use strict';
 
  /* ---------- Hằng số ---------- */
  const MIN_GAP = 0.1;                       // đoạn cắt tối thiểu (giây)
  const WARN_SIZE = 500 * 1024 * 1024;       // cảnh báo file lớn
  const MAX_SIZE = 2000 * 1024 * 1024;       // ffmpeg.wasm 0.11 giới hạn bộ nhớ ~2GB
 
  const MODE_HINTS = {
    fast: 'Rất nhanh, không giảm chất lượng. Điểm bắt đầu có thể lệch vài khung hình (đến vài giây) vì chỉ cắt được tại keyframe.',
    precise: 'Cắt đúng từng khung hình. Video được mã hóa lại (H.264 CRF 18, gần như không thấy khác biệt) nên chậm hơn nhiều.'
  };
 
  /* ---------- Phần tử DOM ---------- */
  const $ = (id) => document.getElementById(id);
  const uploader = $('uploader');
  const fileInfo = $('fileInfo');
  const videoPlayer = $('videoPlayer');
  const editorControls = $('editorControls');
  const startSlider = $('startSlider');
  const startInput = $('startInput');
  const endSlider = $('endSlider');
  const endInput = $('endInput');
  const setStartBtn = $('setStartBtn');
  const setEndBtn = $('setEndBtn');
  const durationInfo = $('durationInfo');
  const previewBtn = $('previewBtn');
  const modeSelect = $('mode');
  const modeHint = $('modeHint');
  const cutBtn = $('cutBtn');
  const statusBox = $('statusBox');
  const downloadLink = $('downloadLink');
 
  /* ---------- Trạng thái ---------- */
  let ffmpeg = null;
  let videoFile = null;
  let videoDuration = 0;
  let startTime = 0;
  let endTime = 0;
  let previewing = false;
  let currentVideoUrl = null;
  let currentOutputUrl = null;
 
  /* ---------- Tiện ích ---------- */
  const round2 = (n) => Math.round(n * 100) / 100;
  const clamp = (n, min, max) => Math.min(Math.max(n, min), max);
 
  function formatTime(sec) {
    const s = Math.max(0, sec);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const rest = (s % 60).toFixed(2).padStart(5, '0');
    return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + rest;
  }
 
  function formatSize(bytes) {
    if (bytes >= 1024 ** 3) return (bytes / 1024 ** 3).toFixed(2) + ' GB';
    return (bytes / 1024 ** 2).toFixed(1) + ' MB';
  }
 
  function setStatus(message, type) {
    statusBox.textContent = message;
    statusBox.className = 'status' + (type ? ' ' + type : '');
  }
 
  function setBusy(busy) {
    cutBtn.disabled = busy;
    uploader.disabled = busy;
    modeSelect.disabled = busy;
  }
 
  function revokeUrl(url) {
    if (url) URL.revokeObjectURL(url);
  }
 
  /* ---------- Cập nhật thời gian ---------- */
  function renderTimes() {
    startSlider.value = startTime;
    startInput.value = startTime;
    endSlider.value = endTime;
    endInput.value = endTime;
    durationInfo.textContent =
      `Đoạn cắt: ${formatTime(startTime)} → ${formatTime(endTime)} ` +
      `(dài ${formatTime(endTime - startTime)})`;
  }
 
  function setStart(value, seek = true) {
    const v = parseFloat(value);
    if (Number.isNaN(v)) return renderTimes();
    startTime = clamp(round2(v), 0, round2(endTime - MIN_GAP));
    renderTimes();
    if (seek) videoPlayer.currentTime = startTime;
  }
 
  function setEnd(value, seek = true) {
    const v = parseFloat(value);
    if (Number.isNaN(v)) return renderTimes();
    endTime = clamp(round2(v), round2(startTime + MIN_GAP), videoDuration);
    renderTimes();
    if (seek) videoPlayer.currentTime = endTime;
  }
 
  /* ---------- 1. Tải file ---------- */
  uploader.addEventListener('change', () => {
    if (!uploader.files.length) return;
    const file = uploader.files[0];
 
    if (file.size > MAX_SIZE) {
      setStatus('File quá lớn (' + formatSize(file.size) + '). Giới hạn khoảng 2 GB.', 'error');
      editorControls.hidden = false;
      cutBtn.disabled = true;
      return;
    }
 
    videoFile = file;
    revokeUrl(currentVideoUrl);
    currentVideoUrl = URL.createObjectURL(file);
    videoPlayer.src = currentVideoUrl;
    videoPlayer.style.display = 'block';
 
    fileInfo.textContent = `${file.name} · ${formatSize(file.size)}`;
    editorControls.hidden = false;
    cutBtn.disabled = true; // mở lại khi đọc xong metadata
    downloadLink.hidden = true;
    revokeUrl(currentOutputUrl);
    currentOutputUrl = null;
 
    if (file.size > WARN_SIZE) {
      setStatus('File khá lớn, trình duyệt có thể chậm hoặc hết bộ nhớ khi cắt.', '');
    } else {
      setStatus('', '');
    }
  });
 
  videoPlayer.addEventListener('loadedmetadata', () => {
    videoDuration = round2(videoPlayer.duration);
    [startSlider, startInput, endSlider, endInput].forEach((el) => {
      el.max = videoDuration;
    });
    startTime = 0;
    endTime = videoDuration;
    renderTimes();
    cutBtn.disabled = false;
  });
 
  videoPlayer.addEventListener('error', () => {
    setStatus('Trình duyệt không phát được video này. Hãy thử file MP4 (H.264).', 'error');
    cutBtn.disabled = true;
  });
 
  /* ---------- 2. Điều khiển thời gian ---------- */
  startSlider.addEventListener('input', (e) => setStart(e.target.value));
  startInput.addEventListener('change', (e) => setStart(e.target.value));
  endSlider.addEventListener('input', (e) => setEnd(e.target.value));
  endInput.addEventListener('change', (e) => setEnd(e.target.value));
  setStartBtn.addEventListener('click', () => setStart(videoPlayer.currentTime, false));
  setEndBtn.addEventListener('click', () => setEnd(videoPlayer.currentTime, false));
 
  modeSelect.addEventListener('change', () => {
    modeHint.textContent = MODE_HINTS[modeSelect.value];
  });
  modeHint.textContent = MODE_HINTS[modeSelect.value];
 
  /* ---------- Xem trước đoạn cắt ---------- */
  previewBtn.addEventListener('click', () => {
    previewing = true;
    videoPlayer.currentTime = startTime;
    videoPlayer.play();
  });
 
  videoPlayer.addEventListener('timeupdate', () => {
    if (previewing && videoPlayer.currentTime >= endTime) {
      videoPlayer.pause();
      previewing = false;
    }
  });
 
  videoPlayer.addEventListener('pause', () => {
    if (videoPlayer.currentTime < endTime) previewing = false;
  });
 
  /* ---------- 3. Phím tắt ---------- */
  document.addEventListener('keydown', (e) => {
    if (!videoFile || editorControls.hidden) return;
 
    const tag = e.target.tagName;
    const type = e.target.type;
    if (tag === 'SELECT' || tag === 'BUTTON') return;
    if (tag === 'INPUT' && type !== 'range' && type !== 'file') return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
 
    const step = e.shiftKey ? 1 : 0.1;
 
    switch (e.key.toLowerCase()) {
      case ' ':
        e.preventDefault();
        previewing = false;
        videoPlayer.paused ? videoPlayer.play() : videoPlayer.pause();
        break;
      case 'arrowleft':
        e.preventDefault();
        videoPlayer.currentTime = Math.max(0, videoPlayer.currentTime - step);
        break;
      case 'arrowright':
        e.preventDefault();
        videoPlayer.currentTime = Math.min(videoDuration, videoPlayer.currentTime + step);
        break;
      case 'i':
        e.preventDefault();
        setStart(videoPlayer.currentTime, false);
        break;
      case 'o':
        e.preventDefault();
        setEnd(videoPlayer.currentTime, false);
        break;
    }
  });
 
  /* ---------- 4. Cắt bằng FFmpeg ---------- */
  async function ensureFFmpeg() {
    if (typeof SharedArrayBuffer === 'undefined') {
      throw new Error(
        'Trình duyệt chưa bật SharedArrayBuffer. Cần header COOP/COEP (xem vercel.json) và mở trang qua HTTPS.'
      );
    }
    if (!ffmpeg) {
      const { createFFmpeg } = FFmpeg;
      ffmpeg = createFFmpeg({ log: true });
      ffmpeg.setProgress(({ ratio }) => {
        if (ratio >= 0 && ratio <= 1) {
          setStatus(`Đang xử lý... ${Math.round(ratio * 100)}%`, '');
        }
      });
    }
    if (!ffmpeg.isLoaded()) {
      setStatus('Đang tải nhân FFmpeg (lần đầu có thể mất vài giây)...', '');
      await ffmpeg.load();
    }
  }
 
  function safeExtension(name) {
    const ext = (name.split('.').pop() || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    return ext && ext.length <= 5 ? ext : 'mp4';
  }
 
  function buildArgs(precise, inName, outName) {
    const duration = (endTime - startTime).toFixed(3);
    const seek = ['-ss', startTime.toFixed(3), '-i', inName, '-t', duration];
 
    if (precise) {
      return [
        ...seek,
        '-c:v', 'libx264', '-crf', '18', '-preset', 'veryfast',
        '-c:a', 'aac', '-b:a', '192k',
        '-movflags', '+faststart',
        outName
      ];
    }
    return [...seek, '-c', 'copy', '-avoid_negative_ts', 'make_zero', outName];
  }
 
  cutBtn.addEventListener('click', async () => {
    if (!videoFile) return;
 
    setBusy(true);
    downloadLink.hidden = true;
    previewing = false;
    videoPlayer.pause();
 
    const precise = modeSelect.value === 'precise';
    const inExt = safeExtension(videoFile.name);
    const inName = 'input.' + inExt;
    const outExt = precise ? 'mp4' : inExt;
    const outName = 'output.' + outExt;
 
    try {
      await ensureFFmpeg();
 
      setStatus('Đang đọc file vào bộ nhớ...', '');
      ffmpeg.FS('writeFile', inName, await FFmpeg.fetchFile(videoFile));
 
      setStatus('Đang cắt video...', '');
      await ffmpeg.run(...buildArgs(precise, inName, outName));
 
      let data;
      try {
        data = ffmpeg.FS('readFile', outName);
      } catch {
        throw new Error('FFmpeg không tạo được file đầu ra. Xem Console (F12) để biết chi tiết.');
      }
      if (!data || !data.length) {
        throw new Error('File đầu ra rỗng. Thử đổi sang chế độ "Cắt chính xác".');
      }
 
      const mime = precise ? 'video/mp4' : (videoFile.type || 'video/' + outExt);
      const blob = new Blob([data], { type: mime });
 
      revokeUrl(currentOutputUrl);
      currentOutputUrl = URL.createObjectURL(blob);
 
      const baseName = videoFile.name.replace(/\.[^.]+$/, '');
      downloadLink.href = currentOutputUrl;
      downloadLink.download = `cut_${baseName}.${outExt}`;
      downloadLink.textContent = `⬇️ Lưu video đã cắt (${formatSize(blob.size)})`;
      downloadLink.hidden = false;
 
      setStatus('Hoàn tất!', 'ok');
    } catch (err) {
      console.error(err);
      setStatus('Lỗi: ' + (err && err.message ? err.message : err), 'error');
    } finally {
      // Dọn file tạm trong bộ nhớ ảo của FFmpeg
      if (ffmpeg && ffmpeg.isLoaded()) {
        for (const name of [inName, outName]) {
          try { ffmpeg.FS('unlink', name); } catch { /* bỏ qua */ }
        }
      }
      setBusy(false);
      cutBtn.disabled = !videoFile || !videoDuration;
    }
  });
})();
 
