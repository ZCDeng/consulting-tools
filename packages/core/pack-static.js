// Prepare the publish bundle: copy the browser asset root (packages/static)
// into packages/core/static and vendor the compute cores + sanitizer into
// static/shared/core so the seven HTML pages load them via <script src> while
// Node consumes the same files via require (UMD, KTD8). The published package
// then contains core + CLI + static under one name.

const fsp = require("node:fs");
const path = require("node:path");

const coreDir = __dirname;
const repoStatic = path.resolve(coreDir, "..", "static");
const outStatic = path.join(coreDir, "static");

function rmrf(p) { if (fsp.existsSync(p)) fsp.rmSync(p, { recursive: true, force: true }); }
function cp(src, dest) {
  fsp.mkdirSync(path.dirname(dest), { recursive: true });
  fsp.copyFileSync(src, dest);
}
function walk(dir, acc = []) {
  for (const entry of fsp.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else acc.push(full);
  }
  return acc;
}

function main() {
  rmrf(outStatic);
  // 1) copy browser assets (7 HTML + fonts + shared/storage.js + shared/project-bar.js)
  for (const file of walk(repoStatic)) {
    const rel = path.relative(repoStatic, file);
    cp(file, path.join(outStatic, rel));
  }
  // 2) vendor compute cores + sanitizer for the browser
  const coreOut = path.join(outStatic, "shared", "core");
  cp(path.join(coreDir, "data-sanitize.js"), path.join(coreOut, "data-sanitize.js"));
  for (const name of fsp.readdirSync(path.join(coreDir, "cores"))) {
    cp(path.join(coreDir, "cores", name), path.join(coreOut, "cores", name));
  }
  // eslint-disable-next-line no-console
  console.log(`pack: staged static root at ${path.relative(process.cwd(), outStatic)}`);
}

main();
