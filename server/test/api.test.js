const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const app = require("../app");
const { openDatabase, setDbForTests } = require("../../packages/core/db");
const { createServer } = require("../app");

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "toolkit-api-"));
  const db = openDatabase(path.join(dir, "toolkit.db"));
  setDbForTests(db);
  const server = createServer();
  return new Promise(resolve => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      const host = `127.0.0.1:${port}`;
      app.setAllowedHostHeader(value => value === host);
      resolve({
        dir,
        db,
        server,
        base: `http://127.0.0.1:${port}`,
        host,
        close() {
          server.close();
          db.close();
          app.setAllowedHostHeader(app.allowedHostHeader);
          fs.rmSync(dir, { recursive: true, force: true });
        }
      });
    });
  });
}

async function request(ctx, pathname, options = {}) {
  const headers = { Host: ctx.host, ...(options.headers || {}) };
  if (options.json) {
    headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(options.json);
  }
  return fetch(`${ctx.base}${pathname}`, { ...options, headers });
}

function rawRequest(ctx, pathname, host) {
  const { port } = ctx.server.address();
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: "127.0.0.1",
      port,
      path: pathname,
      method: "GET",
      headers: { Host: host }
    }, res => {
      res.resume();
      res.on("end", () => resolve(res.statusCode));
    });
    req.on("error", reject);
    req.end();
  });
}

test("database initializes with WAL and core tables", async () => {
  const ctx = await setup();
  try {
    assert.equal(ctx.db.prepare("PRAGMA journal_mode").get().journal_mode, "wal");
    const tables = ctx.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all().map(r => r.name);
    assert.deepEqual(tables, ["documents", "projects", "tool_data"]);
  } finally {
    ctx.close();
  }
});

test("security boundary rejects bad host and missing mutation token", async () => {
  const ctx = await setup();
  try {
    assert.equal(await rawRequest(ctx, "/projects", "evil.com"), 403);

    const missingToken = await request(ctx, "/projects", { method: "POST", json: { name: "A" } });
    assert.equal(missingToken.status, 403);
  } finally {
    ctx.close();
  }
});

test("projects, tool data, status, and documents CRUD", async () => {
  const ctx = await setup();
  try {
    const token = (await (await request(ctx, "/token")).json()).token;
    const auth = { "X-Toolkit-Token": token };
    const created = await (await request(ctx, "/projects", {
      method: "POST",
      headers: auth,
      json: { name: "客户 A", client: "A 集团" }
    })).json();
    const project = created.project;
    assert.equal(project.status, "active");
    assert.ok(project.created_at);

    const data = { title: "QFD", reqs: [], cols: [], rel: {}, roof: {} };
    const putQfd = await request(ctx, `/projects/${project.id}/tooldata/qfd/main`, {
      method: "PUT",
      headers: auth,
      json: { data }
    });
    assert.equal(putQfd.status, 200);
    const putFmea = await request(ctx, `/projects/${project.id}/tooldata/fmea/risk`, {
      method: "PUT",
      headers: auth,
      json: { data: { title: "Risk", rows: [] } }
    });
    assert.equal(putFmea.status, 200);

    const qfd = await (await request(ctx, `/projects/${project.id}/tooldata/qfd/main`)).json();
    assert.deepEqual(qfd.tool_data.data, data);

    const paused = await (await request(ctx, `/projects/${project.id}`, {
      method: "PATCH",
      headers: auth,
      json: { status: "paused" }
    })).json();
    assert.equal(paused.project.status, "paused");
    const missingPatch = await request(ctx, "/projects/proj_missing", {
      method: "PATCH",
      headers: auth,
      json: { status: "paused" }
    });
    assert.equal(missingPatch.status, 404);

    const doc = await (await request(ctx, `/projects/${project.id}/documents`, {
      method: "POST",
      headers: auth,
      json: { title: "纪要", body_md: "# notes" }
    })).json();
    assert.equal(doc.document.title, "纪要");
    const updatedDoc = await (await request(ctx, `/projects/${project.id}/documents/${doc.document.id}`, {
      method: "PATCH",
      headers: auth,
      json: { body_md: "updated" }
    })).json();
    assert.equal(updatedDoc.document.body_md, "updated");
    const deleted = await (await request(ctx, `/projects/${project.id}/documents/${doc.document.id}`, {
      method: "DELETE",
      headers: auth
    })).json();
    assert.equal(deleted.deleted, true);
  } finally {
    ctx.close();
  }
});

test("tool data writes canonicalize unsafe IDs before persistence", async () => {
  const ctx = await setup();
  try {
    const token = (await (await request(ctx, "/token")).json()).token;
    const auth = { "X-Toolkit-Token": token };
    const project = (await (await request(ctx, "/projects", {
      method: "POST",
      headers: auth,
      json: { name: "XSS check" }
    })).json()).project;
    const badReq = "x1');fetch('/token');//";
    const badCol = "x2\" onmouseover=\"alert(1)";
    const put = await request(ctx, `/projects/${project.id}/tooldata/qfd/main`, {
      method: "PUT",
      headers: auth,
      json: {
        data: {
          title: "bad",
          reqs: [{ id: badReq, name: "<img src=x onerror=alert(1)>", imp: "5<script>", cur: "nope", tgt: 4, sp: 1 }],
          cols: [{ id: badCol, name: "column" }],
          rel: { [`${badReq}|${badCol}`]: 9 },
          roof: {}
        }
      }
    });
    assert.equal(put.status, 200);
    const body = await put.json();
    const stored = body.tool_data.data;
    assert.match(stored.reqs[0].id, /^x\d+$/);
    assert.match(stored.cols[0].id, /^x\d+$/);
    assert.notEqual(stored.reqs[0].id, badReq);
    assert.notEqual(stored.cols[0].id, badCol);
    assert.deepEqual(Object.keys(stored.rel), [`${stored.reqs[0].id}|${stored.cols[0].id}`]);
    assert.doesNotMatch(JSON.stringify(stored), /<|>|fetch\('|onmouseover/);
  } finally {
    ctx.close();
  }
});

test("invalid tool and traversal attempts are rejected", async () => {
  const ctx = await setup();
  try {
    const token = (await (await request(ctx, "/token")).json()).token;
    const auth = { "X-Toolkit-Token": token };
    const project = (await (await request(ctx, "/projects", {
      method: "POST",
      headers: auth,
      json: { name: "A" }
    })).json()).project;

    const invalidTool = await request(ctx, `/projects/${project.id}/tooldata/..%2Fetc/default`, {
      method: "PUT",
      headers: auth,
      json: { data: {} }
    });
    assert.equal(invalidTool.status, 400);

    const traversal = await request(ctx, "/..%2F..%2Fconfig.js");
    assert.equal(traversal.status, 403);
  } finally {
    ctx.close();
  }
});
