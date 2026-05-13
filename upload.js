const BACKEND_URL = "https://voicepress-live-api.onrender.com";
// client-enforced upload size limit (100 MB) to match free-tier constraints
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
// const BACKEND_URL = "http://127.0.0.1:8000"; // for local testing

document.addEventListener("DOMContentLoaded", () => {
  const fileInput = document.getElementById("videoFile");
  const uploadBtn = document.getElementById("uploadBtn");
  const clearBtn = document.getElementById("clearBtn");
  const uploadLabel = document.getElementById("uploadLabel") || document.querySelector('.upload-area strong');
  const progressWrap = document.getElementById("progressWrap");
  const progressBar = document.getElementById("uploadProgress");
  const outputs = document.getElementById("outputs");
  const processingState = document.getElementById("processingState");
  const statusText = document.getElementById("statusText");

  // ---- helpers ----
  let processingPoller = null;
  let normalPoller = null;

  // Update simple UI stage using the new layout
  function setStage(message, opts = {}) {
    if (statusText) statusText.textContent = message;
    if (opts.progress === "hide") {
      if (progressWrap) progressWrap.style.display = "none";
    } else if (opts.progress === "determinate") {
      if (progressWrap) progressWrap.style.display = "block";
      if (progressBar && !progressBar.hasAttribute("value")) progressBar.value = 0;
    } else if (opts.progress === "indeterminate") {
      if (progressWrap) progressWrap.style.display = "block";
      if (progressBar) progressBar.removeAttribute("value");
    }
    if (opts.disableButton !== undefined && uploadBtn)
      uploadBtn.disabled = opts.disableButton;
    if (processingState) processingState.textContent = message;
  }

  // speed up status polling while a job is running
  async function pollStatusOnce() {
    try {
      const res = await fetch(`${BACKEND_URL}/status`, { cache: "no-store" });
      const data = await res.json();
      // server returns {status: "idle"|"processing", stage: "idle|extracting|transcribing|summarizing"}
      const stage =
        data.stage || (data.status === "processing" ? "processing" : "idle");

      if (stage !== "idle") {
        const map = {
          extracting: "🔴 Extracting audio…",
          transcribing: "🔴 Transcribing…",
          summarizing: "🔴 Summarizing & generating posts…",
          processing: "🔴 Processing…",
        };
        statusLight.textContent = map[stage] || "🔴 Processing…";
        statusLight.style.color = "#e74c3c";
        submitButton.disabled = true;
      } else {
        statusLight.textContent =
          "🟢 System is ready. You can upload a video file.";
        statusLight.style.color = "#2ecc71";
        submitButton.disabled = false;
      }
    } catch {
      statusLight.textContent =
        "⚠️ Unable to retrieve system status. Please refresh.";
      statusLight.style.color = "#f39c12";
    }
  }

  function startNormalPolling() {
    stopProcessingPolling();
    if (normalPoller) clearInterval(normalPoller);
    normalPoller = setInterval(pollStatusOnce, 5000);
    pollStatusOnce();
  }

  function startProcessingPolling() {
    if (normalPoller) clearInterval(normalPoller);
    if (processingPoller) clearInterval(processingPoller);
    processingPoller = setInterval(pollStatusOnce, 1500);
    pollStatusOnce();
  }

  function stopProcessingPolling() {
    if (processingPoller) {
      clearInterval(processingPoller);
      processingPoller = null;
    }
  }

  // show selected file name
  // update label with filename
  fileInput.addEventListener("change", () => {
    const f = fileInput.files[0];
    if (uploadLabel) uploadLabel.textContent = f ? f.name : "Drag & drop or click to select an MP4";
    if (uploadBtn) uploadBtn.disabled = !f;
  });

  // clear button
  if (clearBtn) clearBtn.addEventListener('click', ()=>{
    fileInput.value = '';
    if (uploadLabel) uploadLabel.textContent = 'Drag & drop or click to select an MP4';
    if (uploadBtn) uploadBtn.disabled = true;
  });

  // support drag & drop on the label area
  const uploadArea = document.querySelector('.upload-area');
  if (uploadArea) {
    uploadArea.addEventListener('dragover', (ev)=>{ ev.preventDefault(); uploadArea.style.opacity = 0.9; });
    uploadArea.addEventListener('dragleave', ()=>{ uploadArea.style.opacity = 1; });
    uploadArea.addEventListener('drop', (ev)=>{
      ev.preventDefault(); uploadArea.style.opacity = 1;
      const f = ev.dataTransfer.files && ev.dataTransfer.files[0];
      if (f && f.type && f.type.indexOf('video')===0) {
        // assign to file input
        const dt = new DataTransfer(); dt.items.add(f); fileInput.files = dt.files;
        fileInput.dispatchEvent(new Event('change'));
      } else {
        Toastify({text:'Please drop a valid MP4 video file',duration:3000,gravity:'top',position:'right',backgroundColor:'#ff4d4f'}).showToast();
      }
    });
  }

  // ---- upload handler ----
  // Listen for clicks or custom upload events
  function doUpload(file){
    if (!file) { Toastify({text:'No file selected',duration:2000,gravity:'top',position:'right',backgroundColor:'#ff4d4f'}).showToast(); return; }
    if (file.size > MAX_UPLOAD_BYTES) {
      const sizeMB = (MAX_UPLOAD_BYTES/1024/1024).toFixed(0);
      const msg = `🚫 File too large — max ${sizeMB} MB on this plan. Trim or compress and try again.`;
      Toastify({text:msg,duration:6000,gravity:'top',position:'right',backgroundColor:'#ff4d4f'}).showToast();
      setStage(msg, { progress: 'hide', disableButton: false });
      return;
    }

    // reset UI
    if (outputs) outputs.innerHTML = '';
    if (uploadBtn) uploadBtn.disabled = true;

    const formData = new FormData();
    formData.append('file', file);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${BACKEND_URL}/upload`, true);
    xhr.timeout = 1000 * 60 * 30; // 30 minutes

    xhr.onloadstart = () => {
      setStage('Uploading…', { progress: 'determinate', disableButton: true });
      if (window.voicepress && window.voicepress.showProgress) window.voicepress.showProgress(0);
      startProcessingPolling();
      console.log('📤 Upload started:', file.name);
    };

    // upload progress
    xhr.upload.addEventListener('progress', (e)=>{
      if (e.lengthComputable) {
        const percent = (e.loaded / e.total) * 100;
        if (progressBar) progressBar.value = percent;
        if (window.voicepress && window.voicepress.showProgress) window.voicepress.showProgress(percent);
        setStage(`Uploading… ${percent.toFixed(1)}%`, { progress: 'determinate' });
      }
    });

    xhr.upload.addEventListener('load', ()=>{
      setStage('Upload complete. Processing…', { progress: 'indeterminate' });
      if (window.voicepress && window.voicepress.showProgress) window.voicepress.showProgress(100);
      console.log('📦 Upload finished; server is processing…');
    });

    xhr.onerror = () => {
      stopProcessingPolling();
      const statusCode = xhr.status || 0;
      const looksLikeEdge = statusCode === 0 || statusCode === 502 || statusCode === 503 || statusCode === 504;
      const msg = looksLikeEdge ? '🚨 Server unavailable. Retry shortly.' : '❌ Upload failed due to a network error.';
      setStage(msg, { progress: 'hide', disableButton: false });
      Toastify({text:msg,duration:4000,gravity:'top',position:'right',backgroundColor:'#ff4d4f'}).showToast();
    };

    xhr.ontimeout = ()=>{
      stopProcessingPolling();
      setStage('⏰ Request timed out while processing.', { progress: 'hide', disableButton: false });
      Toastify({text:'Request timed out',duration:4000,gravity:'top',position:'right',backgroundColor:'#ff4d4f'}).showToast();
    };

    xhr.onload = ()=>{
      stopProcessingPolling();
      if (uploadBtn) uploadBtn.disabled = false;
      if (window.voicepress && window.voicepress.hideProgress) window.voicepress.hideProgress();

      let response = {};
      try { response = JSON.parse(xhr.responseText || '{}'); } catch {
        setStage('❌ Server returned invalid JSON.', { progress:'hide' });
        Toastify({text:'Invalid server response',duration:3000,gravity:'top',position:'right',backgroundColor:'#ff4d4f'}).showToast();
        if (fileInput) fileInput.value = '';
        if (uploadLabel) uploadLabel.textContent = 'Drag & drop or click to select an MP4';
        startNormalPolling();
        return;
      }

      if (xhr.status === 200) {
        setStage('✅ Processing complete!', { progress: 'hide' });
        Toastify({text:'Processing complete',duration:2500,gravity:'top',position:'right',backgroundColor:'#16a34a'}).showToast();
        // populate UI via helper
        if (window.voicepress && window.voicepress.showResults) window.voicepress.showResults(response);
        // also render legacy output section if present
        renderContent(response);
      } else {
        const friendly = xhr.status === 429 ? '🚦 System busy. Try again.' : xhr.status === 413 ? '📦 File too large.' : (response.error || '❌ Upload/processing failed.');
        setStage(friendly, { progress:'hide' });
        Toastify({text:friendly,duration:4000,gravity:'top',position:'right',backgroundColor:'#ff4d4f'}).showToast();
      }

      if (fileInput) fileInput.value = '';
      if (uploadLabel) uploadLabel.textContent = 'Drag & drop or click to select an MP4';
      startNormalPolling();
    };

    xhr.send(formData);
  }

  // wire upload button and custom event
  if (uploadBtn) uploadBtn.addEventListener('click', ()=> doUpload(fileInput.files[0]));
  window.addEventListener('voicepress.upload', (e)=>{ if (e.detail && e.detail.file) doUpload(e.detail.file); });
    if (!file) {
      console.warn("🚫 No file selected.");
      return;
    }

    // reset UI
    output.innerHTML = "";
    submitButton.disabled = true;

    const formData = new FormData();
    formData.append("file", file);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${BACKEND_URL}/upload`, true);
    xhr.timeout = 1000 * 60 * 30; // 30 minutes

    xhr.onloadstart = () => {
      setStage("Uploading…", {
        showSpinner: true,
        progress: "determinate",
        disableButton: true,
      });
      progressBar.value = 0;
      startProcessingPolling(); // begin tighter polling immediately
      console.log("📤 Upload started:", file.name);
    };

    // upload progress (deterministic)
    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) {
        const percent = (e.loaded / e.total) * 100;
        progressBar.value = percent;
        statusEl.textContent = `Uploading… ${percent.toFixed(1)}%`;
      }
    });

    // when the upload bytes are done but server keeps working
    xhr.upload.addEventListener("load", () => {
      setStage(
        "Upload complete. Processing (extracting → transcribing → summarizing)…",
        {
          showSpinner: true,
          progress: "indeterminate",
          disableButton: true,
        }
      );
      console.log("📦 Upload finished; server is processing…");
    });

    // network-level errors
    xhr.onerror = () => {
      stopProcessingPolling();
      const statusCode = xhr.status || 0;
      const looksLikeEdge =
        statusCode === 0 ||
        statusCode === 502 ||
        statusCode === 503 ||
        statusCode === 504;
      const msg = looksLikeEdge
        ? "🚨 The server is restarting or temporarily unavailable. Please retry in a few seconds."
        : "❌ Upload failed due to a network error.";
      setStage(msg, {
        showSpinner: false,
        progress: "hide",
        disableButton: false,
      });
      output.innerHTML = `<p style="color:red;">${msg}</p>`;
    };

    xhr.ontimeout = () => {
      stopProcessingPolling();
      setStage(
        "⏰ Request timed out while processing. Please try again later.",
        {
          showSpinner: false,
          progress: "hide",
          disableButton: false,
        }
      );
      output.innerHTML = `<p style="color:red;">The server took too long to respond.</p>`;
    };

    // final response
    xhr.onload = () => {
      stopProcessingPolling();
      submitButton.disabled = false;

      spinner.style.display = "none";
      progressBar.style.display = "none";

      let response = {};
      try {
        response = JSON.parse(xhr.responseText || "{}");
      } catch {
        setStage("❌ Server returned invalid JSON.", {
          showSpinner: false,
          progress: "hide",
        });
        output.innerHTML = `<p style="color:red;">Invalid server response</p>`;
        fileInput.value = "";
        fileNameDisplay.textContent = "No file chosen";
        startNormalPolling();
        return;
      }

      if (xhr.status === 200) {
        setStage("✅ Processing complete!", {
          showSpinner: false,
          progress: "hide",
        });
        renderContent(response);
      } else {
        const friendly =
          xhr.status === 429
            ? "🚦 System is busy. Please wait for the current job to finish."
            : xhr.status === 413
            ? "📦 File too large for the server limits."
            : xhr.status === 502 || xhr.status === 503 || xhr.status === 504
            ? "🚨 The server restarted or ran out of memory during processing."
            : response.error || "❌ Upload/processing failed.";

        setStage(friendly, { showSpinner: false, progress: "hide" });
        output.innerHTML = `<p style="color:red;">${friendly}</p>`;
      }

      fileInput.value = "";
      fileNameDisplay.textContent = "No file chosen";
      startNormalPolling();
    };

    xhr.send(formData);
  });

  // ---- background status light ----
  function initStatusLight() {
    if (normalPoller) clearInterval(normalPoller);
    normalPoller = setInterval(pollStatusOnce, 5000);
    pollStatusOnce();
  }

  initStatusLight();
});

