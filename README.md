# 咨询定量工具箱

这个目录有两种使用方式:

- 双击 `index.html`: 纯离线模式,数据仍保存在浏览器 `localStorage`。
- 启动本地服务: 解锁项目管理、SQLite 持久化、MCP Agent 接口和 PDF 导出。

## 启动

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

## 安全边界

服务始终绑定回环地址,校验 `Host` 头,所有写请求都需要启动时生成的本地 token,在线页面与 API 同源、不启用通配 CORS。端口随运行模式不同:`npm start` 固定用 `41789`;macOS App 由系统分配临时端口,每次启动都不一样。三道边界(回环绑定 + `Host` 校验 + 写 token)在两种模式下都成立。

## MCP

Claude Code 可参考 `.mcp.json` 注册:

```json
{
  "mcpServers": {
    "consulting-toolkit": {
      "command": "node",
      "args": ["server/mcp/index.js"],
      "cwd": "/Users/zcdeng/projects/consulting-tools"
    }
  }
}
```

Agent 应先读 `toolkit://schema`,再按 `create_project -> set_tool_data -> compute_results -> export_pdf` 使用。
