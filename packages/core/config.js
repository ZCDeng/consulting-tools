const path = require("node:path");
const os = require("node:os");

// Core-side config: data storage only. Host concerns (port/host/token/static
// root) live with the individual hosts, not here. Every path is injectable via
// env so the published package carries no machine-absolute defaults.

const PACKAGE_ID = "com.zcdeng.consulting-tools";

function defaultDataDir() {
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", PACKAGE_ID, "data");
  }
  if (process.platform === "win32") {
    const base = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
    return path.join(base, "consulting-tools", "data");
  }
  const base = process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share");
  return path.join(base, "consulting-tools", "data");
}

const dataDir = path.resolve(process.env.TOOLKIT_DATA_DIR || defaultDataDir());
const dbPath = process.env.TOOLKIT_DB_PATH
  ? path.resolve(process.env.TOOLKIT_DB_PATH)
  : path.join(dataDir, "toolkit.db");
const exportsDir = path.resolve(process.env.TOOLKIT_EXPORTS_DIR || path.join(dataDir, "exports"));

// The six compute cores are the single source of truth for valid tool names.
const tools = Object.freeze({
  kano: "Kano.html",
  ce: "CE-Matrix.html",
  qfd: "QFD.html",
  pugh: "Pugh.html",
  fmea: "FMEA.html",
  montecarlo: "MonteCarlo.html"
});

const TOOL_NAMES = Object.freeze(Object.keys(tools));
const PROJECT_STATUSES = Object.freeze(["active", "paused", "archived"]);

function isValidTool(tool) {
  return Object.hasOwn(tools, tool);
}

module.exports = {
  dataDir,
  dbPath,
  exportsDir,
  tools,
  TOOL_NAMES,
  PROJECT_STATUSES,
  isValidTool
};
