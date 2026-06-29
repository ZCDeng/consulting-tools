# Consulting Toolkit Agent Notes

Start by reading the MCP resource `toolkit://schema`; it documents the localStorage-shaped `data_json` payload for each tool.

Core flow:

1. `create_project`
2. `set_tool_data`
3. `compute_results`
4. `add_document` when notes are needed
5. `export_pdf` for a local PDF under the active data dir's `exports/` (`server/data/exports` for `npm start`; the shared app-data dir `~/Library/Application Support/com.zcdeng.consulting-tools/data/exports` when running via the desktop app or this `.mcp.json`)

Use only the tool enum values `kano`, `ce`, `qfd`, `pugh`, `fmea`, and `montecarlo`.
