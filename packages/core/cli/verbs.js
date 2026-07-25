const v = require("./validate");

// Verb layer: maps CLI verbs onto the core services. Each verb returns the
// JSON-able payload written to stdout. Mirrors the MCP verb surface plus
// update_project and schema (KTD4).

function makeVerbs(core) {
  const { projects, tooldata, documents, computeResults, schema } = core;

  return {
    list_projects() {
      return { projects: projects.listProjects() };
    },

    create_project(args) {
      return {
        project: projects.createProject({
          name: v.requireString(args.name, "name"),
          client: args.client,
          notes: args.notes,
          status: v.requireStatus(args.status)
        })
      };
    },

    update_project(args) {
      const projectId = v.requireString(args.project_id || args.id, "project_id");
      const result = projects.updateProject(projectId, {
        name: args.name,
        client: args.client,
        notes: args.notes,
        status: v.requireStatus(args.status)
      });
      if (!result) throw Object.assign(new Error("Project not found"), { statusCode: 404 });
      return { project: result };
    },

    get_tool_data(args) {
      const projectId = v.requireString(args.project_id, "project_id");
      const tool = v.requireTool(args.tool);
      const record = tooldata.getToolData(projectId, tool, args.instance || "default");
      if (!record) throw Object.assign(new Error("Tool data not found"), { statusCode: 404 });
      return { tool_data: record };
    },

    set_tool_data(args) {
      const projectId = v.requireString(args.project_id, "project_id");
      const tool = v.requireTool(args.tool);
      const data = v.requireObject(args.data, "data");
      return { tool_data: tooldata.setToolData(projectId, tool, args.instance || "default", data) };
    },

    compute_results(args) {
      const tool = v.requireTool(args.tool);
      const data = v.requireObject(args.data, "data");
      const result = computeResults(tool, data, {
        iterations: v.optionalInt(args.iterations, "iterations"),
        seed: v.optionalInt(args.seed, "seed")
      });
      return { result };
    },

    add_document(args) {
      const projectId = v.requireString(args.project_id, "project_id");
      const title = v.requireString(args.title, "title");
      const body = args.body_md == null ? "" : String(args.body_md);
      return { document: documents.addDocument(projectId, { title, body_md: body }) };
    },

    schema() {
      return { schema };
    }
  };
}

module.exports = { makeVerbs };
