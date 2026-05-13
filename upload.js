const BACKEND_URL = "https://voicepress-live-api.onrender.com";
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024; // 100MB limit

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
  function doUpload(file) {
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
    const formData = new FormData();
    formData.append("file", file);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${BACKEND_URL}/upload`, true);
    xhr.timeout = 1000 * 60 * 30; // 30 mins

    xhr.onloadstart = () => {
      setStage("Uploading…", { progress: "determinate", disableButton: true });
      if (window.voicepress && window.voicepress.showProgress)
        window.voicepress.showProgress(0);
      startProcessingPolling();
    };

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) {
        const percent = (e.loaded / e.total) * 100;
        if (progressBar) progressBar.value = percent;
        if (window.voicepress && window.voicepress.showProgress)
          window.voicepress.showProgress(percent);
        setStage(`Uploading…`, { progress: "determinate" });
      }
    });

    xhr.upload.addEventListener("load", () => {
      setStage("Processing…", { progress: "indeterminate" });
      if (window.voicepress && window.voicepress.showProgress)
        window.voicepress.showProgress(100);
    });

    xhr.onerror = () => {
      stopProcessingPolling();
      setStage("❌ Network error.", { progress: "hide", disableButton: false });
      Toastify({
        text: "Network error connecting to server.",
        duration: 4000,
        gravity: "top",
        position: "right",
        backgroundColor: "#ff4d4f",
      }).showToast();
    };

    xhr.ontimeout = () => {
      stopProcessingPolling();
      setStage("⏰ Request timed out.", {
        progress: "hide",
        disableButton: false,
      });
      Toastify({
        text: "Request timed out.",
        duration: 4000,
        gravity: "top",
        position: "right",
        backgroundColor: "#ff4d4f",
      }).showToast();
    };

    xhr.onload = () => {
      stopProcessingPolling();
      if (uploadBtn) uploadBtn.disabled = false;
      if (window.voicepress && window.voicepress.hideProgress)
        window.voicepress.hideProgress();

      let response = {};
      try {
        response = JSON.parse(xhr.responseText || "{}");
      } catch {
        setStage("❌ Server error.", { progress: "hide" });
        Toastify({
          text: "Invalid server response",
          duration: 3000,
          gravity: "top",
          position: "right",
          backgroundColor: "#ff4d4f",
        }).showToast();
        return;
      }

      if (xhr.status === 200) {
        setStage("Done", { progress: "hide" });
        Toastify({
          text: "Processing complete",
          duration: 2500,
          gravity: "top",
          position: "right",
          backgroundColor: "#16a34a",
        }).showToast();
        if (window.voicepress && window.voicepress.showResults)
          window.voicepress.showResults(response);
      } else {
        const friendly =
          xhr.status === 429
            ? "🚦 System busy. Try again."
            : xhr.status === 413
              ? "📦 File too large."
              : response.error || "❌ Processing failed.";
        setStage("Error", { progress: "hide" });
        Toastify({
          text: friendly,
          duration: 4000,
          gravity: "top",
          position: "right",
          backgroundColor: "#ff4d4f",
        }).showToast();
      }

      if (fileInput) fileInput.value = "";
      if (uploadLabel)
        uploadLabel.textContent = "Drag & drop or click to select an MP4";
    };

    xhr.send(formData);
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
