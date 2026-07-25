const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const config = require("../../packages/core/config");
const { openDatabase, setDbForTests } = require("../../packages/core/db");
const projects = require("../../packages/core/services/projects");
const tooldata = require("../../packages/core/services/tooldata");
const { exportPdf, ensureHttpServer } = require("../app");

test("PDF export renders injected same-origin tool page and saves inside exports", async t => {
  try {
    const { chromium } = require("playwright");
    const browser = await chromium.launch({ headless: true });
    await browser.close();
  } catch (error) {
    t.skip(`Chromium unavailable: ${error.message}`);
    return;
  }

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "toolkit-pdf-"));
  const db = openDatabase(path.join(dir, "toolkit.db"));
  const originalDbPath = config.dbPath;
  const originalExportsDir = config.exportsDir;
  config.dbPath = path.join(dir, "toolkit.db");
  config.exportsDir = path.join(dir, "exports");
  setDbForTests(db);
  try {
    const project = projects.createProject({ name: "PDF 项目" });
    tooldata.setToolData(project.id, "qfd", "main", {
      title: "PDF QFD",
      reqs: [{ id: "r1", name: "复购", imp: 5, cur: 2, tgt: 4, sp: 1.5 }],
      cols: [{ id: "c1", name: "会员中台" }],
      rel: { "r1|c1": 9 },
      roof: {}
    });
    const result = await exportPdf({ projectId: project.id, tool: "qfd", instance: "main", theme: "dark", save: true });
    assert.equal(path.dirname(result.path), config.exportsDir);
    assert.ok(result.bytes > 1000);
    assert.equal(fs.readFileSync(result.path).subarray(0, 4).toString(), "%PDF");
  } finally {
    db.close();
    config.dbPath = originalDbPath;
    config.exportsDir = originalExportsDir;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
