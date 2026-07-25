import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const projectRoot = path.resolve(new URL("..", import.meta.url).pathname);
const pakeRoot = process.env.PAKE_ROOT;
const buildRoot = path.join(projectRoot, "dist", "desktop-build");
const workspace = path.join(buildRoot, "Pake");
const stagedToolkit = path.join(workspace, "src-tauri", "resources", "consulting-tools");
const stagedBin = path.join(workspace, "src-tauri", "resources", "bin");
const cargoTargetDir = path.join(os.homedir(), ".cache", "consulting-tools-desktop", "pake-target");
const appName = "Consulting Tools";
const bundleId = "com.zcdeng.consulting-tools";
const appVersion = "0.1.0";
const signingIdentity = process.env.TOOLKIT_SIGNING_IDENTITY || "-";
const pnpmVersion = "pnpm@10.26.2";
const networkTimeoutMs = 15 * 60 * 1000;
const notaryProfile = process.env.TOOLKIT_NOTARY_PROFILE || "";
const installDir = process.env.TOOLKIT_INSTALL_DIR || "";

function run(command, args, options = {}) {
  console.log(`$ ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, {
    stdio: "inherit",
    cwd: options.cwd || projectRoot,
    env: { ...process.env, ...(options.env || {}) },
    timeout: options.timeout
  });
  if (result.error) {
    const timedOut = result.error.code === "ETIMEDOUT" && options.timeout;
    throw new Error(
      timedOut
        ? `${command} timed out after ${options.timeout} ms`
        : `${command} failed to run: ${result.error.message}`
    );
  }
  if (result.signal) {
    throw new Error(`${command} terminated by signal ${result.signal}`);
  }
  if (result.status !== 0) {
    throw new Error(`${command} exited with status ${result.status}`);
  }
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function replaceOrThrow(source, search, replacement, label) {
  if (!source.includes(search)) {
    throw new Error(`Could not patch Pake source: ${label}`);
  }
  return source.replace(search, replacement);
}

function copyDir(src, dest, filter = () => true) {
  fs.cpSync(src, dest, {
    recursive: true,
    force: true,
    dereference: false,
    filter: (source) => filter(path.relative(src, source), source)
  });
}

function writeEntitlements(file) {
  fs.writeFileSync(file, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>com.apple.security.cs.allow-jit</key>
    <true/>
    <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
    <true/>
    <key>com.apple.security.cs.disable-library-validation</key>
    <true/>
  </dict>
</plist>
`);
}

function findTargets(root, predicate, results = []) {
  if (!fs.existsSync(root)) return results;
  const stats = fs.lstatSync(root);
  if (stats.isSymbolicLink()) return results;
  if (predicate(root, stats)) results.push(root);
  if (!stats.isDirectory()) return results;
  for (const entry of fs.readdirSync(root)) {
    findTargets(path.join(root, entry), predicate, results);
  }
  return results;
}

function isMachO(file) {
  const fd = fs.openSync(file, "r");
  try {
    const buffer = Buffer.alloc(4);
    if (fs.readSync(fd, buffer, 0, 4, 0) !== 4) return false;
    const magic = buffer.toString("hex");
    return [
      "feedface",
      "feedfacf",
      "cefaedfe",
      "cffaedfe",
      "cafebabe",
      "bebafeca",
      "cafebabf"
    ].includes(magic);
  } finally {
    fs.closeSync(fd);
  }
}

function isBundleMainExecutable(file) {
  const parts = file.split(path.sep);
  for (let index = 0; index < parts.length; index += 1) {
    if (parts[index].endsWith(".app")
      && parts[index + 1] === "Contents"
      && parts[index + 2] === "MacOS"
      && index + 4 === parts.length) {
      return true;
    }
    if (parts[index].endsWith(".framework")) {
      const frameworkName = parts[index].replace(/\.framework$/, "");
      if (path.basename(file) === frameworkName) return true;
    }
  }
  return false;
}

function needsRuntimeEntitlements(file) {
  return path.basename(file) === "chrome-headless-shell";
}

function ensureCleanBuildDir() {
  fs.rmSync(buildRoot, { recursive: true, force: true });
  fs.mkdirSync(buildRoot, { recursive: true });
}

function copyPakeTemplate() {
  if (!pakeRoot) {
    throw new Error("Set PAKE_ROOT to a local Pake checkout, e.g. export PAKE_ROOT=/path/to/Pake");
  }
  if (!fs.existsSync(path.join(pakeRoot, "src-tauri", "Cargo.toml"))) {
    throw new Error(`Pake checkout not found at ${pakeRoot}`);
  }
  run("rsync", [
    "-a",
    "--delete",
    "--exclude",
    ".git",
    "--exclude",
    "node_modules",
    "--exclude",
    "src-tauri/target",
    "--exclude",
    "src-tauri/.pake",
    "--exclude",
    "*.app",
    `${pakeRoot}/`,
    `${workspace}/`
  ]);
}

