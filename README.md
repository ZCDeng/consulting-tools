# 咨询定量工具箱

给咨询判断装上可复核的刻度：Kano / C&E / QFD / Pugh / FMEA / 蒙特卡洛，把"我觉得 A 更好"变成可复核的加权矩阵 / 概率分布。

三种使用方式：

- **Agent / CLI（AI Native）**：`npx consulting-toolkit <verb>`，面向 Claude CLI / Codex / CI，纯 JSON 输出。
- **本地服务**：解锁项目管理、SQLite 持久化、MCP Agent 接口和 PDF 导出。
- **双击 HTML**：纯离线模式，数据存浏览器 `localStorage`（页面在 `packages/static/`）。

## Agent / CLI

```bash
npx consulting-toolkit schema                 # 先看每个工具的 data_json 形状
npx consulting-toolkit create_project --name "客户A"
npx consulting-toolkit set_tool_data --project_id <id> --tool kano --data '<json>'
npx consulting-toolkit compute_results --tool kano --data '<json>'
```

零依赖、Node ≥ 25；stdout 只输出 JSON，错误走 stderr + 非零退出。数据默认与 desktop app 共享同一份（平台 app-data 目录），可用 `TOOLKIT_DATA_DIR` 覆盖。

## 本地服务

```bash
cd consulting-tools/server
npm install
npm start
```

然后打开 `http://localhost:41789/index.html`。

PDF 首次使用如提示缺 Chromium:

```bash
npm run install-browser
```

## macOS App

使用本地 Pake checkout 打包自包含 macOS app。先把 `PAKE_ROOT` 指向本地 Pake checkout(脚本默认值是作者机器上的路径,其它机器必须显式设置):

```bash
export PAKE_ROOT=/path/to/Pake
node desktop/build-mac-app.mjs
```

产物会输出到 `dist/mac/Consulting Tools.app`。App 启动时会自动运行内置本地服务,数据写入系统 app data 目录,不需要手动 `npm start`。

签名、公证、安装都是可选的,按需设置环境变量:

```bash
# Developer ID 签名(不设则 ad-hoc 签名)
export TOOLKIT_SIGNING_IDENTITY="Developer ID Application: …"
# 公证 + staple(需先 notarytool store-credentials 存好 profile)
export TOOLKIT_NOTARY_PROFILE="<keychain-profile>"
# 构建完成后安装到指定目录(替换同名 app)
export TOOLKIT_INSTALL_DIR="/Applications"
node desktop/build-mac-app.mjs
```

公证未 `Accepted` 时脚本会打印 notary log 并报错,不会继续 staple/安装。

## 安全边界

服务始终绑定回环地址,校验 `Host` 头,所有写请求都需要启动时生成的本地 token,在线页面与 API 同源、不启用通配 CORS。端口随运行模式不同:`npm start` 固定用 `41789`;macOS App 由系统分配临时端口,每次启动都不一样。三道边界(回环绑定 + `Host` 校验 + 写 token)在两种模式下都成立。

## MCP

Claude Code 可参考 `.mcp.json` 注册（无硬编码绝对路径，`cwd` 由 Claude Code 提供）:

```json
{
  "mcpServers": {
    "consulting-toolkit": {
      "command": "node",
      "args": ["server/mcp/index.js"]
    }
  }
}
```

Agent 应先读 `toolkit://schema`,再按 `create_project -> set_tool_data -> compute_results -> export_pdf` 使用。

## 结构

- `packages/core` — 可发布的零依赖 core：计算核（`cores/` UMD）+ 存储（`db/` SQLite）+ 服务层（`services/`）+ Agent CLI（`bin/`、`cli/`）。`npm pack` 即得 `consulting-toolkit`。
- `packages/static` — 浏览器资产：七个 HTML + `fonts/` + `shared/`。打包时由 `packages/core/pack-static.js` 连同 vendored cores 一起拷入发布包的 `static/`。
- `server/` — 本地服务宿主（`npm start`）：薄 host，HTTP + token + 静态 + PDF（Playwright 归此）。
- `desktop/host` — desktop app 的宿主：同一份 host 逻辑，自带 Playwright，不进 npm 发布包。
- `desktop/` — macOS 打包脚本与 Rust 启动器。
