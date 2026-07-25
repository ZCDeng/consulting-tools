(function(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.ToolkitCores = root.ToolkitCores || {};
  root.ToolkitCores.ce = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function() {
  function num(value) {
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : 0;
  }

  function compute(data = {}) {
    const rows = data.rows || [];
    const cols = data.cols || [];
    const rel = data.rel || {};
    const scores = rows.map(row => {
      const score = cols.reduce((sum, col) => sum + num(col.imp) * num(rel[`${row.id}|${col.id}`]), 0);
      return { id: row.id, name: row.name || "", score };
    });
    const total = scores.reduce((sum, row) => sum + row.score, 0) || 1;
    const ranked = [...scores].sort((a, b) => b.score - a.score);
    return {
      title: data.title || "",
      rows: scores.map(row => ({
        ...row,
        rank: ranked.findIndex(item => item.id === row.id) + 1,
        percent: row.score / total * 100
      })).sort((a, b) => a.rank - b.rank)
    };
  }

  return { compute };
});
