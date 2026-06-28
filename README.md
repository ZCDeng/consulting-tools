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

## 安全边界

服务只监听 `127.0.0.1:41789`,校验 `Host` 头,且所有写请求都需要启动时生成的本地 token。在线页面与 API 同源,不启用通配 CORS。

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
