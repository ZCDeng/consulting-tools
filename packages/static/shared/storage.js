(function(root) {
  const TOOL_BY_FILE = {
    "kano.html": { tool: "kano", key: "kano-state" },
    "ce-matrix.html": { tool: "ce", key: "ce-state" },
    "qfd.html": { tool: "qfd", key: "qfd-state" },
    "pugh.html": { tool: "pugh", key: "pugh-state" },
    "fmea.html": { tool: "fmea", key: "fmea-state" },
    "montecarlo.html": { tool: "montecarlo", key: "montecarlo-state" }
  };
  const params = new URLSearchParams(location.search);
  const file = (location.pathname.split("/").pop() || "index.html").toLowerCase();
  const meta = TOOL_BY_FILE[file] || null;
  const online = /^https?:$/.test(location.protocol);
  const state = {
    token: null,
    ready: false,
    queue: [],
    syncing: false,
    drainPromise: null,
    syncEnabled: false,
    currentProject: params.get("project") || localStorage.getItem("toolkit-current-project") || "",
    currentInstance: params.get("instance") || localStorage.getItem("toolkit-current-instance") || "default"
  };

  function mode() {
    return online ? "online" : "offline";
  }

  function sanitize(data) {
    if (!meta || !root.ToolkitDataSanitizer) return data;
    return root.ToolkitDataSanitizer.sanitizeToolData(meta.tool, data);
  }

  function parseAndSanitize(raw) {
    return sanitize(JSON.parse(raw));
  }

  function api(path, options) {
    const headers = { ...(options && options.headers) };
    if (options && options.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
    if (options && options.mutation !== false && options.method && options.method !== "GET") {
      headers["X-Toolkit-Token"] = state.token || "";
    }
    return fetch(path, { ...options, headers }).then(async response => {
      const text = await response.text();
      const payload = text ? JSON.parse(text) : {};
      if (!response.ok) throw new Error(payload.error || response.statusText);
      return payload;
    });
  }

  function fetchJson(path, options) {
    const headers = { ...(options && options.headers) };
    if (options && options.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
    if (options && options.mutation !== false && options.method && options.method !== "GET") {
      headers["X-Toolkit-Token"] = state.token || "";
    }
    return fetch(path, { ...options, headers }).then(async response => {
      const text = await response.text();
      const payload = text ? JSON.parse(text) : {};
      return { response, payload };
    });
  }

  function setContext(projectId, instance) {
    state.currentProject = projectId || "";
    state.currentInstance = instance || "default";
    if (projectId) localStorage.setItem("toolkit-current-project", projectId);
    localStorage.setItem("toolkit-current-instance", state.currentInstance);
  }

  async function ensureReady() {
    if (!online || state.ready) return;
    const res = await fetch("/token");
    const payload = await res.json();
    state.token = payload.token;
    await hydrateSelected();
    state.ready = true;
    state.syncEnabled = true;
    flushQueue();
  }

  function scheduleSave(value) {
    if (!online || !meta || !state.currentProject || !state.syncEnabled) return;
    const entry = {
      raw: value,
      projectId: state.currentProject,
      instance: state.currentInstance || "default"
    };
    const owner = `${entry.projectId}\u0000${entry.instance}`;
    state.queue = state.queue.filter(item => `${item.projectId}\u0000${item.instance}` !== owner);
    state.queue.push(entry);
    clearTimeout(state.timer);
    state.timer = setTimeout(flushQueue, 350);
  }

  async function flushQueue() {
    if (!online || !state.ready || !state.syncEnabled || !meta) return;
    if (state.drainPromise) return state.drainPromise;
    if (!state.queue.length) return;
    state.drainPromise = (async () => {
      state.syncing = true;
      clearTimeout(state.timer);
      try {
        while (state.queue.length) {
          const entries = state.queue;
          state.queue = [];
          for (let index = 0; index < entries.length; index += 1) {
            const entry = entries[index];
            try {
              await api(`/projects/${encodeURIComponent(entry.projectId)}/tooldata/${meta.tool}/${encodeURIComponent(entry.instance)}`, {
                method: "PUT",
                body: JSON.stringify({ data: parseAndSanitize(entry.raw) })
              });
            } catch (error) {
              state.queue = entries.slice(index).concat(state.queue);
              throw error;
            }
          }
        }
        root.dispatchEvent(new CustomEvent("toolkit-sync", { detail: { ok: true } }));
      } catch (error) {
        root.dispatchEvent(new CustomEvent("toolkit-sync", { detail: { ok: false, error: error.message } }));
        throw error;
      } finally {
        state.syncing = false;
        state.drainPromise = null;
      }
    })();
    return state.drainPromise;
  }

  const nativeSetItem = Storage.prototype.setItem;
  const nativeRemoveItem = Storage.prototype.removeItem;

  async function hydrateSelected() {
    if (!online || !meta || !state.currentProject) {
      state.syncEnabled = true;
      return;
    }
    const marker = `toolkit-hydrated:${meta.tool}:${state.currentProject}:${state.currentInstance}`;
    if (sessionStorage.getItem(marker) === "1") {
      state.syncEnabled = true;
      return;
    }
    try {
      const { response, payload } = await fetchJson(`/projects/${encodeURIComponent(state.currentProject)}/tooldata/${meta.tool}/${encodeURIComponent(state.currentInstance)}`, {
        method: "GET",
        mutation: false
      });
      if (!response.ok && response.status !== 404) throw new Error(payload.error || response.statusText);
      const data = payload.tool_data && payload.tool_data.data;
      if (data) nativeSetItem.call(localStorage, meta.key, JSON.stringify(sanitize(data)));
      else nativeRemoveItem.call(localStorage, meta.key);
      sessionStorage.setItem(marker, "1");
      location.reload();
      await new Promise(() => {});
    } catch (error) {
      state.syncEnabled = false;
      root.dispatchEvent(new CustomEvent("toolkit-sync", { detail: { ok: false, error: error.message || "Hydration failed" } }));
      throw error;
    }
  }

  function sanitizeLocalCopy() {
    if (!meta) return;
    try {
      const raw = localStorage.getItem(meta.key);
      if (raw) nativeSetItem.call(localStorage, meta.key, JSON.stringify(parseAndSanitize(raw)));
    } catch (_) {
      nativeRemoveItem.call(localStorage, meta.key);
    }
  }

  function replaceLocalData(data) {
    if (!meta) return;
    if (data == null) nativeRemoveItem.call(localStorage, meta.key);
    else nativeSetItem.call(localStorage, meta.key, JSON.stringify(sanitize(data)));
  }

  Storage.prototype.setItem = function(key, value) {
    nativeSetItem.call(this, key, value);
    if (meta && key === meta.key) scheduleSave(value);
  };

  sanitizeLocalCopy();

  if (meta && root.__INJECT__) {
    try {
      nativeSetItem.call(localStorage, meta.key, JSON.stringify(sanitize(root.__INJECT__)));
    } catch (_) {}
  }

  async function loadFromServer(projectId, instance) {
    const result = await tryLoadFromServer(projectId, instance);
    if (!result.found) throw new Error("Tool data not found");
    return result.data;
  }

  async function tryLoadFromServer(projectId, instance) {
    await ensureReady();
    const { response, payload } = await fetchJson(`/projects/${encodeURIComponent(projectId)}/tooldata/${meta.tool}/${encodeURIComponent(instance || "default")}`, {
      method: "GET",
      mutation: false
    });
    if (response.status === 404) return { found: false, data: null };
    if (!response.ok) throw new Error(payload.error || response.statusText);
    return { found: true, data: payload.tool_data && sanitize(payload.tool_data.data) };
  }

  async function saveCurrent(data) {
    await ensureReady();
    if (!meta || !state.currentProject) throw new Error("No project selected");
    return api(`/projects/${encodeURIComponent(state.currentProject)}/tooldata/${meta.tool}/${encodeURIComponent(state.currentInstance)}`, {
      method: "PUT",
      body: JSON.stringify({ data: sanitize(data) })
    });
  }

  function exportJSON(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename || "toolkit-export.json";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function importJSON(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        try { resolve(sanitize(JSON.parse(reader.result))); } catch (error) { reject(error); }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  }

  root.ToolkitStorage = {
    mode,
    meta,
    state,
    api,
    ensureReady,
    setContext,
    loadFromServer,
    tryLoadFromServer,
    replaceLocalData,
    saveCurrent,
    exportJSON,
    importJSON,
    flushQueue
  };

  ensureReady().catch(() => {});
})(window);
