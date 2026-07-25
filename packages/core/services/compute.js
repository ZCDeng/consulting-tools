const { assertTool } = require("./tooldata");
const { sanitizeToolData } = require("../data-sanitize");

const cores = {
  kano: require("../cores/kano"),
  ce: require("../cores/ce"),
  qfd: require("../cores/qfd"),
  pugh: require("../cores/pugh"),
  fmea: require("../cores/fmea"),
  montecarlo: require("../cores/montecarlo")
};

function computeResults(tool, data, options = {}) {
  assertTool(tool);
  if (tool === "montecarlo" && Array.isArray(data && data.vars) && data.vars.length > cores.montecarlo.limits.MAX_VARS) {
    throw new Error(`变量数量不能超过 ${cores.montecarlo.limits.MAX_VARS}。`);
  }
  return cores[tool].compute(sanitizeToolData(tool, data || {}), options);
}

module.exports = {
  computeResults,
  cores
};
