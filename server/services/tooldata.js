const { getDb, id, now } = require("../db");
const { isValidTool } = require("../config");
const { requireProject } = require("./projects");
const { sanitizeToolData } = require("../../shared/data-sanitize");

function assertTool(tool) {
  if (!isValidTool(tool)) throw Object.assign(new Error("Invalid tool"), { statusCode: 400 });
}

function normalize(row) {
  if (!row) return null;
  return {
    ...row,
    data: sanitizeToolData(row.tool, JSON.parse(row.data_json))
  };
}

function listToolData(projectId) {
  requireProject(projectId);
  return getDb().prepare("SELECT * FROM tool_data WHERE project_id = ? ORDER BY tool, instance_name")
    .all(projectId)
    .map(normalize);
}

function getToolData(projectId, tool, instance = "default") {
  requireProject(projectId);
  assertTool(tool);
  const row = getDb().prepare(
    "SELECT * FROM tool_data WHERE project_id = ? AND tool = ? AND instance_name = ?"
  ).get(projectId, tool, instance || "default");
  return normalize(row);
}

function setToolData(projectId, tool, instance = "default", data = {}) {
  requireProject(projectId);
  assertTool(tool);
  const stamp = now();
  const recordId = id("tool");
  const dataJson = JSON.stringify(sanitizeToolData(tool, data || {}));
  getDb().prepare(`
    INSERT INTO tool_data (id, project_id, tool, instance_name, data_json, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(project_id, tool, instance_name)
    DO UPDATE SET data_json = excluded.data_json, updated_at = excluded.updated_at
  `).run(recordId, projectId, tool, instance || "default", dataJson, stamp);
  getDb().prepare("UPDATE projects SET updated_at = ? WHERE id = ?").run(stamp, projectId);
  return getToolData(projectId, tool, instance || "default");
}

module.exports = {
  assertTool,
  listToolData,
  getToolData,
  setToolData
};
