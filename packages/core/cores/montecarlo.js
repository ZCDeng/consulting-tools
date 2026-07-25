(function(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.ToolkitCores = root.ToolkitCores || {};
  root.ToolkitCores.montecarlo = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function() {
  const FUNCS = {
    min: Math.min,
    max: Math.max,
    abs: Math.abs,
    sqrt: Math.sqrt,
    pow: Math.pow,
    log: Math.log,
    exp: Math.exp,
    round: Math.round,
    floor: Math.floor,
    ceil: Math.ceil
  };
  const MAX_ITERATIONS = 50000;
  const MAX_VARS = 64;

  function makeRandom(seed) {
    if (seed == null) return Math.random;
    let state = Number(seed) >>> 0;
    return function() {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 4294967296;
    };
  }

  function tokenize(formula, vars) {
    const tokens = [];
    const names = vars.map((variable, index) => ({ name: String(variable.name || ""), index }))
      .filter(item => item.name)
      .sort((a, b) => b.name.length - a.name.length);
    let i = 0;
    while (i < formula.length) {
      const ch = formula[i];
      if (/\s/.test(ch)) {
        i += 1;
        continue;
      }
      const match = names.find(item => formula.startsWith(item.name, i));
      if (match) {
        tokens.push({ type: "var", value: match.index });
        i += match.name.length;
        continue;
      }
      if (/[0-9.]/.test(ch)) {
        const rest = formula.slice(i);
        const number = rest.match(/^(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/i);
        if (!number) throw new Error(`非法数字: ${rest.slice(0, 12)}`);
        tokens.push({ type: "number", value: Number(number[0]) });
        i += number[0].length;
        continue;
      }
      if ("+-*/(),".includes(ch)) {
        tokens.push({ type: ch, value: ch });
        i += 1;
        continue;
      }
      if (/[A-Za-z_]/.test(ch)) {
        const identifier = formula.slice(i).match(/^[A-Za-z_][A-Za-z0-9_]*/)[0];
        if (identifier === "PI") tokens.push({ type: "number", value: Math.PI });
        else if (identifier === "E") tokens.push({ type: "number", value: Math.E });
        else if (Object.hasOwn(FUNCS, identifier)) tokens.push({ type: "func", value: identifier });
        else throw new Error(`公式里的「${identifier}」不是已定义的变量名。`);
        i += identifier.length;
        continue;
      }
      throw new Error(`公式包含不支持的字符「${ch}」。`);
    }
    return tokens;
  }

  function compile(vars, formula) {
    const tokens = tokenize(String(formula || ""), vars || []);
    let pos = 0;
    function peek() { return tokens[pos]; }
    function take(type) {
      const token = tokens[pos];
      if (!token || token.type !== type) throw new Error(`公式语法错误: 期望 ${type}`);
      pos += 1;
      return token;
    }
    function expression() {
      let node = term();
      while (peek() && (peek().type === "+" || peek().type === "-")) {
        const op = take(peek().type).type;
        const right = term();
        const left = node;
        node = values => op === "+" ? left(values) + right(values) : left(values) - right(values);
      }
      return node;
    }
    function term() {
      let node = factor();
      while (peek() && (peek().type === "*" || peek().type === "/")) {
        const op = take(peek().type).type;
        const right = factor();
        const left = node;
        node = values => op === "*" ? left(values) * right(values) : left(values) / right(values);
      }
      return node;
    }
    function factor() {
      const token = peek();
      if (!token) throw new Error("公式语法错误: 结尾不完整");
      if (token.type === "+") {
        take("+");
        return factor();
      }
      if (token.type === "-") {
        take("-");
        const inner = factor();
        return values => -inner(values);
      }
      if (token.type === "number") {
        take("number");
        return () => token.value;
      }
      if (token.type === "var") {
        take("var");
        return values => values[token.value];
      }
      if (token.type === "(") {
        take("(");
        const inner = expression();
        take(")");
        return inner;
      }
      if (token.type === "func") {
        const name = take("func").value;
        take("(");
        const args = [];
        if (peek() && peek().type !== ")") {
          args.push(expression());
          while (peek() && peek().type === ",") {
            take(",");
            args.push(expression());
          }
        }
        take(")");
        return values => FUNCS[name](...args.map(arg => arg(values)));
      }
      throw new Error("公式语法错误");
    }
    const fn = expression();
    if (pos !== tokens.length) throw new Error("公式语法错误: 存在多余内容");
    return fn;
  }

  function rtri(min, mode, max, random) {
    if (!(max > min)) return min;
    if (mode < min) mode = min;
    if (mode > max) mode = max;
    const u = random();
    const F = (mode - min) / (max - min);
    if (u < F) return min + Math.sqrt(u * (max - min) * (mode - min));
    return max - Math.sqrt((1 - u) * (max - min) * (max - mode));
  }

  function rnorm(mean, sd, random) {
    let u = 0;
    let v = 0;
    while (u === 0) u = random();
    while (v === 0) v = random();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function sampleVar(variable, random) {
    const p = variable.p || {};
    const n = value => {
      const parsed = Number(value);
      if (!Number.isFinite(parsed)) throw new Error("变量参数必须是有限数值。");
      return parsed;
    };
    switch (variable.dist) {
      case "tri": return rtri(n(p.min), n(p.mode), n(p.max), random);
      case "norm": return rnorm(n(p.mean), n(p.sd), random);
      case "unif": return n(p.min) + (n(p.max) - n(p.min)) * random();
      case "fixed": return n(p.val);
      default: return 0;
    }
  }

  function normalizeIterations(value) {
    const iterations = Math.trunc(Number(value == null ? 10000 : value));
    if (!Number.isFinite(iterations) || iterations < 1) throw new Error("iterations 必须是正整数。");
    if (iterations > MAX_ITERATIONS) throw new Error(`iterations 不能超过 ${MAX_ITERATIONS}。`);
    return iterations;
  }

  function percentile(sorted, p) {
    const idx = (sorted.length - 1) * p;
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
  }

  function pearson(x, y, meanY) {
    let meanX = 0;
    for (const value of x) meanX += value;
    meanX /= x.length || 1;
    let sxy = 0;
    let sxx = 0;
    let syy = 0;
    for (let i = 0; i < x.length; i += 1) {
      const dx = x[i] - meanX;
      const dy = y[i] - meanY;
      sxy += dx * dy;
      sxx += dx * dx;
      syy += dy * dy;
    }
    const denom = Math.sqrt(sxx * syy);
    return denom > 0 ? sxy / denom : 0;
  }

  function compute(data = {}, options = {}) {
    const vars = data.vars || [];
    if (!vars.length) throw new Error("还没有任何变量。");
    if (vars.length > MAX_VARS) throw new Error(`变量数量不能超过 ${MAX_VARS}。`);
    if (!data.formula || !String(data.formula).trim()) throw new Error("请填写输出公式。");
    const fn = compile(vars, data.formula);
    const iterations = normalizeIterations(options.iterations || data.iterations || 10000);
    const random = options.random || makeRandom(options.seed);
    const out = new Array(iterations);
    const samples = vars.map(() => new Array(iterations));
    const values = new Array(vars.length);
    for (let i = 0; i < iterations; i += 1) {
      for (let j = 0; j < vars.length; j += 1) {
        values[j] = sampleVar(vars[j], random);
        samples[j][i] = values[j];
      }
      const y = fn(values);
      if (typeof y !== "number" || !Number.isFinite(y)) throw new Error("公式结果不是有限数值,检查参数是否填全。");
      out[i] = y;
    }
    const sorted = [...out].sort((a, b) => a - b);
    const mean = out.reduce((sum, value) => sum + value, 0) / iterations;
    const sd = Math.sqrt(out.reduce((sum, value) => sum + (value - mean) ** 2, 0) / iterations);
    const target = parseFloat(data.target);
    const hasTarget = Number.isFinite(target);
    const ge = data.dir !== "le";
    const hit = hasTarget ? out.filter(value => ge ? value >= target : value <= target).length : null;
    const sensitivity = vars.map((variable, index) => ({
      name: variable.name || "",
      r: variable.dist === "fixed" ? 0 : pearson(samples[index], out, mean)
    })).filter((row, index) => vars[index].dist !== "fixed").sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
    return {
      title: data.title || "",
      iterations,
      mean,
      sd,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      p10: percentile(sorted, 0.1),
      p50: percentile(sorted, 0.5),
      p90: percentile(sorted, 0.9),
      target: hasTarget ? target : null,
      direction: ge ? "ge" : "le",
      hit,
      probability: hasTarget ? hit / iterations : null,
      sensitivity
    };
  }

  return { compute, compile, tokenize, makeRandom, normalizeIterations, limits: { MAX_ITERATIONS, MAX_VARS } };
});
