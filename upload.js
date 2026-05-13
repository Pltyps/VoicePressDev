const BACKEND_URL =
  window.VOICEPRESS_CONFIG?.API_URL || "https://voicepressdev.onrender.com";
const MAX_UPLOAD_BYTES = 3 * 1024 * 1024 * 1024; // 3 GB

document.addEventListener("DOMContentLoaded", () => {
  const fileInput = document.getElementById("videoFile");
  const uploadBtn = document.getElementById("uploadBtn");
  const clearBtn = document.getElementById("clearBtn");
  const uploadLabel =
    document.getElementById("uploadLabel") ||
    document.querySelector(".upload-area strong");
  const progressWrap = document.getElementById("progressWrap");
  const progressBar = document.getElementById("uploadProgress");
  const outputs = document.getElementById("outputs");
  const processingState = document.getElementById("processingState");

  const { FFmpeg } = window.FFmpegWASM;
  const { fetchFile } = window.FFmpegUtil;
  const ffmpeg = new FFmpeg();

  let processingPoller = null;

  function setStage(message, opts = {}) {
    if (opts.progress === "hide") {
      if (progressWrap) progressWrap.style.display = "none";
    } else if (opts.progress === "determinate") {
      if (progressWrap) progressWrap.style.display = "block";
      if (progressBar && !progressBar.hasAttribute("value"))
        progressBar.value = 0;
    } else if (opts.progress === "indeterminate") {
      if (progressWrap) progressWrap.style.display = "block";
      if (progressBar) progressBar.removeAttribute("value");
    }
    if (opts.disableButton !== undefined && uploadBtn)
      uploadBtn.disabled = opts.disableButton;
    if (processingState) processingState.textContent = message;
  }

  // Poll for detailed processing stages (Extracting -> Transcribing -> Summarizing)
  async function pollStatusOnce() {
    try {
      const res = await fetch(`${BACKEND_URL}/status`, { cache: "no-store" });
      const data = await res.json();
      const stage =
        data.stage || (data.status === "processing" ? "processing" : "idle");

      if (stage !== "idle" && processingState) {
        const map = {
          extracting: "Extracting audio…",
          transcribing: "Transcribing audio…",
          summarizing: "Generating summaries…",
          processing: "Processing…",
        };
        processingState.textContent = map[stage] || "Processing…";
      }
    } catch (e) {
      // Ignore polling errors
    }
  }

  function startProcessingPolling() {
    if (processingPoller) clearInterval(processingPoller);
    processingPoller = setInterval(pollStatusOnce, 1500);
  }

  function stopProcessingPolling() {
    if (processingPoller) {
      clearInterval(processingPoller);
      processingPoller = null;
    }
  }

  // Support drag & drop
  const uploadArea = document.querySelector(".upload-area");
  if (uploadArea) {
    uploadArea.addEventListener("dragover", (ev) => {
      ev.preventDefault();
      uploadArea.style.opacity = 0.9;
    });
    uploadArea.addEventListener("dragleave", () => {
      uploadArea.style.opacity = 1;
    });
    uploadArea.addEventListener("drop", (ev) => {
      ev.preventDefault();
      uploadArea.style.opacity = 1;
      const f = ev.dataTransfer.files && ev.dataTransfer.files[0];
      if (f && f.type && f.type.indexOf("video") === 0) {
        const dt = new DataTransfer();
        dt.items.add(f);
        fileInput.files = dt.files;
        fileInput.dispatchEvent(new Event("change"));
      } else {
        Toastify({
          text: "Please drop a valid MP4 video file",
          duration: 3000,
          gravity: "top",
          position: "right",
          backgroundColor: "#ff4d4f",
        }).showToast();
      }
    });
  }

  // Core Upload Handler
  async function doUpload(file) {
    if (!file) {
      Toastify({
        text: "No file selected",
        duration: 2000,
        gravity: "top",
        position: "right",
        backgroundColor: "#ff4d4f",
      }).showToast();
      return;
    }

    // 1. Check File Size (3.5GB limit)
    if (file.size > MAX_UPLOAD_BYTES) {
      const sizeMB = (MAX_UPLOAD_BYTES / 1024 / 1024).toFixed(0);
      const msg = `🚫 File too large — max ${sizeMB} MB. Trim or compress and try again.`;
      Toastify({
        text: msg,
        duration: 6000,
        gravity: "top",
        position: "right",
        backgroundColor: "#ff4d4f",
      }).showToast();
      setStage(msg, { progress: "hide", disableButton: false });
      return;
    }

    if (uploadBtn) uploadBtn.disabled = true;

    // 2. Check Video Duration (Max 55 mins for OpenAI's 25MB limit at 64k bitrate)
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = async function () {
      window.URL.revokeObjectURL(video.src);
      const durationMinutes = video.duration / 60;

      if (durationMinutes > 55) {
        setStage("🚫 Video is too long. Max duration is 55 minutes.", {
          progress: "hide",
          disableButton: false,
        });
        Toastify({
          text: "Video exceeds 55 minute limit.",
          duration: 6000,
          backgroundColor: "#ff4d4f",
        }).showToast();
        return;
      }

      // If duration is good, proceed to FFmpeg extraction
      await processAndUpload(file);
    };
    video.src = URL.createObjectURL(file);
  }

  // 3. The Core Processing and Upload Logic
  async function processAndUpload(file) {
    try {
      setStage("Loading processing engine...", { progress: "indeterminate" });

      if (!ffmpeg.loaded) {
        const { toBlobURL } = window.FFmpegUtil;
        const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";

        await ffmpeg.load({
          coreURL: await toBlobURL(
            `${baseURL}/ffmpeg-core.js`,
            "text/javascript",
          ),
          wasmURL: await toBlobURL(
            `${baseURL}/ffmpeg-core.wasm`,
            "application/wasm",
          ),
          workerURL: await toBlobURL(
            "https://unpkg.com/@ffmpeg/ffmpeg@0.12.6/dist/umd/814.ffmpeg.js",
            "text/javascript",
          ),
        });
      }

      setStage("Extracting audio locally...", { progress: "indeterminate" });
      await ffmpeg.writeFile(
        "input.mp4",
        await window.FFmpegUtil.fetchFile(file),
      );

      await ffmpeg.exec([
        "-i",
        "input.mp4",
        "-vn",
        "-ac",
        "1",
        "-b:a",
        "64k",
        "output.mp3",
      ]);

      const fileData = await ffmpeg.readFile("output.mp3");
      const audioBlob = new Blob([fileData.buffer], { type: "audio/mp3" });

      await ffmpeg.deleteFile("input.mp4");
      await ffmpeg.deleteFile("output.mp3");

      const formData = new FormData();
      formData.append("file", audioBlob, "audio.mp3");

      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${BACKEND_URL}/upload`, true);

      xhr.onloadstart = () => {
        setStage("Uploading extracted audio to AI...", {
          progress: "determinate",
        });
        startProcessingPolling();
      };

      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable && progressBar) {
          progressBar.value = (e.loaded / e.total) * 100;
        }
      });

      xhr.onload = () => {
        stopProcessingPolling();
        if (uploadBtn) uploadBtn.disabled = false;
        const response = JSON.parse(xhr.responseText || "{}");

        if (xhr.status === 200) {
          setStage("Done", { progress: "hide" });
          if (window.voicepress?.showResults)
            window.voicepress.showResults(response);
        } else {
          setStage("Error", { progress: "hide" });
        }
      };

      xhr.send(formData);
    } catch (error) {
      console.error(error);
      setStage("Error extracting audio locally.", { progress: "hide" });
      if (uploadBtn) uploadBtn.disabled = false;
    }
  }

  if (uploadBtn)
    uploadBtn.addEventListener("click", () => doUpload(fileInput.files[0]));
  window.addEventListener("voicepress.upload", (e) => {
    if (e.detail && e.detail.file) doUpload(e.detail.file);
  });
});

// Global copy button handler
document.addEventListener("click", (e) => {
  const btn = e.target.closest && e.target.closest("button.copy");
  if (!btn) return;
  const targetId = btn.getAttribute("data-copy-target");
  if (!targetId) return;
  const el = document.getElementById(targetId);
  if (!el) return;
  const txt =
    el.tagName === "PRE" ? el.textContent : el.innerText || el.textContent;
  navigator.clipboard
    .writeText(txt || "")
    .then(() => {
      Toastify({
        text: "✅ Copied to clipboard",
        duration: 2000,
        gravity: "top",
        position: "right",
        backgroundColor: "#16a34a",
      }).showToast();
    })
    .catch(() => {
      Toastify({
        text: "❌ Copy failed",
        duration: 2000,
        gravity: "top",
        position: "right",
        backgroundColor: "#ff4d4f",
      }).showToast();
    });
});
