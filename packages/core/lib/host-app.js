const http = require("node:http");

// Shared host HTTP app: JSON API over the core + static browser assets +
// token/Host guards. Used by the desktop host and the local dev server. The
// PDF renderer is injected by the host (it owns the Playwright dependency), so
// this module stays zero-dependency (KTD6).

const { createStaticServer } = require("./static");

function send(res, statusCode, body, headers = {}) {
  const payload = Buffer.isBuffer(body) ? body : Buffer.from(body == null ? "" : String(body));
  res.writeHead(statusCode, {
    "Content-Length": payload.length,
    "X-Content-Type-Options": "nosniff",
    ...headers
  });
  res.end(payload);
}

function json(res, statusCode, value) {
  send(res, statusCode, JSON.stringify(value), { "Content-Type": "application/json" });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 5 * 1024 * 1024) {
        reject(Object.assign(new Error("Request body too large"), { statusCode: 413 }));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try { resolve(JSON.parse(body)); }
      catch { reject(Object.assign(new Error("Invalid JSON"), { statusCode: 400 })); }
    });
    req.on("error", reject);
  });
}

function splitPath(url) {
  return url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
}

function createHostApp(options) {
  const {
    core,
    token,
    allowedHostHeader,
    staticRoot,
    exportPdf // injected by host; may be undefined when PDF unavailable
  } = options;
  const { projects, tooldata, documents, computeResults } = core;
  const serveStatic = createStaticServer({ staticRoot, send });

  async function routeApi(req, res, url) {
    const parts = splitPath(url);
    if (parts[0] === "token" && req.method === "GET") {
      return json(res, 200, { token, mode: "online" });
    }
    if (parts[0] === "projects" && parts.length === 1) {
      if (req.method === "GET") return json(res, 200, { projects: projects.listProjects() });
      if (req.method === "POST") return json(res, 201, { project: projects.createProject(await readBody(req)) });
    }
    if (parts[0] === "projects" && parts[1]) {
      const projectId = parts[1];
      if (parts.length === 2) {
        if (req.method === "GET") {
          const project = projects.getProject(projectId);
          return project ? json(res, 200, { project }) : json(res, 404, { error: "Project not found" });
        }
        if (req.method === "PATCH") {
          const project = projects.updateProject(projectId, await readBody(req));
          return project ? json(res, 200, { project }) : json(res, 404, { error: "Project not found" });
        }
      }
      if (parts[2] === "tooldata") {
        if (parts.length === 3 && req.method === "GET") {
          return json(res, 200, { tool_data: tooldata.listToolData(projectId) });
        }
        const tool = parts[3];
        const instance = parts[4] || "default";
        if (req.method === "GET" && tool) {
          const record = tooldata.getToolData(projectId, tool, instance);
          return record ? json(res, 200, { tool_data: record }) : json(res, 404, { error: "Tool data not found" });
        }
        if (req.method === "PUT" && tool) {
          const body = await readBody(req);
          return json(res, 200, { tool_data: tooldata.setToolData(projectId, tool, instance, body.data || body) });
        }
      }
      if (parts[2] === "documents") {
        if (parts.length === 3) {
          if (req.method === "GET") return json(res, 200, { documents: documents.listDocuments(projectId) });
          if (req.method === "POST") return json(res, 201, { document: documents.addDocument(projectId, await readBody(req)) });
        }
        if (parts[3]) {
          if (req.method === "PATCH") {
            const document = documents.updateDocument(projectId, parts[3], await readBody(req));
            return document ? json(res, 200, { document }) : json(res, 404, { error: "Document not found" });
          }
          if (req.method === "DELETE") {
            const deleted = documents.deleteDocument(projectId, parts[3]);
            return json(res, deleted ? 200 : 404, deleted ? { deleted: true } : { error: "Document not found" });
          }
        }
      }
      if (parts[2] === "compute" && req.method === "POST") {
        const body = await readBody(req);
        return json(res, 200, { result: computeResults(parts[3], body.data, { iterations: body.iterations, seed: body.seed }) });
      }
      if (parts[2] === "export" && req.method === "POST") {
        if (!exportPdf) return json(res, 424, { error: "PDF export unavailable in this host" });
        const body = await readBody(req);
        const result = await exportPdf({ projectId, ...body });
        if (body.save) return json(res, 200, result);
        return send(res, 200, result.buffer, {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${result.filename}"`
        });
      }
    }
    json(res, 404, { error: "Not found" });
  }

  const server = http.createServer(async (req, res) => {
    try {
      // allowedHostHeader is resolved per-request so tests and hosts can
      // substitute the guard after the app is built.
      const guard = typeof allowedHostHeader === "function" ? allowedHostHeader : () => false;
      if (!guard(req.headers.host)) {
        return send(res, 403, "Forbidden", { "Content-Type": "text/plain; charset=utf-8" });
      }
      if (!["GET", "HEAD", "OPTIONS"].includes(req.method || "GET")) {
        if (req.headers["x-toolkit-token"] !== token) {
          return json(res, 403, { error: "Missing or invalid token" });
        }
      }
      const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
      if (req.method === "OPTIONS") return send(res, 204, "");
      if (url.pathname === "/token" || url.pathname.startsWith("/projects")) {
        return await routeApi(req, res, url);
      }
      return serveStatic(url, res);
    } catch (error) {
      const statusCode = error.statusCode || 500;
      json(res, statusCode, { error: error.message || "Internal server error" });
    }
  });

  return { server, send, json };
}

module.exports = { createHostApp, send, json };
