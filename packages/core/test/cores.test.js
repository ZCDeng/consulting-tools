const assert = require("node:assert/strict");
const test = require("node:test");
const compute = require("../services/compute");
test("QFD ranks the membership platform first on sample-shaped data", () => {
  const data = {
    title: "数字化转型",
    reqs: [
      { id: "r1", name: "降低运营成本", imp: 5, cur: 2, tgt: 4, sp: 1.2 },
      { id: "r2", name: "提升会员复购", imp: 5, cur: 2, tgt: 4, sp: 1.5 }
    ],
    cols: [{ id: "c1", name: "会员中台" }, { id: "c2", name: "BI 数据看板" }],
    rel: { "r1|c1": 3, "r1|c2": 1, "r2|c1": 9, "r2|c2": 3 },
    roof: {}
  };
  const result = compute.computeResults("qfd", data);
  assert.equal(result.columns[0].name, "会员中台");
  assert.equal(Math.round(result.columns[0].score), 171);
});

test("FMEA computes before/after RPN summary", () => {
  const result = compute.computeResults("fmea", {
    title: "risk",
    rows: [
      { id: "a", func: "A", s: 7, o: 7, d: 6, s2: 7, o2: 3, d2: 4 },
      { id: "b", func: "B", s: 5, o: 4, d: 4 }
    ]
  });
  assert.equal(result.rows[0].rpn, 294);
  assert.equal(result.summary.total_before, 374);
  assert.equal(result.summary.total_after, 164);
});

test("Pugh and CE return ranked decisions", () => {
  const pugh = compute.computeResults("pugh", {
    datumId: "base",
    crits: [{ id: "c1", weight: 3 }, { id: "c2", weight: 5 }],
    opts: [{ id: "base", name: "基准" }, { id: "a", name: "A" }, { id: "b", name: "B" }],
    cell: { "c1|a": 1, "c2|a": 2, "c1|b": -1, "c2|b": 1 }
  });
  assert.equal(pugh.options[0].name, "A");

  const ce = compute.computeResults("ce", {
    rows: [{ id: "r1", name: "流程" }, { id: "r2", name: "系统" }],
    cols: [{ id: "c1", imp: 9 }, { id: "c2", imp: 3 }],
    rel: { "r1|c1": 1, "r1|c2": 3, "r2|c1": 9, "r2|c2": 1 }
  });
  assert.equal(ce.rows[0].name, "系统");
});

test("Kano computes category and better/worse", () => {
  const result = compute.computeResults("kano", {
    items: [{ id: "i1", name: "自动化", A: 16, O: 4, M: 2, I: 14, R: 0, Q: 0 }]
  });
  assert.equal(result.items[0].cat, "A");
  assert.equal(Number(result.items[0].better.toFixed(2)), 0.56);
  assert.equal(Number(Math.abs(result.items[0].worse).toFixed(2)), 0.17);
});

test("Monte Carlo safe parser is deterministic and rejects executable syntax", () => {
  const data = {
    vars: [
      { name: "节省 A", dist: "fixed", p: { val: 100 } },
      { name: "投入", dist: "fixed", p: { val: 40 } }
    ],
    formula: "节省 A * 3 - 投入",
    target: 200,
    dir: "ge"
  };
  const first = compute.computeResults("montecarlo", data, { iterations: 20, seed: 1 });
  const second = compute.computeResults("montecarlo", data, { iterations: 20, seed: 1 });
  assert.deepEqual(first, second);
  assert.equal(first.mean, 260);
  assert.equal(first.probability, 1);

  assert.throws(() => compute.computeResults("montecarlo", {
    ...data,
    formula: "process.exit()"
  }), /process/);
  assert.throws(() => compute.computeResults("montecarlo", {
    ...data,
    formula: "constructor"
  }), /constructor/);
  assert.throws(() => compute.computeResults("montecarlo", {
    ...data,
    formula: "`bad`"
  }), /不支持/);
});

test("Monte Carlo rejects oversized work requests", () => {
  const data = {
    vars: [{ id: "x1", name: "A", dist: "fixed", p: { val: 1 } }],
    formula: "A"
  };
  assert.throws(() => compute.computeResults("montecarlo", data, { iterations: 50001 }), /50000/);
  assert.throws(() => compute.computeResults("montecarlo", {
    vars: Array.from({ length: 65 }, (_, index) => ({ id: `v${index}`, name: `V${index}`, dist: "fixed", p: { val: 1 } })),
    formula: "V0"
  }), /64/);
});
