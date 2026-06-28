const crypto = require("node:crypto");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "..");
const dataDir = path.join(__dirname, "data");
const exportsDir = path.join(dataDir, "exports");
const dbPath = process.env.TOOLKIT_DB_PATH || path.join(dataDir, "toolkit.db");
const port = Number(process.env.TOOLKIT_PORT || 41789);
const host = "127.0.0.1";
const token = process.env.TOOLKIT_TOKEN || crypto.randomBytes(24).toString("hex");

const tools = Object.freeze({
  kano: "Kano.html",
  ce: "CE-Matrix.html",
  qfd: "QFD.html",
  pugh: "Pugh.html",
  fmea: "FMEA.html",
  montecarlo: "MonteCarlo.html"
});

function isValidTool(tool) {
  return Object.hasOwn(tools, tool);
}

function allowedHostHeader(value) {
  if (!value) return false;
  const hostValue = value.toLowerCase();
  return hostValue === `localhost:${port}` || hostValue === `127.0.0.1:${port}`;
}

module.exports = {
  rootDir,
  dataDir,
  exportsDir,
  dbPath,
  port,
  host,
  token,
  tools,
  isValidTool,
  allowedHostHeader
};
