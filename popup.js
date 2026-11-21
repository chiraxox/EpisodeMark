const STORAGE_KEY = "series_tracker_items_v1";

function formatTime(totalSeconds) {
  const secs = Math.max(0, Math.floor(totalSeconds || 0));
  const hrs = Math.floor(secs / 3600);
  const mins = Math.floor((secs % 3600) / 60);
  const remSecs = secs % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return hrs > 0 ? `${hrs}:${pad(mins)}:${pad(remSecs)}` : `${pad(mins)}:${pad(remSecs)}`;
}

function getAllItems() {
  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEY], (res) => {
      resolve(res && res[STORAGE_KEY] ? res[STORAGE_KEY] : {});
    });
  });
}

function saveAllItems(items) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEY]: items }, () => resolve());
  });
}

async function render() {
  const listEl = document.getElementById("list");
  const all = await getAllItems();
  const entries = Object.values(all).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

  listEl.innerHTML = "";

  if (entries.length === 0) {
    listEl.innerHTML = `<div class="empty">No saved episodes yet. Start watching a video and progress will save automatically.</div>`;
    return;
  }

  entries.forEach((entry) => {
    const card = document.createElement("div");
    card.className = "item";

    const titleEl = document.createElement("div");
    titleEl.className = "title";
    titleEl.textContent = entry.title || entry.url;
    titleEl.title = entry.title || entry.url;

    const metaEl = document.createElement("div");
    metaEl.className = "meta";
    const durText = entry.duration > 0 ? ` / ${formatTime(entry.duration)}` : "";
    metaEl.textContent = `Stopped at ${formatTime(entry.currentTime)}${durText}`;

    const actionsEl = document.createElement("div");
    actionsEl.className = "actions";

    const resumeBtn = document.createElement("button");
    resumeBtn.className = "btn-resume";
    resumeBtn.type = "button";
    resumeBtn.textContent = "Open Episode";
    resumeBtn.addEventListener("click", () => {
      chrome.tabs.create({ url: entry.url });
    });

    const delBtn = document.createElement("button");
    delBtn.className = "btn-delete";
    delBtn.type = "button";
    delBtn.textContent = "Delete";
    delBtn.addEventListener("click", async () => {
      const updated = await getAllItems();
      delete updated[entry.key];
      await saveAllItems(updated);
      render();
    });

    actionsEl.appendChild(resumeBtn);
    actionsEl.appendChild(delBtn);

    card.appendChild(titleEl);
    card.appendChild(metaEl);
    card.appendChild(actionsEl);
    listEl.appendChild(card);
  });
}

document.getElementById("clearAllBtn").addEventListener("click", async () => {
  await saveAllItems({});
  render();
});

render();