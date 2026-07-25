const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const config = require("../config");

let db;

function openDatabase(dbFile = config.dbPath, options = {}) {
  // Reconcile legacy DB homes into the target before opening (U3/KTD10). Only
  // runs for the default app-data path, not for test/explicit paths, and only
  // once per process.
  if (!options.skipMigration && path.resolve(dbFile) === path.resolve(config.dbPath)) {
    runMigrationOnce(dbFile);
  }
  fs.mkdirSync(path.dirname(dbFile), { recursive: true });
  const database = new DatabaseSync(dbFile);
  database.exec("PRAGMA foreign_keys = ON");
  database.exec("PRAGMA journal_mode = WAL");
  database.exec("PRAGMA busy_timeout = 5000");
  database.exec(fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8"));
  return database;
}

let migrated = false;
function runMigrationOnce(dbFile) {
  if (migrated) return;
  migrated = true;
  const { reconcile, legacyServerDataDb } = require("../lib/migrate");
  const legacy = [legacyServerDataDb()];
  if (process.env.TOOLKIT_LEGACY_DB) legacy.push(process.env.TOOLKIT_LEGACY_DB);
  reconcile({ targetPath: dbFile, legacyPaths: legacy });
}

function getDb() {
  if (!db) db = openDatabase();
  return db;
}

function setDbForTests(database) {
  db = database;
}

function closeDb() {
  if (db) db.close();
  db = null;
}

function now() {
  return Date.now();
}

function id(prefix) {
  return `${prefix}_${cryptoRandom()}`;
}

function cryptoRandom() {
  return require("node:crypto").randomBytes(10).toString("hex");
}

module.exports = {
  openDatabase,
  getDb,
  setDbForTests,
  closeDb,
  now,
  id
};
