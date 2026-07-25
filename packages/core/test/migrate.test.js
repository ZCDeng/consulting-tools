const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { DatabaseSync } = require("node:sqlite");
const { reconcile } = require("../lib/migrate");

const SCHEMA = fs.readFileSync(path.join(__dirname, "..", "db", "schema.sql"), "utf8");

function makeDb(file, seed) {
  const db = new DatabaseSync(file);
  db.exec(SCHEMA);
  if (seed) {
    const now = Date.now();
    db.prepare("INSERT INTO projects (id,name,client,status,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?)")
      .run(seed, `${seed}-name`, "", "active", "", now, now);
  }
  db.close();
}

function projectIds(file) {
  const db = new DatabaseSync(file);
  try {
    return db.prepare("SELECT id FROM projects ORDER BY id").all().map(r => r.id);
  } finally {
    db.close();
  }
}

test("merge moves legacy DB when target absent", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "toolkit-mig-"));
  const legacy = path.join(dir, "legacy.db");
  const target = path.join(dir, "sub", "toolkit.db");
  makeDb(legacy, "proj_a");
  const report = reconcile({ targetPath: target, legacyPaths: [legacy] });
  assert.deepEqual(report.moved, [legacy]);
  assert.deepEqual(projectIds(target), ["proj_a"]);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("merge unions two populated DBs without overwriting target rows", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "toolkit-mig-"));
  const legacy = path.join(dir, "legacy.db");
  const target = path.join(dir, "toolkit.db");
  makeDb(legacy, "proj_old");
  makeDb(target, "proj_new");
  const report = reconcile({ targetPath: target, legacyPaths: [legacy] });
  assert.equal(report.merged.length, 1);
  assert.equal(report.merged[0].moved.projects, 1);
  assert.deepEqual(projectIds(target), ["proj_new", "proj_old"]);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("empty legacy DB is skipped, not merged", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "toolkit-mig-"));
  const legacy = path.join(dir, "legacy.db");
  const target = path.join(dir, "toolkit.db");
  makeDb(legacy, null);
  makeDb(target, "proj_new");
  const report = reconcile({ targetPath: target, legacyPaths: [legacy] });
  assert.deepEqual(report.skipped, [legacy]);
  assert.deepEqual(projectIds(target), ["proj_new"]);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("locked legacy DB surfaces MIGRATION_LOCKED and leaves files untouched", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "toolkit-mig-"));
  const legacy = path.join(dir, "legacy.db");
  const target = path.join(dir, "toolkit.db");
  makeDb(legacy, "proj_old");
  makeDb(target, "proj_new");
  // Hold an exclusive lock on the legacy DB.
  const holder = new DatabaseSync(legacy);
  holder.exec("PRAGMA locking_mode = EXCLUSIVE");
  holder.exec("BEGIN EXCLUSIVE");
  try {
    assert.throws(() => reconcile({ targetPath: target, legacyPaths: [legacy] }), /locked|checkpoint/i);
    assert.deepEqual(projectIds(target), ["proj_new"]);
  } finally {
    try { holder.exec("ROLLBACK"); } catch {}
    holder.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
