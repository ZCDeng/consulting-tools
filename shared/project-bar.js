(function(root) {
  const storage = root.ToolkitStorage;
  if (!storage) return;

  function css() {
    const style = document.createElement("style");
    style.textContent = `
      .toolkit-project-bar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:10px auto 0;padding:9px 14px;border:1px solid var(--line);border-radius:8px;background:var(--panel);max-width:1180px}
      .toolkit-project-bar select,.toolkit-project-bar input{border:1px solid var(--line);border-radius:6px;background:var(--bg);color:var(--ink);padding:7px 9px;font:inherit}
      .toolkit-project-bar button{border:1px solid var(--line);border-radius:6px;background:var(--panel2,var(--panel));color:var(--ink);padding:7px 10px;cursor:pointer}
      .toolkit-project-bar .primary{background:var(--accent);color:white;border-color:transparent}
      .toolkit-project-bar .muted{color:var(--muted);font-size:12px}
      .toolkit-project-bar .dot{font-weight:800}
      .toolkit-project-bar .grow{flex:1}
      .toolkit-dashboard{max-width:1180px;margin:18px auto;padding:0 18px}
      .toolkit-dashboard .row{display:flex;gap:10px;align-items:center;justify-content:space-between;border:1px solid var(--line);border-radius:8px;background:var(--panel);padding:12px;margin:8px 0}
      .toolkit-dashboard .name{font-weight:800}.toolkit-dashboard .meta{color:var(--muted);font-size:12px}
      body.toolkit-embed .topbar,body.toolkit-embed .toolkit-project-bar,body.toolkit-embed button,body.toolkit-embed .delx{display:none!important}
      @page{size:A4;margin:12mm} body.toolkit-embed{background:var(--bg)}
    `;
    document.head.appendChild(style);
  }

  function themeParam() {
    return document.documentElement.classList.contains("dark") ? "dark" : "light";
  }

  async function listProjects() {
    await storage.ensureReady();
    return (await storage.api("/projects", { method: "GET", mutation: false })).projects || [];
  }

  async function createProject() {
    const name = prompt("项目名称", "新咨询项目");
    if (!name) return null;
    const payload = await storage.api("/projects", {
      method: "POST",
      body: JSON.stringify({ name })
    });
    return payload.project;
  }

  async function renderToolBar() {
    const meta = storage.meta;
    if (!meta) return;
    if (new URLSearchParams(location.search).get("embed") === "1") {
      document.body.classList.add("toolkit-embed");
      return;
    }
    const bar = document.createElement("div");
    bar.className = "toolkit-project-bar";
    const online = storage.mode() === "online";
    bar.innerHTML = online
      ? `<span class="dot">●在线</span><select id="tkProject"></select><button id="tkNew">＋项目</button><span>实例</span><input id="tkInstance" value="${escapeAttr(storage.state.currentInstance)}"><button id="tkLoad">载入</button><button id="tkImport">导入 JSON</button><button id="tkPdf" class="primary">导出 PDF</button><span class="grow"></span><span id="tkStatus" class="muted"></span><input id="tkFile" type="file" accept="application/json" hidden>`
      : `<span class="dot">○本地</span><span class="muted">file:// 离线模式,数据保存在浏览器 localStorage。</span><button id="tkImport">导入 JSON</button><span class="grow"></span><span class="muted">起服务后打开 localhost 可管理项目 / PDF / Agent</span><input id="tkFile" type="file" accept="application/json" hidden>`;
    const topbar = document.querySelector(".topbar");
    if (topbar) topbar.insertAdjacentElement("afterend", bar);
    else document.body.prepend(bar);

    const status = document.getElementById("tkStatus");
    function setStatus(text) { if (status) status.textContent = text; }
    root.addEventListener("toolkit-sync", event => setStatus(event.detail.ok ? "已同步" : `同步失败: ${event.detail.error}`));

    const fileInput = document.getElementById("tkFile");
    document.getElementById("tkImport").onclick = () => fileInput.click();
    fileInput.onchange = async () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      try {
        const data = await storage.importJSON(file);
        if (online) {
          await storage.flushQueue();
          await storage.saveCurrent(data);
        }
        storage.replaceLocalData(data);
        location.reload();
      } catch (error) {
        setStatus(`导入失败: ${error.message}`);
      }
    };

    if (!online) return;
    const select = document.getElementById("tkProject");
    async function refreshProjects() {
      const projects = await listProjects();
      select.innerHTML = projects.map(project => `<option value="${escapeAttr(project.id)}">${escapeHtml(project.name)} · ${project.status}</option>`).join("");
      if (storage.state.currentProject && [...select.options].some(o => o.value === storage.state.currentProject)) {
        select.value = storage.state.currentProject;
      } else if (projects[0]) {
        storage.setContext(projects[0].id, storage.state.currentInstance);
        select.value = projects[0].id;
      }
    }
    await refreshProjects();
    document.getElementById("tkNew").onclick = async () => {
      try {
        await storage.flushQueue();
      } catch (error) {
        setStatus(`切换失败: ${error.message}`);
        return;
      }
      const project = await createProject();
      if (project) {
        storage.setContext(project.id, document.getElementById("tkInstance").value || "default");
        await refreshProjects();
      }
    };
    document.getElementById("tkLoad").onclick = async () => {
      const nextProject = select.value;
      const nextInstance = document.getElementById("tkInstance").value || "default";
      try {
        await storage.flushQueue();
        const result = await storage.tryLoadFromServer(nextProject, nextInstance);
        storage.replaceLocalData(result.found ? result.data : null);
        storage.setContext(nextProject, nextInstance);
        location.search = `?theme=${themeParam()}&project=${encodeURIComponent(nextProject)}&instance=${encodeURIComponent(nextInstance)}`;
      } catch (error) {
        setStatus(`载入失败: ${error.message}`);
      }
    };
    document.getElementById("tkPdf").onclick = async () => {
      if (!storage.state.currentProject) return alert("请先选择项目");
      setStatus("PDF 导出中...");
      try {
        await storage.flushQueue();
        const response = await fetch(`/projects/${encodeURIComponent(storage.state.currentProject)}/export`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Toolkit-Token": storage.state.token },
          body: JSON.stringify({ tool: meta.tool, instance: storage.state.currentInstance, theme: themeParam() })
        });
        if (!response.ok) throw new Error((await response.json()).error || response.statusText);
        const blob = await response.blob();
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `${meta.tool}-${storage.state.currentInstance}.pdf`;
        a.click();
        URL.revokeObjectURL(a.href);
        setStatus("PDF 已导出");
      } catch (error) {
        setStatus(`PDF 失败: ${error.message}`);
      }
    };
  }

  async function renderDashboard() {
    if (storage.meta) return;
    const container = document.createElement("div");
    container.className = "toolkit-dashboard";
    const lead = document.querySelector(".leadsub");
    if (lead) lead.insertAdjacentElement("afterend", container);
    else document.body.appendChild(container);
    if (storage.mode() !== "online") {
      container.innerHTML = `<div class="row"><div><div class="name">○ 本地离线模式</div><div class="meta">双击文件仍可使用各工具;启动服务后这里会显示项目仪表盘。</div></div></div>`;
      return;
    }
    async function draw() {
      const projects = await listProjects();
      container.innerHTML = `<div class="row"><div><div class="name">项目仪表盘</div><div class="meta">${projects.length} 个项目</div></div><button id="dashNew" class="primary">＋新建项目</button></div>` +
        projects.map(project => `<div class="row"><div><div class="name">${escapeHtml(project.name)}</div><div class="meta">${escapeHtml(project.client || "")} · ${project.status}</div></div><div><button data-open="${escapeAttr(project.id)}">进入 QFD</button><button data-status="${escapeAttr(project.id)}">${project.status === "paused" ? "恢复" : "暂停"}</button></div></div>`).join("");
      document.getElementById("dashNew").onclick = async () => { await createProject(); draw(); };
      container.querySelectorAll("[data-open]").forEach(btn => {
        btn.onclick = () => { location.href = `QFD.html?theme=${themeParam()}&project=${encodeURIComponent(btn.dataset.open)}&instance=default`; };
      });
      container.querySelectorAll("[data-status]").forEach(btn => {
        btn.onclick = async () => {
          const project = projects.find(item => item.id === btn.dataset.status);
          await storage.api(`/projects/${encodeURIComponent(project.id)}`, {
            method: "PATCH",
            body: JSON.stringify({ status: project.status === "paused" ? "active" : "paused" })
          });
          draw();
        };
      });
    }
    draw().catch(error => { container.innerHTML = `<div class="row"><span class="meta">${escapeHtml(error.message)}</span></div>`; });
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/'/g, "&#39;");
  }

  css();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => { renderToolBar(); renderDashboard(); });
  } else {
    renderToolBar();
    renderDashboard();
  }
})(window);
