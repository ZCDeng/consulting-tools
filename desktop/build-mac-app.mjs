import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const projectRoot = path.resolve(new URL("..", import.meta.url).pathname);
const pakeRoot = process.env.PAKE_ROOT || "/Users/zcdeng/projects/Pake";
const buildRoot = path.join(projectRoot, "dist", "desktop-build");
const workspace = path.join(buildRoot, "Pake");
const stagedToolkit = path.join(workspace, "src-tauri", "resources", "consulting-tools");
const stagedBin = path.join(workspace, "src-tauri", "resources", "bin");
const cargoTargetDir = path.join(os.homedir(), ".cache", "consulting-tools-desktop", "pake-target");
const appName = "Consulting Tools";
const bundleId = "com.zcdeng.consulting-tools";
const appVersion = "0.1.0";

function run(command, args, options = {}) {
  console.log(`$ ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, {
    stdio: "inherit",
    cwd: options.cwd || projectRoot,
    env: { ...process.env, ...(options.env || {}) }
  });
  if (result.status !== 0) {
    throw new Error(`${command} exited with status ${result.status}`);
  }
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(`${file}\n`.trim(), `${JSON.stringify(value, null, 2)}\n`);
}

function copyDir(src, dest, filter = () => true) {
  fs.cpSync(src, dest, {
    recursive: true,
    force: true,
    dereference: false,
    filter: (source) => filter(path.relative(src, source), source)
  });
}

function ensureCleanBuildDir() {
  fs.rmSync(buildRoot, { recursive: true, force: true });
  fs.mkdirSync(buildRoot, { recursive: true });
}

function copyPakeTemplate() {
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
  fs.mkdirSync(stagedToolkit, { recursive: true });
  const rootFiles = [
    "index.html",
    "Kano.html",
    "CE-Matrix.html",
    "QFD.html",
    "Pugh.html",
    "FMEA.html",
    "MonteCarlo.html"
  ];
  for (const file of rootFiles) {
    fs.copyFileSync(path.join(projectRoot, file), path.join(stagedToolkit, file));
  }
  copyDir(path.join(projectRoot, "fonts"), path.join(stagedToolkit, "fonts"));
  copyDir(path.join(projectRoot, "shared"), path.join(stagedToolkit, "shared"));
  copyDir(path.join(projectRoot, "server"), path.join(stagedToolkit, "server"), (relative) => {
    if (!relative) return true;
    const parts = relative.split(path.sep);
    return !["data", "node_modules", "test"].includes(parts[0]);
  });
}

function installServerDependencies() {
  const serverDir = path.join(stagedToolkit, "server");
  run("npm", ["ci", "--omit=dev"], { cwd: serverDir });
  const browsersPath = path.join(os.homedir(), ".cache", "consulting-tools-desktop", "ms-playwright");
  fs.mkdirSync(browsersPath, { recursive: true });
  run("npm", ["run", "install-browser"], {
    cwd: serverDir,
    env: { PLAYWRIGHT_BROWSERS_PATH: browsersPath }
  });
  copyDir(browsersPath, path.join(serverDir, "ms-playwright"));
}

function stageNodeRuntime() {
  fs.mkdirSync(stagedBin, { recursive: true });
  const targetNode = path.join(stagedBin, "node");
  const nodeVersion = process.version;
  const arch = os.arch() === "arm64" ? "arm64" : "x64";
  const archiveName = `node-${nodeVersion}-darwin-${arch}`;
  const cacheDir = path.join(os.homedir(), ".cache", "consulting-tools-desktop");
  const archive = path.join(cacheDir, `${archiveName}.tar.xz`);
  const extracted = path.join(cacheDir, archiveName);

  fs.mkdirSync(cacheDir, { recursive: true });
  if (!fs.existsSync(extracted)) {
    if (!fs.existsSync(archive)) {
      const url = `https://nodejs.org/dist/${nodeVersion}/${archiveName}.tar.xz`;
      const curl = spawnSync("curl", ["-fL", url, "-o", archive], { stdio: "inherit" });
      if (curl.status !== 0) {
        const currentNode = fs.realpathSync(process.execPath);
        console.warn(`Falling back to current Node executable: ${currentNode}`);
        fs.copyFileSync(currentNode, targetNode);
        fs.chmodSync(targetNode, 0o755);
        return;
      }
    }
    run("tar", ["-xJf", archive, "-C", cacheDir]);
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
  lib = lib.replace("mod app;\nmod util;", "mod app;\nmod consulting_desktop;\nmod util;");
  lib = lib.replace(
    "            let window = set_window(app.app_handle(), &pake_config, &tauri_config)?;",
    "            consulting_desktop::start(app.app_handle())?;\n\n            let window = set_window(app.app_handle(), &pake_config, &tauri_config)?;"
  );
  lib = lib.replace(
    "        .run(|_app, _event| {\n            // Handle macOS dock icon click to reopen hidden window",
    "        .run(|_app, _event| {\n            if matches!(_event, tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit) {\n                consulting_desktop::stop(_app);\n            }\n\n            // Handle macOS dock icon click to reopen hidden window"
  );
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
  if (!window.includes(oldBlock)) {
    throw new Error("Could not patch Pake window URL block");
  }
  fs.writeFileSync(windowPath, window.replace(oldBlock, newBlock));
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
  tauriConfig.bundle.resources = [
    "resources/consulting-tools",
    "resources/bin/node"
  ];
  writeJson(path.join(generated, "tauri.conf.json"), tauriConfig);

  const capabilitiesPath = path.join(srcTauri, "capabilities", "default.json");
  const capabilities = readJson(capabilitiesPath);
  capabilities.remote = { urls: ["https://*.*", "http://127.0.0.1:*", "http://localhost:*"] };
  writeJson(capabilitiesPath, capabilities);
}

function ensurePakeDependencies() {
  run("corepack", ["enable"], { cwd: workspace });
  run("corepack", ["prepare", "pnpm@10.26.2", "--activate"], { cwd: workspace });
  run("corepack", ["pnpm@10.26.2", "install", "--frozen-lockfile"], { cwd: workspace });
}

function buildApp() {
  const configPath = path.join("src-tauri", ".pake", "tauri.conf.json");
  run("corepack", ["pnpm@10.26.2", "tauri", "build", "-c", configPath, "--features", "cli-build", "--bundles", "app"], {
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
collectApp();
