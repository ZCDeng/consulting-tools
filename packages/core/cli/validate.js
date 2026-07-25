// Hand-rolled input validation (KTD6): no zod. Tool names come from the cores
// registry, project statuses from the core config — both single-source.

const { TOOL_NAMES, PROJECT_STATUSES } = require("../config");

function bad(message) {
  throw Object.assign(new Error(message), { statusCode: 400 });
}

function requireString(value, name) {
  if (typeof value !== "string" || value.trim() === "") bad(`${name} is required`);
  return value.trim();
}

function requireTool(value) {
  const tool = requireString(value, "tool");
  if (!TOOL_NAMES.includes(tool)) bad(`invalid tool: ${tool} (expected one of ${TOOL_NAMES.join(", ")})`);
  return tool;
}

function requireStatus(value) {
  if (value == null) return undefined;
  if (!PROJECT_STATUSES.includes(value)) bad(`invalid status: ${value} (expected one of ${PROJECT_STATUSES.join(", ")})`);
  return value;
}

function requireObject(value, name) {
  if (value == null || typeof value !== "object" || Array.isArray(value)) bad(`${name} must be a JSON object`);
  return value;
}

function optionalInt(value, name) {
  if (value == null) return undefined;
  const n = Number(value);
  if (!Number.isInteger(n)) bad(`${name} must be an integer`);
  return n;
}

module.exports = { bad, requireString, requireTool, requireStatus, requireObject, optionalInt };