// copy button handler for new UI (delegation)
document.addEventListener('click', (e)=>{
  const btn = e.target.closest && e.target.closest('button.copy');
  if (!btn) return;
  const targetId = btn.getAttribute('data-copy-target');
  if (!targetId) return;
  const el = document.getElementById(targetId);
  if (!el) return;
  const txt = el.tagName === 'PRE' ? el.textContent : el.innerText || el.textContent;
  navigator.clipboard.writeText(txt || '').then(()=>{
    Toastify({text:'✅ Copied to clipboard',duration:2000,gravity:'top',position:'right',backgroundColor:'#16a34a'}).showToast();
  }).catch(()=>{
    Toastify({text:'❌ Copy failed',duration:2000,gravity:'top',position:'right',backgroundColor:'#ff4d4f'}).showToast();
  });
});

// ---- render GPT response content (unchanged) ----
function renderContent(data) {
  const output = document.getElementById("output");

  function createSection(title, content, copyText) {
    return `
      <div class="card">
        <h2>${title}</h2>
        <pre>${escapeHtml(content)}</pre>
        <button class="copy-btn" onclick="copyToClipboard(\`${escapeHtml(
          copyText
        )}\`)">📋 Copy</button>
        <div style="clear: both;"></div>
      </div>
    `;
  }

  const quotes = (data.quotes || []).join("\n\n");
  const linkedin = (data.social_posts?.linkedin || []).join("\n\n");
  const instagram = (data.social_posts?.instagram || []).join("\n\n");

  output.innerHTML = `
    <h1>🧠 GPT Interview Summary</h1>
    ${createSection("📌 Compelling Quotes", quotes, quotes)}
    ${createSection("📄 Summary", data.summary || "", data.summary || "")}
    ${createSection("💼 LinkedIn Posts", linkedin, linkedin)}
    ${createSection("📸 Instagram Captions", instagram, instagram)}
    ${createSection(
      "📝 Full Transcript",
      data.transcript || "",
      data.transcript || ""
    )}
  `;
}

// ---- utils ----
function escapeHtml(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function copyToClipboard(text) {
  navigator.clipboard
    .writeText(text)
    .then(() => {
      Toastify({
        text: "✅ Copied to clipboard!",
        duration: 2000,
        gravity: "top",
        position: "right",
        backgroundColor: "#4CAF50",
      }).showToast();
    })
    .catch(() => {
      Toastify({
        text: "❌ Failed to copy.",
        duration: 2000,
        gravity: "top",
        position: "right",
        backgroundColor: "#FF4C4C",
      }).showToast();
    });
}
