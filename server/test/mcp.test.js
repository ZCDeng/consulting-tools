const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = require("@modelcontextprotocol/sdk/client/stdio.js");

function parseText(result) {
  assert.equal(result.content[0].type, "text");
  return JSON.parse(result.content[0].text);
}

test("MCP can create project, set data, compute, read schema, and add docs", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "toolkit-mcp-"));
  const client = new Client({ name: "toolkit-test", version: "0.1.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(__dirname, "..", "mcp", "index.js")],
    cwd: path.join(__dirname, ".."),
    env: {
      TOOLKIT_DB_PATH: path.join(dir, "toolkit.db")
    },
    stderr: "pipe"
  });
  try {
    await client.connect(transport);
    const schema = await client.readResource({ uri: "toolkit://schema" });
    assert.match(schema.contents[0].text, /qfd/);

    const created = parseText(await client.callTool({
      name: "create_project",
      arguments: { name: "MCP 项目", client: "A" }
    }));
    const projectId = created.project.id;

    const qfdData = {
      title: "QFD",
      reqs: [{ id: "r1", name: "复购", imp: 5, cur: 2, tgt: 4, sp: 1.5 }],
      cols: [{ id: "c1", name: "会员中台" }],
      rel: { "r1|c1": 9 },
      roof: {}
    };
    await client.callTool({
      name: "set_tool_data",
      arguments: { project_id: projectId, tool: "qfd", instance: "main", data: qfdData }
    });
    const computed = parseText(await client.callTool({
      name: "compute_results",
      arguments: { tool: "qfd", data: qfdData }
    }));
    assert.equal(computed.result.columns[0].name, "会员中台");
    const tooLarge = await client.callTool({
      name: "compute_results",
      arguments: {
        tool: "montecarlo",
        data: { vars: [{ name: "A", dist: "fixed", p: { val: 1 } }], formula: "A" },
        iterations: 50001
      }
    });
    assert.equal(tooLarge.isError, true);
    assert.match(tooLarge.content[0].text, /50000|Too big|maximum/i);

    const doc = parseText(await client.callTool({
      name: "add_document",
      arguments: { project_id: projectId, title: "Note", body_md: "body" }
    }));
    assert.equal(doc.document.title, "Note");
  } finally {
    await client.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
