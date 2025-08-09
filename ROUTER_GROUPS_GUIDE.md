# Router Groups - 路由组功能使用指南

Router Groups 功能允许您在运行时动态切换不同的路由配置组合，无需重启服务。您可以预先配置多个路由策略（如默认组、性能组、高质量组），然后通过CLI或API在它们之间自由切换。

## 🚀 功能特性

- **运行时切换**：无需重启服务即可切换路由配置
- **多组预配置**：支持配置多个路由策略组合
- **CLI交互界面**：直观的命令行界面进行路由组管理
- **API支持**：通过REST API进行编程化控制
- **实时生效**：切换后的新请求立即使用新路由配置
- **配置验证**：自动验证路由组配置的有效性

## 📋 配置格式

### 更新配置文件结构

在您的 `~/.claude-code-router/config.json` 文件中，添加 `RouterGroups` 部分：

```json
{
  "Providers": [
    // ... 您的现有提供商配置
  ],
  "RouterGroups": {
    "router1": {
      "name": "Default Group",
      "description": "标准路由配置",
      "default": "deepseek,deepseek-chat",
      "background": "ollama,qwen2.5-coder:latest",
      "think": "deepseek,deepseek-reasoner",
      "longContext": "openrouter,google/gemini-2.5-pro-preview",
      "longContextThreshold": 60000,
      "webSearch": "gemini,gemini-2.5-flash"
    },
    "router2": {
      "name": "Performance Group",
      "description": "针对快速响应优化",
      "default": "ollama,qwen2.5-coder:latest",
      "background": "ollama,qwen2.5-coder:latest",
      "think": "gemini,gemini-2.5-flash",
      "longContext": "gemini,gemini-2.5-pro",
      "longContextThreshold": 30000,
      "webSearch": "gemini,gemini-2.5-flash"
    },
    "router3": {
      "name": "Premium Group", 
      "description": "复杂任务的高质量模型",
      "default": "openrouter,anthropic/claude-sonnet-4",
      "background": "openrouter,anthropic/claude-3.5-sonnet",
      "think": "openrouter,anthropic/claude-3.7-sonnet:thinking",
      "longContext": "openrouter,google/gemini-2.5-pro-preview",
      "longContextThreshold": 100000,
      "webSearch": "openrouter,google/gemini-2.5-pro-preview"
    }
  },
  "Router": {
    "activeGroup": "router1"
  }
  // ... 其他配置
}
```

### 配置字段说明

#### RouterGroups 结构
- **groupId** (如 "router1"): 路由组的唯一标识符
- **name**: 路由组的显示名称
- **description**: 路由组的描述（可选）
- **default**: 默认路由配置 (格式: "provider,model")
- **background**: 后台任务路由（可选）
- **think**: 思考模式路由（可选）
- **longContext**: 长上下文路由（可选）
- **longContextThreshold**: 长上下文阈值（可选，默认 60000）
- **webSearch**: 网络搜索路由（可选）

#### Router 配置
- **activeGroup**: 当前活跃的路由组ID

## 🖥️ CLI 使用方法

### 启动路由组管理界面

```bash
ccr router
```

### 交互式操作

启动后您将看到类似以下的界面：

```
🚦 Claude Code Router - Router Group Management
================================================

Current Active Group: router1

Available Router Groups:
========================
● 1. Default Group (router1)
   Description: 标准路由配置
   
📋 Router Group Details:
Name: Default Group
Description: 标准路由配置

Router Configuration:
  Default: deepseek,deepseek-chat
  Background: ollama,qwen2.5-coder:latest
  Think: deepseek,deepseek-reasoner
  Long Context: openrouter,google/gemini-2.5-pro-preview
  Web Search: gemini,gemini-2.5-flash
  Long Context Threshold: 60000 tokens

  2. Performance Group (router2)
   Description: 针对快速响应优化
  3. Premium Group (router3)
   Description: 复杂任务的高质量模型

Options:
1-3: Switch to router group
d: Show details for a group
r: Refresh/reload configuration
q: Quit

Select an option:
```

### 可用操作

- **1-N**: 切换到对应编号的路由组
- **d**: 显示特定路由组的详细配置
- **r**: 刷新配置（重新从配置文件加载）
- **q**: 退出管理界面

## 🔗 API 使用方法

### 获取路由组列表

```bash
curl -H "Authorization: Bearer YOUR_API_KEY" \
     http://localhost:3456/api/router-groups
```

### 切换路由组

```bash
curl -X POST \
     -H "Authorization: Bearer YOUR_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"groupId": "router2"}' \
     http://localhost:3456/api/router-groups/switch
```

### 获取特定路由组详情

```bash
curl -H "Authorization: Bearer YOUR_API_KEY" \
     http://localhost:3456/api/router-groups/router1
```

## 📖 使用场景示例

### 场景 1: 开发环境切换

```json
"router1": {
  "name": "Development",
  "description": "开发环境 - 使用本地模型",
  "default": "ollama,qwen2.5-coder:latest",
  "background": "ollama,qwen2.5-coder:latest"
}
```

### 场景 2: 生产环境

```json
"router2": {
  "name": "Production",
  "description": "生产环境 - 使用云端高质量模型",
  "default": "openrouter,anthropic/claude-sonnet-4",
  "think": "openrouter,anthropic/claude-3.7-sonnet:thinking",
  "longContext": "openrouter,google/gemini-2.5-pro-preview"
}
```

### 场景 3: 成本优化

```json
"router3": {
  "name": "Cost Optimized",
  "description": "成本优化 - 平衡质量与成本",
  "default": "deepseek,deepseek-chat",
  "think": "deepseek,deepseek-reasoner",
  "longContext": "gemini,gemini-2.5-pro"
}
```

## ⚠️ 注意事项

1. **服务运行要求**: 路由组切换需要 claude-code-router 服务正在运行
2. **配置验证**: 系统会自动验证路由组配置的有效性
3. **实时生效**: 切换后仅对新请求生效，进行中的请求不受影响
4. **权限要求**: API 操作需要有效的 API 密钥
5. **配置备份**: 建议在修改配置前备份原配置文件

## 🔧 故障排除

### 常见问题

**Q: CLI 提示 "Service not running"**
A: 请先使用 `ccr start` 启动服务

**Q: 切换路由组失败**
A: 检查路由组ID是否存在，以及配置格式是否正确

**Q: API 返回 401 错误**
A: 检查 API 密钥是否正确配置

**Q: 路由组没有生效**
A: 确认切换成功后，新的请求会使用新配置。检查当前活跃组状态。

### 调试建议

1. 使用 `ccr status` 检查服务状态
2. 查看服务日志了解详细错误信息
3. 验证配置文件的 JSON 格式是否正确
4. 确认 Providers 中包含路由组引用的所有提供商和模型

## 📝 最佳实践

1. **合理命名**: 使用描述性的路由组名称和ID
2. **文档描述**: 为每个路由组添加详细的描述信息
3. **逐步测试**: 在生产环境使用前，先在测试环境验证配置
4. **监控使用**: 关注不同路由组的性能和成本表现
5. **定期更新**: 根据使用情况调整和优化路由组配置

## 🆕 升级说明

如果您已经有现有的 `Router` 配置，可以：

1. 保留现有配置作为向后兼容
2. 将现有配置迁移到 RouterGroups 中
3. 逐步切换到新的路由组系统

系统会自动处理配置的向后兼容性。