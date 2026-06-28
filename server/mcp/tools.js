const { z } = require("zod");
const projects = require("../services/projects");
const tooldata = require("../services/tooldata");
const documents = require("../services/documents");
const compute = require("../services/compute");
const schema = require("./schema");
const montecarlo = require("../../shared/cores/montecarlo");

function text(value) {
  return {
    content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }]
  };
}

function registerToolkitTools(server) {
  server.registerResource("toolkit-schema", "toolkit://schema", {
    title: "Consulting Toolkit Schema",
    description: "Data shapes for the six consulting tools.",
    mimeType: "application/json"
  }, async () => ({
    contents: [{ uri: "toolkit://schema", mimeType: "application/json", text: JSON.stringify(schema, null, 2) }]
  }));

  server.registerTool("list_projects", {
    description: "List local consulting toolkit projects.",
    inputSchema: {}
  }, async () => text({ projects: projects.listProjects() }));

  server.registerTool("create_project", {
    description: "Create a local consulting project.",
    inputSchema: {
      name: z.string(),
      client: z.string().optional(),
      notes: z.string().optional(),
      status: z.enum(["active", "paused", "archived"]).optional()
    }
  }, async args => text({ project: projects.createProject(args) }));

  server.registerTool("get_tool_data", {
    description: "Read one tool instance from a project.",
    inputSchema: {
      project_id: z.string(),
      tool: z.enum(["kano", "ce", "qfd", "pugh", "fmea", "montecarlo"]),
      instance: z.string().optional()
    }
  }, async args => text({ tool_data: tooldata.getToolData(args.project_id, args.tool, args.instance || "default") }));

  server.registerTool("set_tool_data", {
    description: "Upsert one tool instance using the existing localStorage-shaped data_json.",
    inputSchema: {
      project_id: z.string(),
      tool: z.enum(["kano", "ce", "qfd", "pugh", "fmea", "montecarlo"]),
      instance: z.string().optional(),
      data: z.record(z.string(), z.any())
    }
  }, async args => text({ tool_data: tooldata.setToolData(args.project_id, args.tool, args.instance || "default", args.data) }));

  server.registerTool("compute_results", {
    description: "Compute browser-independent conclusions for a tool data payload.",
    inputSchema: {
      tool: z.enum(["kano", "ce", "qfd", "pugh", "fmea", "montecarlo"]),
      data: z.record(z.string(), z.any()),
      iterations: z.number().int().positive().max(montecarlo.limits.MAX_ITERATIONS).optional(),
      seed: z.number().optional()
    }
  }, async args => text({ result: compute.computeResults(args.tool, args.data, { iterations: args.iterations, seed: args.seed }) }));

  server.registerTool("add_document", {
    description: "Add a Markdown document or note to a project.",
    inputSchema: {
      project_id: z.string(),
      title: z.string(),
      body_md: z.string()
    }
  }, async args => text({ document: documents.addDocument(args.project_id, args) }));

  server.registerTool("export_pdf", {
    description: "Export a tool instance to PDF. Saves under consulting-tools/server/data/exports when save=true.",
    inputSchema: {
      project_id: z.string(),
      tool: z.enum(["kano", "ce", "qfd", "pugh", "fmea", "montecarlo"]),
      instance: z.string().optional(),
      theme: z.enum(["light", "dark"]).optional(),
      save: z.boolean().optional()
    }
  }, async args => {
    const { exportPdf } = require("../pdf/render");
    const result = await exportPdf({
      projectId: args.project_id,
      tool: args.tool,
      instance: args.instance || "default",
      theme: args.theme || "dark",
      save: args.save !== false
    });
    return text(result);
  });
}

module.exports = {
  registerToolkitTools,
  text
};
