"use strict";

// Desktop host entry (spawned by consulting_desktop.rs). Wires the published
// core + shared host-app + host-owned PDF renderer. Playwright is a dependency
// of THIS host package, not of the published core (KTD7/KTD9).

const path = require("node:path");
const core = require("consulting-toolkit");
const { createHostApp } = require("consulting-toolkit/lib/host-app");
const { createPdfRenderer } = require("./pdf-render");

const { config } = core;

const port = Number(process.env.TOOLKIT_PORT || 41789);
const host = normalizeHost(process.env.TOOLKIT_HOST);
const token = process.env.TOOLKIT_TOKEN || require("node:crypto").randomBytes(24).toString("hex");

function normalizeHost(value) {
  const v = String(value || "127.0.0.1").trim().toLowerCase();
  if (v === "127.0.0.1" || v === "localhost") return "127.0.0.1";
  throw new Error("TOOLKIT_HOST must be loopback-only: 127.0.0.1 or localhost");
}

function allowedHostHeader(value) {
  if (!value) return false;
  const v = value.toLowerCase();
  return v === `localhost:${port}` || v === `127.0.0.1:${port}`;
}

// Static root: prefer the published package's staged static/, fall back to the
// repo's packages/static during in-repo development.
function resolveStaticRoot() {
  try {
    const pkgStatic = path.join(path.dirname(require.resolve("consulting-toolkit")), "static");
    if (require("node:fs").existsSync(path.join(pkgStatic, "index.html"))) return pkgStatic;
  } catch (_) {}
  return path.resolve(__dirname, "..", "..", "packages", "static");
}

const staticRoot = process.env.TOOLKIT_STATIC_DIR || resolveStaticRoot();

let ownedServer = null;
async function canReachServer() {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/token`, { headers: { Host: `localhost:${port}` } });
    return res.ok;
  } catch (_) {
    return false;
  }
}

async function ensureHttpServer() {
  if (await canReachServer()) return;
  if (ownedServer) return;
  ownedServer = start();
  await new Promise((resolve, reject) => {
    ownedServer.once("error", reject);
    ownedServer.listen(port, host, resolve);
  });
  ownedServer.unref();
}

const { exportPdf } = createPdfRenderer({
  core,
  config,
  ensureHttpServer,
  port,
  host,
  requirePlaywright: () => require("playwright")
});

function start() {
  const { server } = createHostApp({
    core,
    token,
    allowedHostHeader,
    staticRoot,
    exportPdf
  });
  return server;
}

if (require.main === module) {
  const server = start();
  server.listen(port, host, () => {
    // eslint-disable-next-line no-console
    console.log(`consulting-toolkit desktop host on ${host}:${port}`);
  });
}

module.exports = { start, ensureHttpServer, exportPdf, allowedHostHeader };
