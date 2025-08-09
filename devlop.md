1.  环境准备

# 确保已安装 Node.js (建议 18+ 版本)

node --version

# 进入项目根目录

cd /home/ekko.bao/git/claude-code-router

2. 依赖安装

# 安装主项目依赖

npm install

# 安装 UI 项目依赖

cd ui && npm install && cd ..

3. 项目构建

# 构建整个项目（包含后端和UI）

npm run build

构建过程会：

- 使用 esbuild 编译 TypeScript 后端代码到 dist/cli.js
- 复制 tiktoken WASM 文件
- 构建 React UI 到单个 HTML 文件
- 将所有构建产物输出到 dist/ 目录

4. 配置设置

# 创建配置目录

mkdir -p ~/.claude-code-router

# 复制示例配置

cp config.example.json ~/.claude-code-router/config.json

# 编辑配置文件，添加你的 API keys

nano ~/.claude-code-router/config.json

配置文件示例结构：
{
"LOG": true,
"Providers": [
{
"name": "deepseek",
"api_base_url": "https://api.deepseek.com/chat/completions",
"api_key": "your-api-key",
"models": ["deepseek-chat"]
}
],
"Router": {
"default": "deepseek,deepseek-chat"
}
}

5. 启动调试

后端调试

# 方式1: 使用构建后的版本

./dist/cli.js start

# 方式2: 直接运行TypeScript源码（开发模式）

npx tsx src/cli.ts start

# 检查服务状态

./dist/cli.js status

前端UI调试

# 进入UI目录

cd ui

# 启动开发服务器

npm run dev

# 或使用 pnpm

pnpm dev

# 浏览器访问: http://localhost:5173

集成调试

# 启动路由器服务

ccr start

# 启动UI界面

ccr ui

# 使用路由器运行Claude Code

ccr code "你的提示"

6. 调试工具和技巧

日志调试

- 日志文件位置: $HOME/.claude-code-router.log
- 在配置中启用: "LOG": true

端口配置

- 默认服务端口: 3456
- UI开发服务器: 5173
- 可在配置中修改: "HOST" 和端口设置

开发工具

- 后端: TypeScript + Node.js
- 前端: React + Vite + Tailwind CSS
- 构建: esbuild + npm scripts

7. 常见调试命令

# 重启服务

ccr restart

# 停止服务

ccr stop

# 检查配置

node examples/dynamic-router-test.js

# UI构建

cd ui && npm run build

# 完整构建

npm run build

8. 故障排除

1. 构建失败: 检查 Node.js 版本和依赖安装
1. 服务启动失败: 检查配置文件格式和API密钥
1. UI无法访问: 确认前端开发服务器已启动
1. 路由不工作: 检查Provider配置和模型名称
