const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

// Two-DB auto-merge (KTD10). Legacy homes: the repo-local server/data/toolkit.db
// (plain `npm start` default) and the platform app-data DB (desktop + MCP). The
// unified home is app-data. When both hold data we ATTACH the legacy DB and
// INSERT OR IGNORE across the three tables; ids are random-prefixed so
// collisions are improbable and existing target rows are never overwritten.

const TABLES = ["projects", "tool_data", "documents"];

function legacyServerDataDb() {
  // repo root is three levels up from packages/core/lib
  return path.resolve(__dirname, "..", "..", "..", "server", "data", "toolkit.db");
}

function exists(p) {
  try { fs.accessSync(p); return true; } catch { return false; }
}

function lockedError(message) {
  return Object.assign(new Error(message), { code: "MIGRATION_LOCKED", retryable: true });
}

// Open the legacy DB read-only, checkpoint + close, returning true when it is
// safe to move/merge. Throws MIGRATION_LOCKED when another process holds it.
function quiesce(sourcePath) {
  let db;
  try {
    db = new DatabaseSync(sourcePath, { readOnly: false });
  } catch (error) {
    throw lockedError(`legacy database is locked: ${error.message}`);
  }
  try {
    db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  } catch (error) {
    try { db.close(); } catch {}
    throw lockedError(`cannot checkpoint legacy database: ${error.message}`);
  }
  db.close();
}

function tableCount(db, table) {
  return db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
}

function mergeInto(targetPath, sourcePath) {
  quiesce(sourcePath);
  const target = new DatabaseSync(targetPath);
  try {
    target.exec("PRAGMA busy_timeout = 5000");
    target.prepare(`ATTACH DATABASE ? AS legacy`).run(sourcePath);
    const moved = {};
    for (const table of TABLES) {
      const cols = target.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
      const colList = cols.join(", ");
      const result = target.prepare(
        `INSERT OR IGNORE INTO ${table} (${colList}) SELECT ${colList} FROM legacy.${table}`
      ).run();
      moved[table] = Number(result.changes || 0);
    }
    target.exec("DETACH DATABASE legacy");
    return moved;
  } finally {
    target.close();
  }
}

function isEmptyDb(source) {
  const db = new DatabaseSync(source);
  try {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(r => r.name);
    return TABLES.every(t => !tables.includes(t) || tableCount(db, t) === 0);
  } finally {
    db.close();
  }
}

// Returns a report describing what (if anything) happened. Never throws on the
// no-op paths; only MIGRATION_LOCKED propagates when a merge was required but
// the source is held open.
function reconcile({ targetPath, legacyPaths }) {
  const report = { moved: [], merged: [], skipped: [] };
  const targetExists = exists(targetPath);
  const present = legacyPaths.filter(p => exists(p) && path.resolve(p) !== path.resolve(targetPath));
  if (present.length === 0) return report;

  if (!targetExists) {
    // No target DB yet: move the first legacy DB into place (with its WAL
    // sidecars quiesced away), then merge any additional ones.
    const [first, ...rest] = present;
    quiesce(first);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    for (const side of ["", "-shm", "-wal"]) {
      const src = first + side;
      if (exists(src)) fs.renameSync(src, targetPath + side);
    }
    report.moved.push(first);
    for (const extra of rest) {
      const moved = mergeInto(targetPath, extra);
      report.merged.push({ from: extra, moved });
    }
    return report;
  }

  // Target exists: merge each legacy DB in (never overwrite).
  for (const source of present) {
    if (isEmptyDb(source)) { report.skipped.push(source); continue; }
    const moved = mergeInto(targetPath, source);
    report.merged.push({ from: source, moved });
  }
  return report;
}

module.exports = { reconcile, legacyServerDataDb, mergeInto };
