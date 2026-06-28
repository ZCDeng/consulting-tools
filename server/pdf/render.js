const fs = require("node:fs");
const path = require("node:path");
const config = require("../config");
const { getToolData, assertTool } = require("../services/tooldata");

let ownedServer = null;

async function canReachServer() {
  try {
    const response = await fetch(`http://127.0.0.1:${config.port}/token`, {
      headers: { Host: `localhost:${config.port}` }
    });
    return response.ok;
  } catch (_) {
    return false;
  }
}

async function ensureHttpServer() {
  if (await canReachServer()) return;
  if (ownedServer) return;
  const { createServer } = require("../app");
  ownedServer = createServer();
  await new Promise((resolve, reject) => {
    ownedServer.once("error", reject);
    ownedServer.listen(config.port, config.host, resolve);
  });
  ownedServer.unref();
}

function safeName(value) {
  return String(value || "export").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "export";
}

async function exportPdf(options = {}) {
  const { projectId, tool, instance = "default", theme = "dark", save = false } = options;
  assertTool(tool);
  const record = getToolData(projectId, tool, instance);
  if (!record) throw Object.assign(new Error("Tool data not found"), { statusCode: 404 });
  await ensureHttpServer();

  let chromium;
  try {
    chromium = require("playwright").chromium;
  } catch (_) {
    throw Object.assign(new Error("Playwright is not installed. Run npm install in consulting-tools/server."), { statusCode: 424 });
  }

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (error) {
    throw Object.assign(new Error(`Chromium is not installed. Run npm run install-browser. ${error.message}`), { statusCode: 424 });
  }
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
    await page.emulateMedia({ media: "screen" });
    await page.addInitScript(data => {
      window.__INJECT__ = data;
    }, record.data);
    const htmlFile = config.tools[tool];
    const url = `http://localhost:${config.port}/${htmlFile}?embed=1&theme=${encodeURIComponent(theme)}`;
    await page.goto(url, { waitUntil: "networkidle" });
    await page.evaluate(async () => {
      if (document.fonts && document.fonts.ready) {
        await document.fonts.load('16px "TsangerJinKai02"');
        await document.fonts.ready;
      }
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    const buffer = await page.pdf({
      printBackground: true,
      preferCSSPageSize: true,
      format: "A4",
      landscape: tool === "qfd" || tool === "fmea"
    });
    const filename = `${safeName(projectId)}-${safeName(tool)}-${safeName(instance)}.pdf`;
    if (save) {
      fs.mkdirSync(config.exportsDir, { recursive: true });
      const filePath = path.join(config.exportsDir, filename);
      fs.writeFileSync(filePath, buffer);
      return { filename, path: filePath, bytes: buffer.length };
    }
    return { filename, buffer };
  } finally {
    await browser.close();
  }
}

module.exports = {
  exportPdf,
  ensureHttpServer
};
