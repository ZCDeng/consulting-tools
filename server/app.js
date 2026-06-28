const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const config = require("./config");
const { getDb } = require("./db");
const projects = require("./services/projects");
const tooldata = require("./services/tooldata");
const documents = require("./services/documents");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".ttf": "font/ttf",
  ".pdf": "application/pdf",
  ".txt": "text/plain; charset=utf-8"
};

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
  send(res, statusCode, JSON.stringify(value), { "Content-Type": MIME[".json"] });
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
      try {
        resolve(JSON.parse(body));
      } catch (_) {
        reject(Object.assign(new Error("Invalid JSON"), { statusCode: 400 }));
      }
    });
    req.on("error", reject);
  });
}

function splitPath(url) {
  return url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
}

function routeStatic(req, res, url) {
  let relative = decodeURIComponent(url.pathname);
  if (relative === "/") relative = "/index.html";
  const filePath = path.resolve(config.rootDir, `.${relative}`);
  if (!filePath.startsWith(`${config.rootDir}${path.sep}`) && filePath !== config.rootDir) {
    return send(res, 403, "Forbidden", { "Content-Type": MIME[".txt"] });
  }
  if (filePath.includes(`${path.sep}server${path.sep}`) || filePath.includes(`${path.sep}.git`)) {
    return send(res, 403, "Forbidden", { "Content-Type": MIME[".txt"] });
  }
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return send(res, 404, "Not found", { "Content-Type": MIME[".txt"] });
  }
  const ext = path.extname(filePath);
  const contentType = MIME[ext] || "application/octet-stream";
  const extraHeaders = ext === ".html" ? {
    "Content-Security-Policy": "default-src 'self'; img-src 'self' data: blob:; font-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'self'"
  } : {};
  send(res, 200, fs.readFileSync(filePath), { "Content-Type": contentType, ...extraHeaders });
}

async function routeApi(req, res, url) {
  const parts = splitPath(url);
  if (parts[0] === "token" && req.method === "GET") {
    return json(res, 200, { token: config.token, mode: "online" });
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
      const compute = require("./services/compute");
      const body = await readBody(req);
      return json(res, 200, { result: compute.computeResults(parts[3], body.data, {
        iterations: body.iterations,
        seed: body.seed
      }) });
    }

    if (parts[2] === "export" && req.method === "POST") {
      const { exportPdf } = require("./pdf/render");
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

function createServer() {
  getDb();
  const server = http.createServer(async (req, res) => {
    try {
      if (!config.allowedHostHeader(req.headers.host)) {
        return send(res, 403, "Forbidden", { "Content-Type": MIME[".txt"] });
      }
      if (!["GET", "HEAD", "OPTIONS"].includes(req.method || "GET")) {
        if (req.headers["x-toolkit-token"] !== config.token) {
          return json(res, 403, { error: "Missing or invalid token" });
        }
      }
      const url = new URL(req.url || "/", `http://${req.headers.host || `localhost:${config.port}`}`);
      if (req.method === "OPTIONS") return send(res, 204, "");
      if (url.pathname === "/token" || url.pathname.startsWith("/projects")) {
        return await routeApi(req, res, url);
      }
      return routeStatic(req, res, url);
    } catch (error) {
      const statusCode = error.statusCode || 500;
      json(res, statusCode, { error: error.message || "Internal server error" });
    }
  });
  return server;
}

function start() {
  const server = createServer();
  server.listen(config.port, config.host, () => {
    const href = `http://localhost:${config.port}/index.html`;
    console.log(`Consulting toolkit listening on ${config.host}:${config.port}`);
    console.log(`Open ${href}`);
    console.log(`Local token: ${config.token}`);
    console.log(`Workspace: ${pathToFileURL(config.rootDir).href}`);
  });
  return server;
}

if (require.main === module) start();

module.exports = {
  createServer,
  start,
  send,
  json
};
