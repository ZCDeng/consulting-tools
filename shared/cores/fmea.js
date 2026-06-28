(function(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.ToolkitCores = root.ToolkitCores || {};
  root.ToolkitCores.fmea = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function() {
  function n(value) {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  function rpnOf(row, suffix = "") {
    const s = n(row[`s${suffix}`]);
    const o = n(row[`o${suffix}`]);
    const d = n(row[`d${suffix}`]);
    return s && o && d ? s * o * d : null;
  }

  function riskClass(value) {
    if (value == null) return "na";
    if (value >= 200) return "high";
    if (value >= 100) return "mid";
    return "low";
  }

  function compute(data = {}) {
    const rows = data.rows || [];
    const scored = rows.map(row => ({
      id: row.id,
      func: row.func || "",
      mode: row.mode || "",
      rpn: rpnOf(row),
      rpn_after: rpnOf(row, "2")
    }));
    const ranked = scored.filter(row => row.rpn != null).sort((a, b) => b.rpn - a.rpn);
    let high = 0;
    let mid = 0;
    let low = 0;
    let before = 0;
    let after = 0;
    const rowsOut = scored.map(row => {
      if (row.rpn != null) {
        if (row.rpn >= 200) high += 1;
        else if (row.rpn >= 100) mid += 1;
        else low += 1;
        before += row.rpn;
        after += row.rpn_after == null ? row.rpn : row.rpn_after;
      }
      return {
        ...row,
        rank: row.rpn == null ? null : ranked.findIndex(item => item.id === row.id) + 1,
        risk: riskClass(row.rpn),
        risk_after: riskClass(row.rpn_after)
      };
    });
    return {
      title: data.title || "",
      rows: rowsOut.sort((a, b) => (a.rank || Infinity) - (b.rank || Infinity)),
      summary: {
        count: rows.length,
        high,
        mid,
        low,
        total_before: before,
        total_after: after,
        reduction_percent: before > 0 ? Math.round((before - after) / before * 100) : 0
      }
    };
  }

  return { compute, rpnOf, riskClass };
});
