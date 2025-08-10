# 动态路由更新系统

Claude Code Router 现在支持动态配置更新，无需重启服务即可应用配置更改。

## 🌟 核心功能

### ✅ 零停机配置更新
- **文件监听**: 自动检测 `config.json` 和自定义路由文件的变化
- **热重载**: 配置更改后无需重启服务即可生效
- **智能验证**: 新配置在应用前会进行完整性验证
- **自动回滚**: 当新配置有问题时自动回滚到上一个可用版本

### 🔄 版本管理
- **版本历史**: 自动保存最近10个配置版本
- **手动回滚**: 支持回滚到任意历史版本
- **变更追踪**: 详细的配置变更记录和差异对比
- **备份机制**: 每次更新前自动备份当前配置

### 🛡️ 安全验证
- **多层验证**: 
  - 配置文件格式验证
  - 提供商连接性测试
  - 路由规则完整性检查
  - 安全性配置审核
- **错误处理**: 完善的错误恢复机制
- **健康检查**: 实时监控提供商状态

## 🚀 快速开始

### 1. 启动服务
```bash
ccr start
```

服务启动后，动态路由器会自动初始化并开始监听配置文件变化。

### 2. 验证动态路由器状态
```bash
curl -H "Authorization: Bearer your-secret-key" \
     http://localhost:3456/api/config/status
```

响应示例：
```json
{
  "status": {
    "isActive": true,
    "currentVersion": "v1",
    "lastUpdate": 1642694400000,
    "hotReloadEnabled": true,
    "health": "healthy",
    "errorCount": 0
  },
  "version": {
    "id": "v1-1642694400000",
    "version": "v1",
    "timestamp": 1642694400000,
    "isActive": true
  },
  "hotReloadEnabled": true
}
```

## 📡 API 端点

### 配置管理

#### `GET /api/config/status`
获取动态路由器当前状态
- **权限**: 需要 API 密钥
- **返回**: 路由器状态、当前版本信息

#### `POST /api/config/hot-reload`
手动触发配置重载
- **权限**: 需要完全访问权限
- **返回**: 重载结果和新版本信息

#### `POST /api/config/validate`
验证配置有效性（不应用）
- **权限**: 需要完全访问权限
- **请求体**: 配置JSON对象
- **返回**: 详细的验证结果

### 版本管理

#### `GET /api/config/versions`
获取配置版本历史
- **权限**: 需要 API 密钥
- **返回**: 版本列表和元数据

#### `POST /api/config/rollback`
回滚到指定版本
- **权限**: 需要完全访问权限
- **请求体**: `{ "versionId": "版本ID" }`
- **返回**: 回滚操作结果

#### `GET /api/config/diff/:fromVersion/:toVersion`
获取两个版本之间的差异
- **权限**: 需要 API 密钥
- **参数**: 源版本ID和目标版本ID
- **返回**: 详细的配置差异

## 🔧 配置示例

### 基础配置更新
直接编辑 `~/.claude-code-router/config.json`：

```json
{
  "Providers": [
    {
      "name": "openrouter",
      "api_base_url": "https://openrouter.ai/api/v1/chat/completions",
      "api_key": "sk-your-key",
      "models": ["anthropic/claude-3.5-sonnet"]
    }
  ],
  "Router": {
    "default": "openrouter,anthropic/claude-3.5-sonnet"
  }
}
```

保存后，动态路由器会在500ms内自动检测变化并应用更新。

### 使用 API 更新配置

```bash
curl -X POST \
     -H "Authorization: Bearer your-secret-key" \
     -H "Content-Type: application/json" \
     -d @new-config.json \
     http://localhost:3456/api/config
```

### 自定义路由文件
如果使用自定义路由文件，它也支持热重载：

```javascript
// custom-router.js
module.exports = function(req, config) {
  // 您的自定义路由逻辑
  if (req.body.messages.length > 10) {
    return "openrouter,anthropic/claude-3.5-sonnet";
  }
  return config.Router.default;
};
```

## 📊 监控和日志

### 事件日志
动态路由器会记录以下事件：
- 配置文件变化检测
- 配置验证结果  
- 版本创建和切换
- 错误和回滚操作

