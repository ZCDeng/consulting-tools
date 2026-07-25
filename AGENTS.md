# Consulting Toolkit Agent Notes

The toolkit is now agent-first. Two ways to drive it:

- **CLI (preferred for agents):** `npx consulting-toolkit <verb>` — zero-dependency, pure-JSON stdout, structured errors on stderr. Verbs: `list_projects`, `create_project`, `update_project`, `get_tool_data`, `set_tool_data`, `compute_results`, `add_document`, `schema`. Run `schema` first to get each tool's `data_json` shape.
- **MCP:** `server/mcp/index.js` (see `.mcp.json`). Read the `toolkit://schema` resource first.

Core flow (either surface):

1. `create_project`
2. `set_tool_data`
3. `compute_results`
4. `add_document` when notes are needed
5. `export_pdf` (MCP/host only — not a CLI verb) for a local PDF under the active data dir's `exports/`. Storage defaults to the platform app-data dir (macOS: `~/Library/Application Support/com.zcdeng.consulting-tools/data`), shared by CLI, MCP, and the desktop app; override with `TOOLKIT_DATA_DIR` / `TOOLKIT_DB_PATH`.

Use only the tool enum values `kano`, `ce`, `qfd`, `pugh`, `fmea`, and `montecarlo`. Requires Node >= 25 (built-in `node:sqlite`). PDF export is host-side (desktop / `npm start`), which owns the Playwright dependency — the published core package does not pull Chromium.

