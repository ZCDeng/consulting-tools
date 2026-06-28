const { assertTool } = require("./tooldata");
const { sanitizeToolData } = require("../../shared/data-sanitize");

const cores = {
  kano: require("../../shared/cores/kano"),
  ce: require("../../shared/cores/ce"),
  qfd: require("../../shared/cores/qfd"),
  pugh: require("../../shared/cores/pugh"),
  fmea: require("../../shared/cores/fmea"),
  montecarlo: require("../../shared/cores/montecarlo")
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
