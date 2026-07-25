const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

test("core config resolves app-data dataDir and is injectable", () => {
  const config = require("../config");
  assert.ok(config.dataDir.length > 0);
  assert.ok(path.isAbsolute(config.dataDir));
  assert.ok(config.dbPath.endsWith("toolkit.db"));
  assert.ok(config.exportsDir.length > 0);
  assert.equal(config.isValidTool("qfd"), true);
  assert.equal(config.isValidTool("nope"), false);
  assert.deepEqual([...config.TOOL_NAMES].sort(), ["ce", "fmea", "kano", "montecarlo", "pugh", "qfd"]);
  assert.deepEqual(config.PROJECT_STATUSES, ["active", "paused", "archived"]);
});

test("core opens a database and applies schema without server deps", () => {
  const { openDatabase } = require("../db");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "toolkit-core-"));
  const db = openDatabase(path.join(dir, "toolkit.db"));
  try {
    assert.equal(db.prepare("PRAGMA journal_mode").get().journal_mode, "wal");
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(r => r.name);
    assert.deepEqual(tables, ["documents", "projects", "tool_data"]);
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("core index exposes services, compute, schema, config", () => {
  const core = require("../index");
  assert.equal(typeof core.computeResults, "function");
  assert.equal(typeof core.projects.createProject, "function");
  assert.equal(typeof core.tooldata.setToolData, "function");
  assert.equal(typeof core.documents.addDocument, "function");
  assert.ok(core.schema && core.schema.tools);
  assert.ok(core.config && core.config.isValidTool);
});
