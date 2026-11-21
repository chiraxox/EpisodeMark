(() => {
  const STORAGE_KEY = "series_tracker_items_v1";
  const SAVE_INTERVAL_MS = 5000;
  const MIN_SAVE_SECONDS = 15;
  const END_BUFFER_SECONDS = 30;

  let pageContext = {
    url: window.location.href,
    title: document.title || "Untitled Episode"
  };

  // If inside an iframe, request the top-level episode page URL & title
  if (window.self !== window.top) {
    window.top.postMessage({ type: "SERIES_TRACKER_GET_CONTEXT" }, "*");
  }

  window.addEventListener("message", (event) => {
    if (!event.data || typeof event.data !== "object") return;

    if (event.data.type === "SERIES_TRACKER_GET_CONTEXT" && event.source) {
      event.source.postMessage(
        {
          type: "SERIES_TRACKER_CONTEXT",
          url: window.location.href,
          title: document.title || "Untitled Episode"
        },
        "*"
      );
    }

    if (event.data.type === "SERIES_TRACKER_CONTEXT") {
      if (event.data.url) pageContext.url = event.data.url;
      if (event.data.title) pageContext.title = event.data.title;
    }
  });

  function formatTime(totalSeconds) {
    const secs = Math.max(0, Math.floor(totalSeconds));
    const hrs = Math.floor(secs / 3600);
    const mins = Math.floor((secs % 3600) / 60);
    const remSecs = secs % 60;
    const pad = (n) => String(n).padStart(2, "0");
    return hrs > 0 ? `${hrs}:${pad(mins)}:${pad(remSecs)}` : `${pad(mins)}:${pad(remSecs)}`;
  }

  function storageGetAll() {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get([STORAGE_KEY], (result) => {
          resolve(result && result[STORAGE_KEY] ? result[STORAGE_KEY] : {});
        });
      } catch {
        resolve({});
      }
    });
  }

  function storageSetAll(data) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.set({ [STORAGE_KEY]: data }, () => resolve());
      } catch {
        resolve();
      }
    });
  }

  function getEntryKey() {
    // Normalize hash/query noise slightly while keeping episode identifiers
    return pageContext.url.split("#")[0];
  }

  async function saveProgress(video) {
    if (!video || !Number.isFinite(video.currentTime)) return;
    const currentTime = Math.floor(video.currentTime);
    const duration = Number.isFinite(video.duration) && video.duration > 0 ? Math.floor(video.duration) : 0;

    if (currentTime < MIN_SAVE_SECONDS) return;
    if (duration > 0 && duration - currentTime <= END_BUFFER_SECONDS) return;

    const all = await storageGetAll();
    const key = getEntryKey();

    all[key] = {
      key,
      url: pageContext.url,
      title: (document.title && window.self === window.top) ? document.title : pageContext.title,
      currentTime,
      duration,
      updatedAt: Date.now()
    };

    await storageSetAll(all);
  }

  function createResumeButton(video, savedSeconds) {
    const parent = video.parentElement;
    if (!parent) return;

    const existing = parent.querySelector(".st-resume-banner");
    if (existing) existing.remove();

    const computedParentPos = window.getComputedStyle(parent).position;
    if (computedParentPos === "static") {
      parent.style.position = "relative";
    }

    const container = document.createElement("div");
    container.className = "st-resume-banner";
    container.style.cssText = [
      "position: absolute",
      "bottom: 64px",
      "left: 18px",
      "z-index: 2147483647",
      "display: inline-flex",
      "align-items: center",
      "gap: 8px",
      "background: rgba(15, 23, 42, 0.92)",
      "color: #f8fafc",
      "border: 1px solid rgba(255, 255, 255, 0.18)",
      "border-radius: 999px",
      "padding: 8px 14px",
      "font-family: system-ui, -apple-system, sans-serif",
      "font-size: 13px",
      "font-weight: 600",
      "box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45)",
      "backdrop-filter: blur(6px)"
    ].join(";");

    const resumeBtn = document.createElement("button");
    resumeBtn.type = "button";
    resumeBtn.textContent = `Resume at ${formatTime(savedSeconds)}?`;
    resumeBtn.style.cssText = [
      "all: unset",
      "cursor: pointer",
      "color: #38bdf8",
      "font-weight: 700"
    ].join(";");

    const dismissBtn = document.createElement("button");
    dismissBtn.type = "button";
    dismissBtn.textContent = "✕";
    dismissBtn.title = "Dismiss";
    dismissBtn.style.cssText = [
      "all: unset",
      "cursor: pointer",
      "color: #94a3b8",
      "font-size: 12px",
      "padding-left: 4px"
    ].join(";");

    resumeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const applySeek = () => {
        if (Number.isFinite(video.duration) && video.duration > 0) {
          video.currentTime = Math.min(savedSeconds, Math.max(0, video.duration - 5));
        } else {
          video.currentTime = savedSeconds;
        }
        video.play().catch(() => {});
      };

      if (video.readyState >= 1) {
        applySeek();
      } else {
        video.addEventListener("loadedmetadata", applySeek, { once: true });
      }
      container.remove();
    });

    dismissBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      container.remove();
    });

    container.appendChild(resumeBtn);
    container.appendChild(dismissBtn);
    parent.appendChild(container);
  }

  const attachedVideos = new WeakSet();

  async function attachVideoWatcher(video) {
    if (attachedVideos.has(video)) return;
    attachedVideos.add(video);

    const all = await storageGetAll();
    const saved = all[getEntryKey()];
    if (saved && typeof saved.currentTime === "number" && saved.currentTime >= MIN_SAVE_SECONDS) {
      createResumeButton(video, saved.currentTime);
    }

    setInterval(() => {
      if (!video.paused && !video.ended) {
        saveProgress(video);
      }
    }, SAVE_INTERVAL_MS);

    video.addEventListener("pause", () => saveProgress(video));
    window.addEventListener("beforeunload", () => saveProgress(video));
  }

  function scanForVideos() {
    document.querySelectorAll("video").forEach((video) => {
      attachVideoWatcher(video);
    });
  }

  scanForVideos();

  const observer = new MutationObserver(() => {
    scanForVideos();
  });

  observer.observe(document.documentElement || document.body, {
    childList: true,
    subtree: true
  });
})();