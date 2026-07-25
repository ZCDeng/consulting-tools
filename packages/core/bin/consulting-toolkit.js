#!/usr/bin/env node
"use strict";

// consulting-toolkit CLI — Agent-first entry (KTD4/KTD5/KTD11).
// stdout carries only successful JSON; errors are structured on stderr with a
// non-zero exit. Humans are a secondary audience (`--help`), not the target.

const MIN_NODE_MAJOR = 25;

function nodeGate() {
  const major = Number(process.versions.node.split(".")[0]);
  if (major < MIN_NODE_MAJOR) {
    process.stderr.write(JSON.stringify({
      error: {
        code: "NODE_VERSION_UNSUPPORTED",
        message: `consulting-toolkit requires Node >= ${MIN_NODE_MAJOR} (built-in node:sqlite); current is ${process.versions.node}`,
        retryable: false
      }
    }) + "\n");
    process.exit(2);
  }
}

const USAGE = `consulting-toolkit — Agent-first CLI for the consulting quantitative toolkit

Usage:
  consulting-toolkit <verb> [--key value ...] [--data '<json>']

Verbs:
  list_projects
  create_project      --name <str> [--client <str>] [--notes <str>] [--status active|paused|archived]
  update_project      --project_id <id> [--name <str>] [--client <str>] [--notes <str>] [--status <str>]
  get_tool_data       --project_id <id> --tool <tool> [--instance <str>]
  set_tool_data       --project_id <id> --tool <tool> [--instance <str>] --data '<json>'
  compute_results     --tool <tool> --data '<json>' [--iterations <n>] [--seed <n>]
  add_document        --project_id <id> --title <str> [--body_md <str>]
  schema

Tools: kano, ce, qfd, pugh, fmea, montecarlo
Input: pass JSON payloads via --data '<json>' or pipe JSON on stdin.
Output: successful results are JSON on stdout; errors are JSON on stderr with non-zero exit.
Env: TOOLKIT_DATA_DIR, TOOLKIT_DB_PATH, TOOLKIT_EXPORTS_DIR override storage locations.
Requires Node >= ${MIN_NODE_MAJOR}.
`;

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--") { args._.push(...argv.slice(i + 1)); break; }
    if (token.startsWith("--")) {
      const eq = token.indexOf("=");
      if (eq !== -1) {
        args[token.slice(2, eq)] = token.slice(eq + 1);
      } else {
        const key = token.slice(2);
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith("--")) { args[key] = next; i += 1; }
        else { args[key] = true; }
      }
    } else {
      args._.push(token);
    }
  }
  return args;
}

function readStdinJson() {
  return new Promise(resolve => {
    if (process.stdin.isTTY) return resolve(undefined);
    let buf = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", chunk => { buf += chunk; });
    process.stdin.on("end", () => {
      const trimmed = buf.trim();
      if (!trimmed) return resolve(undefined);
      try { resolve(JSON.parse(trimmed)); } catch { resolve(undefined); }
    });
    process.stdin.resume();
  });
}

async function main() {
  nodeGate();
  const { succeed, fail } = require("../cli/output");
  const { makeVerbs } = require("../cli/verbs");

  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write(USAGE);
    return;
  }

  const parsed = parseArgs(argv);
  const verbName = parsed._[0];
  const stdin = await readStdinJson();

  // Merge: stdin JSON provides `data` (and defaults) unless flags override.
  const args = { ...(stdin && typeof stdin === "object" ? stdin : {}), ...parsed, _: undefined };
  delete args._;
  if (typeof args.data === "string") {
    try { args.data = JSON.parse(args.data); }
    catch { return fail(Object.assign(new Error("--data must be valid JSON"), { statusCode: 400 })); }
  }

  const core = require("../index");
  const verbs = makeVerbs(core);
  const verb = verbs[verbName];
  if (!verb) {
    return fail(Object.assign(new Error(`unknown verb: ${verbName || "(none)"}. Run with --help.`), { statusCode: 400 }));
  }

  try {
    succeed(verb(args));
  } catch (error) {
    fail(error);
  }
}

main().catch(error => {
  require("../cli/output").fail(error);
});
