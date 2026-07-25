const { getDb, id, now } = require("../db");
const { requireProject } = require("./projects");

function listDocuments(projectId) {
  requireProject(projectId);
  return getDb().prepare("SELECT * FROM documents WHERE project_id = ? ORDER BY updated_at DESC").all(projectId);
}

function getDocument(projectId, documentId) {
  requireProject(projectId);
  return getDb().prepare("SELECT * FROM documents WHERE project_id = ? AND id = ?").get(projectId, documentId) || null;
}

function addDocument(projectId, input = {}) {
  requireProject(projectId);
  const stamp = now();
  const doc = {
    id: input.id || id("doc"),
    project_id: projectId,
    title: String(input.title || "未命名文档").trim() || "未命名文档",
    body_md: String(input.body_md || ""),
    created_at: stamp,
    updated_at: stamp
  };
  getDb().prepare(
    "INSERT INTO documents (id, project_id, title, body_md, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(doc.id, doc.project_id, doc.title, doc.body_md, doc.created_at, doc.updated_at);
  getDb().prepare("UPDATE projects SET updated_at = ? WHERE id = ?").run(stamp, projectId);
  return doc;
}

function updateDocument(projectId, documentId, patch = {}) {
  requireProject(projectId);
  const current = getDb().prepare("SELECT * FROM documents WHERE project_id = ? AND id = ?").get(projectId, documentId);
  if (!current) return null;
  const stamp = now();
  getDb().prepare(
    "UPDATE documents SET title = ?, body_md = ?, updated_at = ? WHERE project_id = ? AND id = ?"
  ).run(
    patch.title == null ? current.title : String(patch.title || "").trim() || current.title,
    patch.body_md == null ? current.body_md : String(patch.body_md || ""),
    stamp,
    projectId,
    documentId
  );
  return getDb().prepare("SELECT * FROM documents WHERE project_id = ? AND id = ?").get(projectId, documentId);
}

function deleteDocument(projectId, documentId) {
  requireProject(projectId);
  const result = getDb().prepare("DELETE FROM documents WHERE project_id = ? AND id = ?").run(projectId, documentId);
  return result.changes > 0;
}

module.exports = {
  listDocuments,
  getDocument,
  addDocument,
  updateDocument,
  deleteDocument
};
