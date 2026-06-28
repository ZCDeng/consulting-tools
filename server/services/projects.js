const { getDb, id, now } = require("../db");

const STATUSES = new Set(["active", "paused", "archived"]);

function normalizeProject(row) {
  return row || null;
}

function listProjects() {
  return getDb().prepare("SELECT * FROM projects ORDER BY updated_at DESC").all().map(normalizeProject);
}

function getProject(projectId) {
  return normalizeProject(getDb().prepare("SELECT * FROM projects WHERE id = ?").get(projectId));
}

function createProject(input = {}) {
  const stamp = now();
  const project = {
    id: input.id || id("proj"),
    name: String(input.name || "未命名项目").trim() || "未命名项目",
    client: String(input.client || ""),
    status: STATUSES.has(input.status) ? input.status : "active",
    notes: String(input.notes || ""),
    created_at: stamp,
    updated_at: stamp
  };
  getDb().prepare(
    "INSERT INTO projects (id, name, client, status, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(project.id, project.name, project.client, project.status, project.notes, project.created_at, project.updated_at);
  return project;
}

function updateProject(projectId, patch = {}) {
  const current = getProject(projectId);
  if (!current) return null;
  const next = {
    name: patch.name == null ? current.name : String(patch.name || "").trim() || current.name,
    client: patch.client == null ? current.client : String(patch.client || ""),
    status: patch.status == null ? current.status : String(patch.status),
    notes: patch.notes == null ? current.notes : String(patch.notes || ""),
    updated_at: now()
  };
  if (!STATUSES.has(next.status)) throw Object.assign(new Error("Invalid project status"), { statusCode: 400 });
  getDb().prepare(
    "UPDATE projects SET name = ?, client = ?, status = ?, notes = ?, updated_at = ? WHERE id = ?"
  ).run(next.name, next.client, next.status, next.notes, next.updated_at, projectId);
  return getProject(projectId);
}

function requireProject(projectId) {
  const project = getProject(projectId);
  if (!project) throw Object.assign(new Error("Project not found"), { statusCode: 404 });
  return project;
}

module.exports = {
  listProjects,
  getProject,
  createProject,
  updateProject,
  requireProject,
  STATUSES
};