### 健康检查
系统会定期检查：
- 提供商连接状态
- 配置文件完整性
- 路由规则有效性
- 系统资源使用情况

## 🛠️ 测试工具

项目提供了完整的测试脚本：

```bash
node examples/dynamic-router-test.js
```

测试脚本会验证：
- ✅ 路由器状态查询
- ✅ 配置验证功能
- ✅ 手动热重载
- ✅ 版本历史管理
- ✅ 自动文件监听

## ⚡ 性能优化

### 文件监听优化
- **防抖机制**: 500ms内多次变更只触发一次更新
- **校验和检查**: 只有内容真正改变才触发更新
- **异步处理**: 文件变化处理不阻塞请求处理

### 内存管理
- **版本限制**: 最多保存10个历史版本
- **自动清理**: 定期清理过期的备份和日志
- **懒加载**: 按需加载配置验证和版本管理功能

## 🔒 安全考虑

### 访问控制
- **API 密钥验证**: 所有配置相关API需要有效密钥
- **权限分级**: 只有完全访问权限可以修改配置
- **配置加密**: 敏感配置项自动加密存储

### 输入验证  
- **架构验证**: 严格的JSON架构检查
- **内容过滤**: 防止恶意配置注入
- **文件权限**: 确保配置文件访问安全

## 🔧 故障排除

### 常见问题

#### 动态路由器未启动
**症状**: API返回路由器未初始化错误
**解决**: 检查配置文件是否存在且格式正确

#### 配置验证失败
**症状**: 配置更新被拒绝
**解决**: 使用 `/api/config/validate` 端点检查具体错误

#### 自动重载不工作
**症状**: 文件修改后配置未更新
**解决**: 检查文件权限和路径是否正确

#### 提供商连接失败
**症状**: 健康检查显示提供商不可用
**解决**: 验证API密钥和网络连接

### 调试模式
启用详细日志输出：
```bash
DEBUG=claude-code-router:* ccr start
```

### 配置重置
如果配置完全损坏，可以删除配置文件重新初始化：
```bash
rm ~/.claude-code-router/config.json
ccr start
```

## 📈 高级用法

### 批量配置更新
```bash
# 备份当前配置
curl -H "Authorization: Bearer your-key" \
     http://localhost:3456/api/config > backup.json

# 应用新配置
curl -X POST \
     -H "Authorization: Bearer your-key" \
     -H "Content-Type: application/json" \
     -d @batch-config.json \
     http://localhost:3456/api/config

# 如有问题立即回滚
curl -X POST \
     -H "Authorization: Bearer your-key" \
     -H "Content-Type: application/json" \
     -d '{"versionId": "previous-version-id"}' \
     http://localhost:3456/api/config/rollback
```

### 自动化脚本集成
```bash
#!/bin/bash
# update-config.sh
CONFIG_FILE="$HOME/.claude-code-router/config.json"
BACKUP_FILE="$CONFIG_FILE.backup.$(date +%s)"

# 备份当前配置
cp "$CONFIG_FILE" "$BACKUP_FILE"

# 更新配置
cat > "$CONFIG_FILE" << 'EOF'
{
  "Providers": [...],
  "Router": {...}
}
EOF

# 验证更新结果
sleep 2
if curl -f -H "Authorization: Bearer $API_KEY" \
        "http://localhost:3456/api/config/status" > /dev/null 2>&1; then
    echo "配置更新成功"
    rm "$BACKUP_FILE"
else
    echo "配置更新失败，正在回滚..."
    mv "$BACKUP_FILE" "$CONFIG_FILE"
fi
```

## 🤝 贡献指南

欢迎贡献改进建议！请查看以下文件了解架构详情：

- `src/utils/configWatcher.ts` - 文件监听实现
- `src/utils/configValidator.ts` - 配置验证逻辑  
- `src/utils/configVersionManager.ts` - 版本管理功能
- `src/utils/dynamicRouter.ts` - 动态路由核心
- `src/utils/providerManager.ts` - 提供商管理

## 📄 许可证

本项目采用 MIT 许可证，详情请参阅 [LICENSE](LICENSE) 文件。