const assert = require("node:assert/strict");
const test = require("node:test");
const { sanitizeToolData } = require("../../shared/data-sanitize");

test("sanitizer rewrites unsafe QFD IDs and relationship keys", () => {
  const reqId = "x1');fetch('/token');//";
  const colId = "x2\" onclick=\"alert(1)";
  const data = sanitizeToolData("qfd", {
    reqs: [{ id: reqId, name: "Need", imp: "5x", cur: "bad", tgt: 4, sp: 1 }],
    cols: [{ id: colId, name: "Module" }],
    rel: { [`${reqId}|${colId}`]: 9, [`${reqId}|missing`]: 9 },
    roof: {}
  });
  assert.match(data.reqs[0].id, /^x\d+$/);
  assert.match(data.cols[0].id, /^x\d+$/);
  assert.deepEqual(data.rel, { [`${data.reqs[0].id}|${data.cols[0].id}`]: 9 });
});

test("sanitizer keeps Pugh datum and Kano selection aligned with canonical IDs", () => {
  const pugh = sanitizeToolData("pugh", {
    datumId: "base",
    crits: [{ id: "crit", name: "C", weight: 3 }],
    opts: [{ id: "base", name: "Base" }, { id: "opt", name: "A" }],
    cell: { "crit|opt": 2 }
  });
  assert.equal(pugh.datumId, pugh.opts[0].id);
  assert.deepEqual(pugh.cell, { [`${pugh.crits[0].id}|${pugh.opts[1].id}`]: 2 });

  const kano = sanitizeToolData("kano", {
    sel: "bad-id",
    items: [{ id: "bad-id", name: "Feature", A: 1, O: 2, M: 3, I: 4, R: -1, Q: "x" }]
  });
  assert.equal(kano.sel, kano.items[0].id);
  assert.equal(kano.items[0].R, 0);
  assert.equal(kano.items[0].Q, 0);
});
