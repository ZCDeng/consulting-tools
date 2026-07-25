(function(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.ToolkitDataSanitizer = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function() {
  const MAX_TEXT = 2000;
  const MAX_ITEMS = 128;
  const MAX_FORMULA = 500;
  const SAFE_ID = /^x\d+$/;

  function text(value, limit = MAX_TEXT) {
    if (value == null) return "";
    return String(value).replace(/[\u0000<>]/g, "").slice(0, limit);
  }

  function finite(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function int(value, fallback = 0) {
    const n = Math.trunc(finite(value, fallback));
    return n < 0 ? fallback : n;
  }

  function choice(value, allowed, fallback) {
    return allowed.includes(value) ? value : fallback;
  }

  function mapIds(items) {
    const out = [];
    const map = new Map();
    const used = new Set();
    let max = 0;
    items.forEach(item => {
      const id = text(item && item.id, 80);
      if (SAFE_ID.test(id)) max = Math.max(max, Number(id.slice(1)));
    });
    function nextId() {
      let id;
      do {
        max += 1;
        id = `x${max}`;
      } while (used.has(id));
      used.add(id);
      return id;
    }
    items.forEach(item => {
      const oldId = text(item && item.id, 80);
      const keep = SAFE_ID.test(oldId) && !used.has(oldId);
      const id = keep ? oldId : nextId();
      if (keep) used.add(id);
      if (oldId && !map.has(oldId)) map.set(oldId, id);
      out.push({ item: item || {}, id });
    });
    return { out, map };
  }

  function array(value) {
    return Array.isArray(value) ? value.slice(0, MAX_ITEMS) : [];
  }

  function mappedPairs(source, leftMap, rightMap, allowed, fallback = 0) {
    const result = {};
    Object.entries(source && typeof source === "object" ? source : {}).forEach(([key, value]) => {
      const [left, right] = String(key).split("|");
      const nextLeft = leftMap.get(left);
      const nextRight = rightMap.get(right);
      if (!nextLeft || !nextRight) return;
      const numeric = finite(value, fallback);
      if (!allowed.includes(numeric)) return;
      result[`${nextLeft}|${nextRight}`] = numeric;
    });
    return result;
  }

  function sanitizeQfd(data) {
    const reqIds = mapIds(array(data.reqs));
    const colIds = mapIds(array(data.cols));
    return {
      title: text(data.title),
      reqs: reqIds.out.map(({ item, id }) => ({
        id,
        name: text(item.name),
        imp: finite(item.imp, 3),
        kano: text(item.kano, 8),
        cur: finite(item.cur, 0),
        tgt: finite(item.tgt, 0),
        sp: finite(item.sp, 1)
      })),
      cols: colIds.out.map(({ item, id }) => ({ id, name: text(item.name) })),
      rel: mappedPairs(data.rel, reqIds.map, colIds.map, [1, 3, 9]),
      roof: mappedPairs(data.roof, colIds.map, colIds.map, [-2, -1, 1, 2])
    };
  }

  function sanitizeCe(data) {
    const rowIds = mapIds(array(data.rows));
    const colIds = mapIds(array(data.cols));
    return {
      title: text(data.title),
      rows: rowIds.out.map(({ item, id }) => ({ id, name: text(item.name) })),
      cols: colIds.out.map(({ item, id }) => ({ id, name: text(item.name), imp: finite(item.imp, 3) })),
      rel: mappedPairs(data.rel, rowIds.map, colIds.map, [1, 3, 9])
    };
  }

  function sanitizePugh(data) {
    const critIds = mapIds(array(data.crits));
    const optIds = mapIds(array(data.opts));
    const datumId = optIds.map.get(text(data.datumId, 80)) || null;
    return {
      title: text(data.title),
      datumId,
      crits: critIds.out.map(({ item, id }) => ({ id, name: text(item.name), weight: finite(item.weight, 1) })),
      opts: optIds.out.map(({ item, id }) => ({ id, name: text(item.name) })),
      cell: mappedPairs(data.cell, critIds.map, optIds.map, [-2, -1, 0, 1, 2])
    };
  }

  function sanitizeFmea(data) {
    const rowIds = mapIds(array(data.rows));
    const score = value => {
      const n = finite(value, 0);
      return n >= 1 && n <= 10 ? n : "";
    };
    return {
      title: text(data.title),
      rows: rowIds.out.map(({ item, id }) => ({
        id,
        func: text(item.func),
        mode: text(item.mode),
        effect: text(item.effect),
        s: score(item.s),
        cause: text(item.cause),
        o: score(item.o),
        control: text(item.control),
        d: score(item.d),
        action: text(item.action),
        s2: score(item.s2),
        o2: score(item.o2),
        d2: score(item.d2)
      }))
    };
  }

  function sanitizeKano(data) {
    const itemIds = mapIds(array(data.items));
    const selected = itemIds.map.get(text(data.sel, 80)) || null;
    return {
      title: text(data.title),
      sel: selected,
      items: itemIds.out.map(({ item, id }) => ({
        id,
        name: text(item.name),
        A: int(item.A),
        O: int(item.O),
        M: int(item.M),
        I: int(item.I),
        R: int(item.R),
        Q: int(item.Q)
      }))
    };
  }

  function sanitizeMontecarlo(data) {
    const varIds = mapIds(array(data.vars).slice(0, 64));
    return {
      title: text(data.title),
      vars: varIds.out.map(({ item, id }) => ({
        id,
        name: text(item.name, 80),
        unit: text(item.unit, 80),
        dist: choice(item.dist, ["tri", "norm", "unif", "fixed"], "fixed"),
        p: {
          min: finite(item.p && item.p.min, 0),
          mode: finite(item.p && item.p.mode, 0),
          max: finite(item.p && item.p.max, 0),
          mean: finite(item.p && item.p.mean, 0),
          sd: finite(item.p && item.p.sd, 0),
          val: finite(item.p && item.p.val, 0)
        }
      })),
      formula: text(data.formula, MAX_FORMULA),
      target: data.target === "" || data.target == null ? "" : finite(data.target, 0),
      dir: choice(data.dir, ["ge", "le"], "ge"),
      iterations: data.iterations == null ? undefined : int(data.iterations, 10000)
    };
  }

  function sanitizeToolData(tool, input) {
    const data = input && typeof input === "object" ? input : {};
    switch (tool) {
      case "qfd": return sanitizeQfd(data);
      case "ce": return sanitizeCe(data);
      case "pugh": return sanitizePugh(data);
      case "fmea": return sanitizeFmea(data);
      case "kano": return sanitizeKano(data);
      case "montecarlo": return sanitizeMontecarlo(data);
      default: return {};
    }
  }

  return {
    sanitizeToolData,
    text,
    finite,
    limits: { MAX_TEXT, MAX_ITEMS, MAX_FORMULA }
  };
});