function stageToolkitSource() {
  // New layout (U5/KTD9): stage the desktop host entry + the published core as
  // an npm pack tarball. The published package carries the static root (7 HTML
  // + fonts + shared) so no separate HTML/fonts copying is needed.
  fs.mkdirSync(stagedToolkit, { recursive: true });
  copyDir(path.join(projectRoot, "desktop", "host"), path.join(stagedToolkit, "host"), (relative) => {
    if (!relative) return true;
    const parts = relative.split(path.sep);
    return !["node_modules"].includes(parts[0]);
  });
  // Pack the core into a tarball for a hermetic, pre-publication install.
  run("node", [path.join(projectRoot, "packages", "core", "pack-static.js")], { cwd: path.join(projectRoot, "packages", "core") });
  run("npm", ["pack", path.join(projectRoot, "packages", "core"), "--pack-destination", stagedToolkit], { timeout: networkTimeoutMs });
}

function installServerDependencies() {
  const hostDir = path.join(stagedToolkit, "host");
  const tarball = fs.readdirSync(stagedToolkit).find(f => /^consulting-toolkit-.*\.tgz$/.test(f));
  if (!tarball) throw new Error("core tarball not found in staged toolkit");
  // Point the host's core dependency at the staged tarball (the repo uses a
  // file: link to ../../packages/core, which dangles once staged), then
  // install core + the host's own deps (playwright) from the lockfile-free set.
  const pkgPath = path.join(hostDir, "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  pkg.dependencies["consulting-toolkit"] = `file:../${tarball}`;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
  run("npm", ["install", "--omit=dev"], { cwd: hostDir, timeout: networkTimeoutMs });
  const browsersPath = path.join(os.homedir(), ".cache", "consulting-tools-desktop", "ms-playwright");
  fs.mkdirSync(browsersPath, { recursive: true });
  run("npm", ["run", "install-browser"], {
    cwd: hostDir,
    env: { PLAYWRIGHT_BROWSERS_PATH: browsersPath },
    timeout: networkTimeoutMs
  });
  copyDir(browsersPath, path.join(hostDir, "ms-playwright"));
  pruneUnusedPlaywrightBrowsers(path.join(hostDir, "ms-playwright"));
}

function pruneUnusedPlaywrightBrowsers(playwrightDir) {
  const hasHeadlessShell = fs.readdirSync(playwrightDir).some(entry => entry.startsWith("chromium_headless_shell-"));
  if (!hasHeadlessShell) return;
  for (const entry of fs.readdirSync(playwrightDir)) {
    if (/^chromium-\d+/.test(entry)) {
      fs.rmSync(path.join(playwrightDir, entry), { recursive: true, force: true });
    }
  }
}

function curl(url, outFile, maxTimeSecs) {
  run("curl", [
    "-fL",
    "--connect-timeout", "30",
    "--max-time", String(maxTimeSecs),
    "-o", outFile,
    url
  ], { timeout: (maxTimeSecs + 60) * 1000 });
}

function sha256File(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function expectedNodeSha(nodeVersion, archiveFileName, cacheDir) {
  const shaFile = path.join(cacheDir, `SHASUMS256-${nodeVersion}.txt`);
  const tmpShaFile = `${shaFile}.download`;
  fs.rmSync(tmpShaFile, { force: true });
  curl(`https://nodejs.org/dist/${nodeVersion}/SHASUMS256.txt`, tmpShaFile, 120);
  fs.renameSync(tmpShaFile, shaFile);
  const line = fs.readFileSync(shaFile, "utf8")
    .split("\n")
    .find(entry => entry.trim().endsWith(archiveFileName));
  if (!line) {
    throw new Error(`No SHASUMS256 entry for ${archiveFileName}`);
  }
  return line.trim().split(/\s+/)[0];
}

function downloadVerifiedArchive(nodeVersion, archiveFileName, archive, cacheDir) {
  const tmpArchive = `${archive}.download`;
  fs.rmSync(tmpArchive, { force: true });
  curl(`https://nodejs.org/dist/${nodeVersion}/${archiveFileName}`, tmpArchive, 600);
  const expected = expectedNodeSha(nodeVersion, archiveFileName, cacheDir);
  const actual = sha256File(tmpArchive);
  if (actual !== expected) {
    fs.rmSync(tmpArchive, { force: true });
    throw new Error(`Node runtime checksum mismatch for ${archiveFileName}: expected ${expected}, got ${actual}`);
  }
  // Promote only after the checksum passes, so an interrupted or corrupt
  // download can never be mistaken for a complete cached archive.
  fs.renameSync(tmpArchive, archive);
}

function extractArchiveAtomically(archive, extracted) {
  const tmpDir = `${extracted}.extracting`;
  fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.mkdirSync(tmpDir, { recursive: true });
  try {
    run("tar", ["-xJf", archive, "-C", tmpDir, "--strip-components", "1"], { timeout: networkTimeoutMs });
  } catch (error) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    throw error;
  }
  fs.rmSync(extracted, { recursive: true, force: true });
  fs.renameSync(tmpDir, extracted);
}

function stageNodeRuntime() {
  fs.mkdirSync(stagedBin, { recursive: true });
  const targetNode = path.join(stagedBin, "node");
  const nodeVersion = process.version;
  const arch = os.arch() === "arm64" ? "arm64" : "x64";
  const archiveName = `node-${nodeVersion}-darwin-${arch}`;
  const archiveFileName = `${archiveName}.tar.xz`;
  const cacheDir = path.join(os.homedir(), ".cache", "consulting-tools-desktop");
  const archive = path.join(cacheDir, archiveFileName);
  const extracted = path.join(cacheDir, archiveName);

  fs.mkdirSync(cacheDir, { recursive: true });
  if (!fs.existsSync(extracted)) {
    if (!fs.existsSync(archive)) {
      downloadVerifiedArchive(nodeVersion, archiveFileName, archive, cacheDir);
    }
    extractArchiveAtomically(archive, extracted);
  }

  fs.copyFileSync(path.join(extracted, "bin", "node"), targetNode);
  fs.chmodSync(targetNode, 0o755);
}

function patchRustSources() {
  const srcDir = path.join(workspace, "src-tauri", "src");
  fs.copyFileSync(
    path.join(projectRoot, "desktop", "consulting_desktop.rs"),
    path.join(srcDir, "consulting_desktop.rs")
  );

  const libPath = path.join(srcDir, "lib.rs");
  let lib = fs.readFileSync(libPath, "utf8");
  lib = replaceOrThrow(
    lib,
    "mod app;\nmod util;",
    "mod app;\nmod consulting_desktop;\nmod util;",
    "register consulting_desktop module"
  );
  lib = replaceOrThrow(
    lib,
    "            let window = set_window(app.app_handle(), &pake_config, &tauri_config)?;",
    "            consulting_desktop::start(app.app_handle())?;\n\n            let window = set_window(app.app_handle(), &pake_config, &tauri_config)?;",
    "start bundled server before window creation"
  );
  lib = replaceOrThrow(
    lib,
    "        .run(|_app, _event| {\n            // Handle macOS dock icon click to reopen hidden window",
    "        .run(|_app, _event| {\n            if matches!(_event, tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit) {\n                consulting_desktop::stop(_app);\n            }\n\n            // Handle macOS dock icon click to reopen hidden window",
    "stop bundled server on app exit"
  );
  if (!lib.includes("consulting_desktop::start") || !lib.includes("consulting_desktop::stop")) {
    throw new Error("Pake lifecycle patch assertions failed");
  }
  fs.writeFileSync(libPath, lib);

  const windowPath = path.join(srcDir, "app", "window.rs");
  let window = fs.readFileSync(windowPath, "utf8");
  const oldBlock = `    let url = match window_config.url_type.as_str() {
        "web" => {
            let parsed = window_config.url.parse().map_err(|err| {
                tauri::Error::Io(std::io::Error::new(
                    std::io::ErrorKind::InvalidInput,
                    format!(
                        "Invalid 'web' url '{}' in pake.json: {err}",
                        window_config.url
                    ),
                ))
            })?;
            WebviewUrl::App(parsed)
        }
        "local" => WebviewUrl::App(PathBuf::from(&window_config.url)),
        other => {
            return Err(tauri::Error::Io(std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                format!("url_type must be 'web' or 'local', got '{other}'"),
            )));
        }
    };`;
  const newBlock = `    let url = if let Ok(desktop_url) = std::env::var("CONSULTING_TOOLS_DESKTOP_URL") {
        let parsed = desktop_url.parse().map_err(|err| {
            tauri::Error::Io(std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                format!("Invalid Consulting Tools desktop URL '{desktop_url}': {err}"),
            ))
        })?;
        WebviewUrl::App(parsed)
    } else {
        match window_config.url_type.as_str() {
            "web" => {
                let parsed = window_config.url.parse().map_err(|err| {
                    tauri::Error::Io(std::io::Error::new(
                        std::io::ErrorKind::InvalidInput,
                        format!(
                            "Invalid 'web' url '{}' in pake.json: {err}",
                            window_config.url
                        ),
                    ))
                })?;
                WebviewUrl::App(parsed)
            }
            "local" => WebviewUrl::App(PathBuf::from(&window_config.url)),
            other => {
                return Err(tauri::Error::Io(std::io::Error::new(
                    std::io::ErrorKind::InvalidInput,
                    format!("url_type must be 'web' or 'local', got '{other}'"),
                )));
            }
        }
    };`;
  fs.writeFileSync(windowPath, replaceOrThrow(window, oldBlock, newBlock, "desktop URL bootstrap"));
}

function mergeConfig(base, override) {
  const result = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (value && typeof value === "object" && !Array.isArray(value) && result[key] && typeof result[key] === "object" && !Array.isArray(result[key])) {
      result[key] = mergeConfig(result[key], value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function writePakeConfigs() {
  const srcTauri = path.join(workspace, "src-tauri");
  const generated = path.join(srcTauri, ".pake");
  fs.mkdirSync(generated, { recursive: true });
  fs.mkdirSync(path.join(workspace, "dist"), { recursive: true });
  fs.writeFileSync(path.join(workspace, "dist", "index.html"), "<!doctype html><title>Consulting Tools</title>");

  const pakeConfig = readJson(path.join(srcTauri, "pake.json"));
  pakeConfig.windows[0] = {
    ...pakeConfig.windows[0],
    url: "http://127.0.0.1:41789/index.html",
    url_type: "web",
    width: 1280,
    height: 860,
    min_width: 960,
    min_height: 640,
    hide_title_bar: true,
    hide_on_close: false,
    enable_find: true,
    title: appName
  };
  pakeConfig.system_tray.macos = false;
  writeJson(path.join(generated, "pake.json"), pakeConfig);

  const tauriBase = readJson(path.join(srcTauri, "tauri.conf.json"));
  const tauriMac = readJson(path.join(srcTauri, "tauri.macos.conf.json"));
  const tauriConfig = mergeConfig(tauriBase, tauriMac);
  tauriConfig.productName = appName;
  tauriConfig.identifier = bundleId;
  tauriConfig.version = appVersion;
  tauriConfig.app.trayIcon.iconPath = "png/icon_512.png";
  tauriConfig.bundle.targets = ["app"];
  tauriConfig.bundle.icon = ["icons/icon.icns"];
  tauriConfig.bundle.macOS = {
    ...(tauriConfig.bundle.macOS || {}),
    signingIdentity
  };
  tauriConfig.bundle.resources = [
    "resources/consulting-tools",
    "resources/bin/node"
  ];
  writeJson(path.join(generated, "tauri.conf.json"), tauriConfig);

  const capabilitiesPath = path.join(srcTauri, "capabilities", "default.json");
  const capabilities = readJson(capabilitiesPath);
  // The bundled server binds 127.0.0.1 and the webview only ever navigates
  // there, so the capability is scoped to loopback IP rather than also
  // granting every http://localhost:* origin.
  capabilities.remote = { urls: ["http://127.0.0.1:*"] };
  writeJson(capabilitiesPath, capabilities);

  fs.writeFileSync(path.join(srcTauri, "Info.plist"), `<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>NSAppTransportSecurity</key>
    <dict>
      <key>NSAllowsLocalNetworking</key>
      <true/>
    </dict>
  </dict>
</plist>
`);
  writeEntitlements(path.join(srcTauri, "entitlements.plist"));
}

function ensurePakeDependencies() {
  run("corepack", ["enable"], { cwd: workspace });
  run("corepack", ["prepare", pnpmVersion, "--activate"], { cwd: workspace });
  run("corepack", [pnpmVersion, "install", "--frozen-lockfile"], { cwd: workspace, timeout: networkTimeoutMs });
}

function buildApp() {
  const configPath = path.join("src-tauri", ".pake", "tauri.conf.json");
  run("corepack", [pnpmVersion, "tauri", "build", "-c", configPath, "--features", "cli-build", "--bundles", "app"], {
    cwd: workspace,
    env: {
      CARGO_TARGET_DIR: cargoTargetDir
    }
  });
}

function collectApp() {
  const bundleRoot = path.join(cargoTargetDir, "release", "bundle", "macos");
  const builtApp = path.join(bundleRoot, `${appName}.app`);
  const distMac = path.join(projectRoot, "dist", "mac");
  const finalApp = path.join(distMac, `${appName}.app`);
  if (!fs.existsSync(builtApp)) {
    throw new Error(`Expected app bundle not found: ${builtApp}`);
  }
  fs.rmSync(distMac, { recursive: true, force: true });
  fs.mkdirSync(distMac, { recursive: true });
  fs.cpSync(builtApp, finalApp, { recursive: true });
  console.log(`Built ${finalApp}`);
  return finalApp;
}

function signDistributionArtifacts(appPath) {
  if (signingIdentity === "-") return;
  const resourcesDir = path.join(appPath, "Contents", "Resources");
  const bundledNode = path.join(resourcesDir, "resources", "bin", "node");
  const machOFiles = findTargets(resourcesDir, (target, stats) => {
    return target !== bundledNode
      && stats.isFile()
      && isMachO(target)
      && !isBundleMainExecutable(target);
  });
  for (const target of machOFiles) {
    const args = [
      "--force",
      "--options",
      "runtime",
      "--timestamp",
      ...(needsRuntimeEntitlements(target) ? ["--entitlements", path.join(workspace, "src-tauri", "entitlements.plist")] : []),
      "--sign",
      signingIdentity,
      target
    ];
    run("codesign", args);
  }
  const nestedBundles = findTargets(resourcesDir, (target, stats) => {
    const name = path.basename(target);
    return stats.isDirectory() && (name.endsWith(".app") || name.endsWith(".framework"));
  }).sort((a, b) => b.length - a.length);
  for (const target of nestedBundles) {
    run("codesign", [
      "--force",
      "--deep",
      "--options",
      "runtime",
      "--timestamp",
      "--sign",
      signingIdentity,
      target
    ]);
  }

  run("codesign", [
    "--force",
    "--deep",
    "--options",
    "runtime",
    "--timestamp",
    "--entitlements",
    path.join(workspace, "src-tauri", "entitlements.plist"),
    "--sign",
    signingIdentity,
    appPath
  ]);
}

function notarizeApp(appPath) {
  if (signingIdentity === "-") {
    console.log("Skipping notarization: no TOOLKIT_SIGNING_IDENTITY (app is ad-hoc signed).");
    return;
  }
  if (!notaryProfile) {
    console.log("Skipping notarization: set TOOLKIT_NOTARY_PROFILE to a notarytool keychain profile to enable it.");
    return;
  }
  const zipPath = path.join(path.dirname(appPath), "notary.zip");
  fs.rmSync(zipPath, { force: true });
  run("ditto", ["-c", "-k", "--keepParent", appPath, zipPath]);

  console.log(`$ xcrun notarytool submit ${zipPath} --keychain-profile ${notaryProfile} --wait`);
  const result = spawnSync(
    "xcrun",
    ["notarytool", "submit", zipPath, "--keychain-profile", notaryProfile, "--wait"],
    { encoding: "utf8", timeout: 30 * 60 * 1000 }
  );
  process.stdout.write(result.stdout || "");
  process.stderr.write(result.stderr || "");
  if (result.error) {
    throw new Error(`notarytool failed to run: ${result.error.message}`);
  }
  const output = `${result.stdout || ""}${result.stderr || ""}`;
  if (!/status: Accepted/.test(output)) {
    // Surface the rejection reason before failing the build.
    const idMatch = output.match(/\bid: ([0-9a-f-]{36})/i);
    if (idMatch) {
      run("xcrun", ["notarytool", "log", idMatch[1], "--keychain-profile", notaryProfile]);
    }
    throw new Error("Notarization was not Accepted; see the notary log above.");
  }
  run("xcrun", ["stapler", "staple", appPath]);
  fs.rmSync(zipPath, { force: true });
  console.log(`Notarized and stapled ${appPath}`);
}

function installApp(appPath) {
  if (!installDir) {
    console.log("Skipping install: set TOOLKIT_INSTALL_DIR (e.g. /Applications) to install the built app.");
    return;
  }
  const target = path.join(installDir, `${appName}.app`);
  // Quit a running copy so its files are not in use during replacement.
  spawnSync("osascript", ["-e", `tell application "${appName}" to quit`], { stdio: "ignore" });
  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(installDir, { recursive: true });
  run("ditto", [appPath, target]);
  console.log(`Installed ${target}`);
}

if (process.platform !== "darwin") {
  throw new Error("This build script currently supports macOS only.");
}

ensureCleanBuildDir();
copyPakeTemplate();
stageToolkitSource();
installServerDependencies();
stageNodeRuntime();
patchRustSources();
writePakeConfigs();
ensurePakeDependencies();
buildApp();
const finalApp = collectApp();
signDistributionArtifacts(finalApp);
notarizeApp(finalApp);
installApp(finalApp);
