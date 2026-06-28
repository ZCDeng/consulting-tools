(function(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.ToolkitCores = root.ToolkitCores || {};
  root.ToolkitCores.kano = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function() {
  const PRIO = ["M", "O", "A", "I"];

  function nv(value) {
    const n = parseInt(value, 10);
    return Number.isNaN(n) || n < 0 ? 0 : n;
  }

  function calc(item) {
    const A = nv(item.A);
    const O = nv(item.O);
    const M = nv(item.M);
    const I = nv(item.I);
    const N = A + O + M + I;
    let cat = "";
    let better = 0;
    let worse = 0;
    if (N > 0) {
      better = (A + O) / N;
      worse = -(M + O) / N;
      const counts = { M, O, A, I };
      let best = -1;
      PRIO.forEach(key => {
        if (counts[key] > best) {
          best = counts[key];
          cat = key;
        }
      });
    }
    return { A, O, M, I, R: nv(item.R), Q: nv(item.Q), N, cat, better, worse };
  }

  function compute(data = {}) {
    const items = (data.items || []).map(item => ({ id: item.id, name: item.name || "", ...calc(item) }));
    const groups = { M: [], O: [], A: [], I: [] };
    items.forEach(item => {
      if (item.cat) groups[item.cat].push(item);
    });
    groups.O.sort((a, b) => (b.better + Math.abs(b.worse)) - (a.better + Math.abs(a.worse)));
    groups.A.sort((a, b) => b.better - a.better);
    return { title: data.title || "", items, groups };
  }

  return { compute, calc };
});
