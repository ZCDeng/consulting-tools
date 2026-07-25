const fs = require("node:fs");
const path = require("node:path");

// Desktop-host PDF renderer. Owns the Playwright dependency (host-side, KTD7).
// Reuses the shared host-app for the HTTP surface instead of the old server/app.

function safeName(value) {
  return String(value || "export").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "export";
}

function createPdfRenderer({ core, config, ensureHttpServer, port, host, requirePlaywright }) {
  const { tooldata } = core;
  const loadPlaywright = requirePlaywright || (() => require("playwright"));

  async function exportPdf(options = {}) {
    const { projectId, tool, instance = "default", theme = "dark", save = false } = options;
    tooldata.assertTool(tool);
    const record = tooldata.getToolData(projectId, tool, instance);
    if (!record) throw Object.assign(new Error("Tool data not found"), { statusCode: 404 });
    await ensureHttpServer();

    let chromium;
    try {
      chromium = loadPlaywright().chromium;
    } catch (_) {
      throw Object.assign(new Error("Playwright is not installed in the desktop host."), { statusCode: 424 });
    }

    let browser;
    try {
      browser = await chromium.launch({ headless: true });
    } catch (error) {
      throw Object.assign(new Error(`Chromium is not installed. ${error.message}`), { statusCode: 424 });
    }
    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
      await page.emulateMedia({ media: "screen" });
      await page.addInitScript(data => { window.__INJECT__ = data; }, record.data);
      const htmlFile = config.tools[tool];
      const url = `http://localhost:${port}/${htmlFile}?embed=1&theme=${encodeURIComponent(theme)}`;
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

  return { exportPdf };
}

module.exports = { createPdfRenderer, safeName };
