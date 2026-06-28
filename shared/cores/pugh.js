(function(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.ToolkitCores = root.ToolkitCores || {};
  root.ToolkitCores.pugh = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function() {
  function num(value) {
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : 0;
  }

  function compute(data = {}) {
    const crits = data.crits || [];
    const opts = data.opts || [];
    const cell = data.cell || {};
    const results = opts.map(opt => {
      const datum = opt.id === data.datumId;
      let weighted = 0;
      let positive = 0;
      let negative = 0;
      let same = 0;
      crits.forEach(crit => {
        const value = datum ? 0 : num(cell[`${crit.id}|${opt.id}`]);
        weighted += num(crit.weight) * value;
        if (value > 0) positive += 1;
        else if (value < 0) negative += 1;
        else same += 1;
      });
      return { id: opt.id, name: opt.name || "", weighted, positive, negative, same, datum };
    });
    const ranked = results.filter(item => !item.datum).sort((a, b) => b.weighted - a.weighted);
    const totalPositive = ranked.reduce((sum, item) => sum + Math.max(0, item.weighted), 0) || 1;
    return {
      title: data.title || "",
      options: results.map(item => ({
        ...item,
        rank: item.datum ? null : ranked.findIndex(candidate => candidate.id === item.id) + 1,
        positive_percent: item.weighted > 0 ? item.weighted / totalPositive * 100 : 0
      })).sort((a, b) => (a.rank || Infinity) - (b.rank || Infinity))
    };
  }

  return { compute };
});
