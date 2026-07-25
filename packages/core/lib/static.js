const fs = require("node:fs");
const path = require("node:path");

// Static-file serving for the browser host. Serves ONLY files under the
// static root (packages/static in-repo, or the published package's static/),
// so core source, db schema, and CLI code are never exposed (U4/KTD8). The
// previous implementation served the repo root and denied /server/ paths;
// this one whitelists a dedicated asset-only root instead.

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".ttf": "font/ttf",
  ".pdf": "application/pdf",
  ".txt": "text/plain; charset=utf-8"
};

const CSP = "default-src 'self'; img-src 'self' data: blob:; font-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'self'";

function createStaticServer({ staticRoot, send }) {
  const root = path.resolve(staticRoot);
  return function serveStatic(url, res) {
    let relative = decodeURIComponent(url.pathname);
    if (relative === "/") relative = "/index.html";
    const filePath = path.resolve(root, `.${relative}`);
    const inside = filePath === root || filePath.startsWith(`${root}${path.sep}`);
    if (!inside) {
      return send(res, 403, "Forbidden", { "Content-Type": MIME[".txt"] });
    }
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      return send(res, 404, "Not found", { "Content-Type": MIME[".txt"] });
    }
    const ext = path.extname(filePath);
    const contentType = MIME[ext] || "application/octet-stream";
    const extra = ext === ".html" ? { "Content-Security-Policy": CSP } : {};
    send(res, 200, fs.readFileSync(filePath), { "Content-Type": contentType, ...extra });
  };
}

// Default static root: the sibling packages/static directory in the repo, or
// <pkg>/static when the core is installed as a published package.
function defaultStaticRoot() {
  const inRepo = path.resolve(__dirname, "..", "..", "static");
  if (fs.existsSync(path.join(inRepo, "index.html"))) return inRepo;
  return path.resolve(__dirname, "..", "static");
}

module.exports = { createStaticServer, defaultStaticRoot, MIME };
