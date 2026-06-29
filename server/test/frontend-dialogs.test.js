const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

// Tauri's macOS WKWebView does not implement window.prompt(): it returns null
// with no UI, so any prompt()-based flow silently does nothing in the desktop
// app (this broke "create project"). Guard against reintroducing it. alert()
// and confirm() ARE implemented by wry, so they are allowed.
const sharedDir = path.join(__dirname, "..", "..", "shared");

test("shared frontend scripts do not call window.prompt (unsupported in webview)", () => {
  const files = fs.readdirSync(sharedDir).filter(name => name.endsWith(".js"));
  assert.ok(files.length > 0, "expected shared/*.js scripts to scan");
  for (const file of files) {
    const source = fs.readFileSync(path.join(sharedDir, file), "utf8");
    // Match a prompt( call that is not a property access (foo.prompt() ok) and
    // not our own promptText helper.
    const offending = /(?<![.\w])prompt\s*\(/.test(source);
    assert.ok(!offending, `${file} calls window.prompt(); use the in-DOM promptText() dialog instead`);
  }
});
