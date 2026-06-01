const params = new URLSearchParams(location.search);
let taskId = params.get("task") || "TASK-0107";
let currentState = null;

const $ = (selector) => document.querySelector(selector);

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers || {}),
    },
  });
  const data = await response.json();
  if (!response.ok || data.ok === false) throw new Error(data.error || `Request failed: ${response.status}`);
  return data;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderTasks(tasks) {
  const select = $("#taskSelect");
  const known = tasks.includes(taskId) ? tasks : [taskId, ...tasks];
  select.innerHTML = known.map((task) => `<option value="${escapeHtml(task)}"${task === taskId ? " selected" : ""}>${escapeHtml(task)}</option>`).join("");
}

function renderPlatformSounds(sounds) {
  const list = $("#platformList");
  if (!sounds.length) {
    list.innerHTML = `<div class="item"><p>No platform sounds saved yet.</p></div>`;
    return;
  }
  list.innerHTML = sounds.map((sound) => `
    <article class="item">
      <div class="item-head">
        <div>
          <h3>${escapeHtml(sound.title)}</h3>
          <p class="meta">${escapeHtml(sound.platform)} ${sound.creator ? " / " + escapeHtml(sound.creator) : ""}</p>
        </div>
        <span class="badge warn">${escapeHtml(sound.rights_status)}</span>
      </div>
      ${sound.url ? `<p class="meta"><a href="${escapeHtml(sound.url)}" target="_blank" rel="noreferrer">${escapeHtml(sound.url)}</a></p>` : ""}
      <p class="meta">Start ${escapeHtml(sound.start_time)} / ${escapeHtml(sound.suggested_volume)}</p>
      ${sound.notes ? `<p>${escapeHtml(sound.notes)}</p>` : ""}
      <button class="ghost" data-delete="${escapeHtml(sound.id)}">Delete</button>
    </article>
  `).join("");
  list.querySelectorAll("[data-delete]").forEach((button) => {
    button.addEventListener("click", async () => {
      await api("/api/platform-sounds/delete", {
        method: "POST",
        body: JSON.stringify({ task_id: taskId, id: button.dataset.delete }),
      });
      await loadState();
    });
  });
}

function renderLicensed(assets) {
  $("#licensedList").innerHTML = assets.map((asset) => `
    <article class="asset">
      <div class="item-head">
        <div>
          <h3>${escapeHtml(asset.title || asset.asset_id)}</h3>
          <p class="meta">${escapeHtml(asset.type)} / ${escapeHtml(asset.category || "uncategorized")}</p>
        </div>
        <span class="badge ${asset.can_embed ? "ok" : "warn"}">${asset.can_embed ? "embeddable" : "review"}</span>
      </div>
      <p class="meta">${escapeHtml(asset.path)}</p>
      <p class="meta">License: ${escapeHtml(asset.license_type || "unknown")}</p>
      <p class="meta">Platforms: ${escapeHtml((asset.allowed_platforms || []).join(", ") || "not set")}</p>
      ${asset.notes ? `<p>${escapeHtml(asset.notes)}</p>` : ""}
    </article>
  `).join("");
}

function renderExports(exports) {
  $("#exportsList").innerHTML = exports.length
    ? exports.map((name) => `<div class="item"><strong>${escapeHtml(name)}</strong></div>`).join("")
    : `<div class="item"><p>No exports yet.</p></div>`;
}

function renderState() {
  $("#projectStatus").textContent = currentState.project_exists ? "Ready" : "Missing";
  $("#handoffStatus").textContent = currentState.handoff_exists ? "Created" : "Needed";
  renderTasks(currentState.tasks);
  renderPlatformSounds(currentState.platform_sounds);
  renderLicensed(currentState.licensed_assets);
  renderExports(currentState.exports);
  $("#audioPlan").textContent = JSON.stringify(currentState.audio_plan, null, 2);
}

async function loadState() {
  currentState = await api(`/api/state?task=${encodeURIComponent(taskId)}`);
  renderState();
}

function bindTabs() {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((item) => item.classList.remove("active"));
      document.querySelectorAll(".panel").forEach((item) => item.classList.remove("active"));
      tab.classList.add("active");
      document.getElementById(tab.dataset.tab).classList.add("active");
    });
  });
}

function bindForms() {
  $("#taskSelect").addEventListener("change", async (event) => {
    taskId = event.target.value;
    history.replaceState(null, "", `?task=${encodeURIComponent(taskId)}`);
    await loadState();
  });

  $("#soundForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const sound = Object.fromEntries(form.entries());
    await api("/api/platform-sounds", {
      method: "POST",
      body: JSON.stringify({ task_id: taskId, sound }),
    });
    event.currentTarget.reset();
    await loadState();
  });

  $("#generateHandoff").addEventListener("click", async () => {
    await api("/api/handoff", {
      method: "POST",
      body: JSON.stringify({ task_id: taskId }),
    });
    await loadState();
  });

  $("#youtubeForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const q = new FormData(event.currentTarget).get("q");
    const result = await api(`/api/youtube-search?q=${encodeURIComponent(q)}`);
    $("#youtubeMessage").textContent = result.message;
    if (result.open_url) {
      $("#youtubeResults").innerHTML = `<article class="item"><a href="${escapeHtml(result.open_url)}" target="_blank" rel="noreferrer">Open YouTube search</a></article>`;
      return;
    }
    $("#youtubeResults").innerHTML = result.results.map((item) => `
      <article class="item">
        <div class="item-head">
          <div>
            <h3>${escapeHtml(item.title)}</h3>
            <p class="meta">${escapeHtml(item.channel)} / ${escapeHtml(item.published_at)}</p>
          </div>
          <button class="ghost" data-save-youtube="${escapeHtml(item.url)}">Save reference</button>
        </div>
        <p class="meta"><a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.url)}</a></p>
      </article>
    `).join("");
    $("#youtubeResults").querySelectorAll("[data-save-youtube]").forEach((button, index) => {
      button.addEventListener("click", async () => {
        const item = result.results[index];
        await api("/api/platform-sounds", {
          method: "POST",
          body: JSON.stringify({
            task_id: taskId,
            sound: {
              platform: "youtube",
              title: item.title,
              creator: item.channel,
              url: item.url,
              usage_mode: "reference_only",
              rights_status: "manual_review_required",
              notes: "Saved from YouTube metadata search. Do not embed unless rights are confirmed.",
            },
          }),
        });
        await loadState();
      });
    });
  });
}

bindTabs();
bindForms();
loadState().catch((error) => {
  document.body.innerHTML = `<pre>${escapeHtml(error.message)}</pre>`;
});
