const { z } = require("zod");
const core = require("../../packages/core");

const { projects, tooldata, documents, computeResults, schema, config } = core;
const TOOL_ENUM = z.enum(config.TOOL_NAMES);

function text(value) {
  return {
    content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }]
  };
}

function registerToolkitTools(server, { exportPdf } = {}) {
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
      status: z.enum(config.PROJECT_STATUSES).optional()
    }
  }, async args => text({ project: projects.createProject(args) }));

  server.registerTool("update_project", {
    description: "Update a local consulting project (rename, archive, notes).",
    inputSchema: {
      project_id: z.string(),
      name: z.string().optional(),
      client: z.string().optional(),
      notes: z.string().optional(),
      status: z.enum(config.PROJECT_STATUSES).optional()
    }
  }, async args => {
    const { project_id, ...patch } = args;
    const project = projects.updateProject(project_id, patch);
    if (!project) throw new Error("Project not found");
    return text({ project });
  });

  server.registerTool("get_tool_data", {
    description: "Read one tool instance from a project.",
    inputSchema: {
      project_id: z.string(),
      tool: TOOL_ENUM,
      instance: z.string().optional()
    }
  }, async args => text({ tool_data: tooldata.getToolData(args.project_id, args.tool, args.instance || "default") }));

  server.registerTool("set_tool_data", {
    description: "Upsert one tool instance using the existing localStorage-shaped data_json.",
    inputSchema: {
      project_id: z.string(),
      tool: TOOL_ENUM,
      instance: z.string().optional(),
      data: z.record(z.string(), z.any())
    }
  }, async args => text({ tool_data: tooldata.setToolData(args.project_id, args.tool, args.instance || "default", args.data) }));

  server.registerTool("compute_results", {
    description: "Compute browser-independent conclusions for a tool data payload.",
    inputSchema: {
      tool: TOOL_ENUM,
      data: z.record(z.string(), z.any()),
      iterations: z.number().int().positive().max(core.cores.montecarlo.limits.MAX_ITERATIONS).optional(),
      seed: z.number().optional()
    }
  }, async args => text({ result: computeResults(args.tool, args.data, { iterations: args.iterations, seed: args.seed }) }));

  server.registerTool("add_document", {
    description: "Add a Markdown document or note to a project.",
    inputSchema: {
      project_id: z.string(),
      title: z.string(),
      body_md: z.string()
    }
  }, async args => text({ document: documents.addDocument(args.project_id, args) }));

  if (exportPdf) {
    server.registerTool("export_pdf", {
      description: "Export a tool instance to PDF. Saves under the toolkit exports dir when save=true.",
      inputSchema: {
        project_id: z.string(),
        tool: TOOL_ENUM,
        instance: z.string().optional(),
        theme: z.enum(["light", "dark"]).optional(),
        save: z.boolean().optional()
      }
    }, async args => text(await exportPdf({
      projectId: args.project_id,
      tool: args.tool,
      instance: args.instance || "default",
      theme: args.theme || "dark",
      save: args.save !== false
    })));
  }
}

module.exports = {
  registerToolkitTools,
  text
};
