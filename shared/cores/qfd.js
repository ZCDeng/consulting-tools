(function(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.ToolkitCores = root.ToolkitCores || {};
  root.ToolkitCores.qfd = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function() {
  function num(value, fallback = 0) {
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function improvement(req) {
    const cur = num(req.cur);
    const tgt = num(req.tgt);
    if (!cur || !tgt || cur <= 0) return 1;
    return tgt / cur;
  }

  function absWeight(req) {
    return num(req.imp) * improvement(req) * num(req.sp, 1);
  }

  function rel(data, reqId, colId) {
    return (data.rel && data.rel[`${reqId}|${colId}`]) || 0;
  }

  function compute(data = {}) {
    const reqs = data.reqs || [];
    const cols = data.cols || [];
    const reqWeights = reqs.map(req => ({
      id: req.id,
      name: req.name || "",
      improvement: improvement(req),
      abs_weight: absWeight(req)
    }));
    const weightTotal = reqWeights.reduce((sum, req) => sum + req.abs_weight, 0) || 1;
    const columns = cols.map(col => {
      let score = 0;
      reqs.forEach(req => {
        score += absWeight(req) * rel(data, req.id, col.id);
      });
      return { id: col.id, name: col.name || "", score };
    });
    const totalScore = columns.reduce((sum, col) => sum + col.score, 0) || 1;
    const ranked = [...columns].sort((a, b) => b.score - a.score);
    return {
      title: data.title || "",
      requirements: reqWeights.map(req => ({
        ...req,
        relative_percent: req.abs_weight / weightTotal * 100
      })),
      columns: columns.map(col => ({
        ...col,
        rank: ranked.findIndex(item => item.id === col.id) + 1,
        percent: col.score / totalScore * 100
      })).sort((a, b) => a.rank - b.rank)
    };
  }

  return { compute, improvement, absWeight };
});
