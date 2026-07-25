const config = require("./config");
const schema = require("./schema");
const compute = require("./services/compute");
const projects = require("./services/projects");
const tooldata = require("./services/tooldata");
const documents = require("./services/documents");
const db = require("./db");

module.exports = {
  config,
  schema,
  computeResults: compute.computeResults,
  cores: compute.cores,
  projects,
  tooldata,
  documents,
  db
};
