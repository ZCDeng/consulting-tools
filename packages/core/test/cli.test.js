const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { spawnSync } = require("node:child_process");

const BIN = path.join(__dirname, "..", "bin", "consulting-toolkit.js");

function run(args, { input, env, dataDir } = {}) {
  const own = !dataDir;
  const dir = dataDir || fs.mkdtempSync(path.join(os.tmpdir(), "toolkit-cli-"));
  const result = spawnSync(process.execPath, [BIN, ...args], {
    input,
    encoding: "utf8",
    env: { ...process.env, TOOLKIT_DATA_DIR: dir, ...(env || {}) }
  });
  if (own) fs.rmSync(dir, { recursive: true, force: true });
  return result;
}

test("create→set→compute→get round-trips as pure JSON on stdout", () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "toolkit-cli-"));
  try {
    const created = run(["create_project", "--name", "T"], { dataDir });
    assert.equal(created.status, 0);
    const project = JSON.parse(created.stdout).project;
    assert.equal(created.stderr, "");

    const set = run(["set_tool_data", "--project_id", project.id, "--tool", "kano",
      "--data", '{"items":[{"id":"i1","name":"f","A":1,"O":0,"M":0,"I":0,"R":0,"Q":0}]}'], { dataDir });
    assert.equal(set.status, 0);
    const stored = JSON.parse(set.stdout).tool_data;
    assert.equal(stored.tool, "kano");
    assert.equal(stored.data.items.length, 1);

    const got = run(["get_tool_data", "--project_id", project.id, "--tool", "kano"], { dataDir });
    assert.equal(got.status, 0);
    assert.deepEqual(JSON.parse(got.stdout).tool_data.data, stored.data);

    const compute = run(["compute_results", "--tool", "kano",
      "--data", '{"items":[{"id":"i1","name":"f","A":1,"O":0,"M":0,"I":0,"R":0,"Q":0}]}'], { dataDir });
    assert.equal(compute.status, 0);
    assert.ok(JSON.parse(compute.stdout).result.items[0].cat);
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test("schema verb output matches core schema module", () => {
  const out = run(["schema"]);
  assert.equal(out.status, 0);
  const schema = JSON.parse(out.stdout).schema;
  assert.deepEqual(schema, require("../schema"));
  assert.ok(schema.tools.kano.data_json);
});

test("unknown project yields PROJECT_NOT_FOUND with non-zero exit, no stack", () => {
  const out = run(["get_tool_data", "--project_id", "proj_missing", "--tool", "kano"]);
  assert.notEqual(out.status, 0);
  const err = JSON.parse(out.stderr).error;
  assert.equal(err.code, "PROJECT_NOT_FOUND");
  assert.doesNotMatch(out.stderr, /at .*\.js:\d/);
});

test("invalid tool and invalid status are INVALID_INPUT", () => {
  const bad = run(["compute_results", "--tool", "nope", "--data", "{}"]);
  assert.notEqual(bad.status, 0);
  assert.equal(JSON.parse(bad.stderr).error.code, "INVALID_INPUT");

  const badStatus = run(["update_project", "--project_id", "proj_x", "--status", "bogus"]);
  assert.notEqual(badStatus.status, 0);
  assert.equal(JSON.parse(badStatus.stderr).error.code, "INVALID_INPUT");
});

test("update_project renames and archives a project", () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "toolkit-cli-"));
  try {
    const created = run(["create_project", "--name", "Old"], { dataDir });
    const project = JSON.parse(created.stdout).project;
    const updated = run(["update_project", "--project_id", project.id, "--name", "New", "--status", "archived"], { dataDir });
    assert.equal(updated.status, 0);
    const p = JSON.parse(updated.stdout).project;
    assert.equal(p.name, "New");
    assert.equal(p.status, "archived");
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test("list_projects stdout parses as JSON with no log noise", () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "toolkit-cli-"));
  try {
    run(["create_project", "--name", "noise-check"], { dataDir });
    const out = run(["list_projects"], { dataDir });
    assert.equal(out.status, 0);
    assert.doesNotThrow(() => JSON.parse(out.stdout));
    assert.ok(JSON.parse(out.stdout).projects.length >= 1);
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test("documents round-trip: add, list, get, update", () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "toolkit-cli-"));
  try {
    const project = JSON.parse(run(["create_project", "--name", "Doc 项目"], { dataDir }).stdout).project;

    const added = run(["add_document", "--project_id", project.id,
      "--title", "评分依据", "--body_md", "Pugh 成本维度 +1 因为..."], { dataDir });
    assert.equal(added.status, 0);
    const doc = JSON.parse(added.stdout).document;

    const listed = run(["list_documents", "--project_id", project.id], { dataDir });
    assert.equal(listed.status, 0);
    const docs = JSON.parse(listed.stdout).documents;
    assert.equal(docs.length, 1);
    assert.equal(docs[0].id, doc.id);

    const got = run(["get_document", "--project_id", project.id, "--document_id", doc.id], { dataDir });
    assert.equal(got.status, 0);
    assert.equal(JSON.parse(got.stdout).document.body_md, "Pugh 成本维度 +1 因为...");

    const updated = run(["update_document", "--project_id", project.id, "--document_id", doc.id,
      "--body_md", "修订后的依据"], { dataDir });
    assert.equal(updated.status, 0);
    assert.equal(JSON.parse(updated.stdout).document.body_md, "修订后的依据");
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test("missing document yields structured not-found", () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "toolkit-cli-"));
  try {
    const project = JSON.parse(run(["create_project", "--name", "X"], { dataDir }).stdout).project;
    const out = run(["get_document", "--project_id", project.id, "--document_id", "doc_missing"], { dataDir });
    assert.notEqual(out.status, 0);
    assert.equal(JSON.parse(out.stderr).error.code, "PROJECT_NOT_FOUND");
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test("montecarlo with fixed seed is deterministic; oversized iterations rejected", () => {
  const payload = JSON.stringify({ vars: [{ name: "a", dist: "fixed", p: { val: 2 } }], formula: "a*3", target: 5, dir: "ge" });
  const a = run(["compute_results", "--tool", "montecarlo", "--data", payload, "--iterations", "20", "--seed", "1"]);
  const b = run(["compute_results", "--tool", "montecarlo", "--data", payload, "--iterations", "20", "--seed", "1"]);
  assert.equal(a.status, 0);
  assert.deepEqual(JSON.parse(a.stdout), JSON.parse(b.stdout));

  const tooBig = run(["compute_results", "--tool", "montecarlo", "--data", payload, "--iterations", "50001"]);
  assert.notEqual(tooBig.status, 0);
});
