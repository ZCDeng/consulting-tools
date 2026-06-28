const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { registerToolkitTools } = require("./tools");

function createMcpServer() {
  const server = new McpServer({
    name: "consulting-toolkit",
    version: "0.1.0"
  });
  registerToolkitTools(server);
  return server;
}

async function main() {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

if (require.main === module) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  createMcpServer
};
