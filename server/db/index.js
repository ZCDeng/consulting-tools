const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const config = require("../config");

let db;

function openDatabase(dbFile = config.dbPath) {
  fs.mkdirSync(path.dirname(dbFile), { recursive: true });
  const database = new DatabaseSync(dbFile);
  database.exec("PRAGMA foreign_keys = ON");
  database.exec("PRAGMA journal_mode = WAL");
  database.exec("PRAGMA busy_timeout = 5000");
  database.exec(fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8"));
  return database;
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
