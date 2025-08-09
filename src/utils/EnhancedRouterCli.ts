/**
 * 增强的路由器管理CLI界面
 * 提供美观的视觉增强和更好的用户体验
 */
import readline from 'readline';
import { RouterGroupApiCli, ApiCliOptions, RouterGroup } from './routerGroupApiCli';
import { UIEnhancer } from './uiEnhancer';

/**
 * 发送HTTP请求到服务器API
 */
async function makeRequest(baseUrl: string, apiKey: string, endpoint: string, method: 'GET' | 'POST' = 'GET', body?: any): Promise<any> {
  const url = `${baseUrl}${endpoint}`;
  
  // 使用 Node.js 内置 http/https 模块
  const https = require('https');
  const http = require('http');
  const { URL } = require('url');
  
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const isHttps = parsedUrl.protocol === 'https:';
    const client = isHttps ? https : http;
    
    const options: any = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    };

    const req = client.request(options, (res: any) => {
      let data = '';
      res.on('data', (chunk: any) => {
        data += chunk;
      });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(data ? JSON.parse(data) : {});
          } catch (parseError) {
            reject(new Error(`Failed to parse response: ${parseError}`));
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });
    
    req.on('error', (error: any) => {
      reject(new Error(`Request failed: ${error.message}`));
    });
    
    if (body && method === 'POST') {
      req.write(JSON.stringify(body));
    }
    
    req.end();
  });
}

/**
 * 获取路由组列表
 */
async function getRouterGroups(baseUrl: string, apiKey: string): Promise<{ groups: RouterGroup[]; currentGroup: string }> {
  const response = await makeRequest(baseUrl, apiKey, '/api/router-groups');
  return {
    groups: response.groups || [],
    currentGroup: response.currentGroup || ''
  };
}

/**
 * .switch路由组
 */
async function switchRouterGroup(baseUrl: string, apiKey: string, groupId: string): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const response = await makeRequest(baseUrl, apiKey, '/api/router-groups/switch', 'POST', { groupId });
    return { success: response.success, message: response.message };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

/**
 * 获取路由组详情
 */
async function getRouterGroupDetails(baseUrl: string, apiKey: string, groupId: string): Promise<any> {
  const response = await makeRequest(baseUrl, apiKey, `/api/router-groups/${groupId}`);
  return response.group;
}

/**
 * 显示格式化主菜单
 */
async function showEnhancedMainMenu(baseUrl: string, apiKey: string): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ui = new UIEnhancer(); // 在函数内部实例化 UIEnhancer
  try {
    while (true) { // 使用while循环来持续显示菜单
      const { groups, currentGroup } = await getRouterGroups(baseUrl, apiKey);

      // 清屏，重新绘制菜单
      console.clear(); 
      console.log('\n╔══════════════════════════════════════════════════════════════════════╗');
      console.log('║                     🚦 Claude Code Router                           ║');
      console.log('║                           路由组管理                                ║');
      console.log('╚══════════════════════════════════════════════════════════════════════╝');
      
      if (groups.length === 0) {
        console.log('\n┌─ ⚠️ 配置提示 ──────────────────────────────────────────────────────┐');
        console.log('│                                                                  │');
        console.log('│   📄 未找到路由组配置                                            │');
        console.log('│   🔍 请在 ~/.claude-code-router/config.json 中添加 RouterGroups   │');
        console.log('│                                                                  │');
        console.log('└──────────────────────────────────────────────────────────────────┘');
        break; // 没有组时退出
      }

      // 当前配置信息
      console.log('\n┌─ 💡 当前配置 ──────────────────────────────────────────────────┐');
      console.log('│                                                               │');
      console.log(`   🎯 当前激活路由组: ${ui.color(currentGroup || '未配置', 'green')}`);
      console.log('│                                                               │');
      console.log('└─────────────────────────────────────────────────────────────┘');
      
      // 路由组列表
      console.log('\n┌─ 🎯 可用路由组 ──────────────────────────────────────────────────┐');
      
      groups.forEach((group, index) => {
        const isActive = group.isActive;
        const marker = isActive ? '✅' : '⚪';
        const nameColor = isActive ? 'green' : 'white';
        const name = group.isActive ? group.name : group.name;
        
        console.log(`│ ${marker} [${ui.color((index + 1).toString(), 'cyan')}] ${ui.color(group.name, nameColor)}`);
        console.log(`│       ${ui.color('ID:', 'gray')} ${ui.color(group.id, 'blue')}`);
        if (group.description) {
          console.log(`│       ${ui.color('描述:', 'gray')} ${ui.color(group.description, 'yellow')}`);
        }
        if (index < groups.length - 1) {
          console.log('│                                                               │');
        }
      });
      
      console.log('└─────────────────────────────────────────────────────────────┘');

      // 显示当前组的详细信息（如果存在）
      const activeGroup = groups.find(g => g.isActive);
      if (activeGroup) {
        try {
          const details = await getRouterGroupDetails(baseUrl, apiKey, activeGroup.id);
          console.log('\n┌─ 📋 当前组详细配置 ────────────────────────────────────────────┐');
          
          const configTable = [
            [ui.color('设置项目', 'cyan'), ui.color('值', 'white')],
            ['默认路由', ui.color(details.default || '未配置', 'yellow')],
            ['后台路由', ui.color(details.background || '未配置', 'yellow')],
            ['思考路由', ui.color(details.think || '未配置', 'yellow')],
            ['长文本路由', ui.color(details.longContext || '未配置', 'yellow')],
            ['网络搜索路由', ui.color(details.webSearch || '未配置', 'yellow')],
            ['长文本阈值', ui.color((details.longContextThreshold || '8000') + ' tokens', 'cyan')]
          ];
          
          const maxLeft = Math.max(...configTable.map(row => row[0].length));
          const maxRight = Math.max(...configTable.map(row => row[1].length));
          // 根据内容调整宽度，确保表格撑开
          const requiredWidth = maxLeft + maxRight + 7; // 考虑分隔符和两边的空格
          const tableWidth = Math.min(70, requiredWidth); // 限制最大宽度为70

          console.log('│ ' + ui.createTable(
            configTable[0].map(h => h.replace(/\x1b\[\d{1,2}m/g, '')), // 移除颜色代码以便计算长度
            configTable.slice(1).map(
              (row: string[]) => [row[0].replace(/\x1b\[\d{1,2}m/g, ''), row[1].replace(/\x1b\[\d{1,2}m/g, '')]), // 移除颜色代码
            { padding: 1 }
          ).split('\n').map(line => `│ ${line} │`).join('\n')); // 重新添加外围边框
          

          
          console.log('└─────────────────────────────────────────────────────────────┘');
        } catch (error) {
          console.log('└─────────────────────────────────────────────────────────────┘');
        }
      }

      // 交互选项
      console.log('\n┌─ 🎮 交互选项 ──────────────────────────────────────────────────┐');
      console.log('│                                                              │');
      console.log(`   🎯 [${ui.color('数字键 1-' + groups.length, 'cyan')}]  切换到指定路由组`);
      console.log(`   📋 [${ui.color('d', 'green')}]         查看组详细配置`);
      console.log(`   🔄 [${ui.color('r', 'blue')}]         重新加载配置文件`);
      console.log(`   👋 [${ui.color('q', 'red')}]         退出管理界面`);
      console.log('│                                                              │');
      console.log('└─────────────────────────────────────────────────────────────┘');

      const answer = await new Promise<string>(resolve => {
        rl.question('\n'+ ui.color('请选择操作: ', 'cyan'), resolve);
      });

      const choice = answer.trim().toLowerCase();
      
      if (choice === 'q' || choice === 'quit') {
        console.log('\n' + ui.color('👋 感谢使用！再见！', 'green'));
        break; // 退出循环
      }

      if (choice === 'r' || choice === 'refresh') {
        console.log('\n🔄 正在重新加载配置...');
        try {
          await makeRequest(baseUrl, apiKey, '/api/config/hot-reload', 'POST');
          console.log(ui.color('✅ 配置已成功重新加载！', 'green'));
          console.log(ui.color('💡 按 Enter 键刷新界面...', 'gray'));
          await new Promise<void>(resolve => {
            const tempRl = readline.createInterface({ input: process.stdin, output: process.stdout });
            tempRl.question('', () => {
              tempRl.close();
              resolve();
            });
          });
        } catch (error) {
          console.log(ui.color(`❌ 重新加载失败: ${(error as Error).message}`, 'red'));
          console.log(ui.color('💡 按 Enter 键继续...', 'gray'));
          await new Promise<void>(resolve => {
            const tempRl = readline.createInterface({ input: process.stdin, output: process.stdout });
            tempRl.question('', () => {
              tempRl.close();
              resolve();
            });
          });
        }
        continue; // 继续循环，重新显示菜单
      }

      if (choice === 'd') {
        await showGroupSelectionForDetails(baseUrl, apiKey);
        // 移除固定延迟，因为详情函数内部已经有用户交互控制
        continue; // 继续循环
      }

      // 检查是否是数字选择
      const groupIndex = parseInt(choice) - 1;
      if (groupIndex >= 0 && groupIndex < groups.length) {
        const selectedGroup = groups[groupIndex];
        
        if (selectedGroup.isActive) {
          console.log(ui.color(`ℹ️ 路由组 "${selectedGroup.name}" 已经是激活状态`, 'yellow'));
        } else {
          console.log(ui.color(`🔄 正在切换到: ${selectedGroup.name}`, 'blue'));
          const result = await switchRouterGroup(baseUrl, apiKey, selectedGroup.id);
          
          if (result.success) {
            console.log(ui.color(`✅ 已成功切换到: ${selectedGroup.name}`, 'green'));
            console.log(ui.color(`   新的请求将使用此路由组`, 'green'));
          } else {
            console.log(ui.color(`❌ 切换失败: ${result.error || '未知错误'}`, 'red'));
          }
        }
        
        // 添加用户控制的反馈等待
        console.log(ui.color('💡 按 Enter 键继续...', 'gray'));
        await new Promise<void>(resolve => {
          const tempRl = readline.createInterface({ input: process.stdin, output: process.stdout });
          tempRl.question('', () => {
            tempRl.close();
            resolve();
          });
        });
        continue; // 继续循环
      }

      console.log(ui.color('❌ 无效选择，请重试', 'red'));
      console.log(ui.color('💡 按 Enter 键重新选择...', 'gray'));
      await new Promise<void>(resolve => {
        const tempRl = readline.createInterface({ input: process.stdin, output: process.stdout });
        tempRl.question('', () => {
          tempRl.close();
          resolve();
        });
      });
    }

  } catch (error) {
      console.log('\n┌─ 🚨 Error ──────────────────────────────────────────────────────────┐');
      console.log(`   ❌ Failed to load router groups: ${(error as Error).message}`);
      console.log(`   💡 Please ensure the service is running: ccr status`);
      console.log('└──────────────────────────────────────────────────────────────────┘');
  } finally {
    rl.close(); // 确保在函数结束时关闭readline接口
  }
}

/**
 * 显示组详情选择
 */
async function showGroupSelectionForDetails(baseUrl: string, apiKey: string): Promise<void> {
  const rl = readline.createInterface({ 
    input: process.stdin, 
    output: process.stdout,
    terminal: true
  });
  const ui = new UIEnhancer(); // 添加缺失的 UIEnhancer 实例
  try {
    const { groups } = await getRouterGroups(baseUrl, apiKey);
    
    console.log('\n┌─ 📋 查看详细配置 ────────────────────────────────────────────┐');
    console.log('│                                                           │');
    
    groups.forEach((group, index) => {
      console.log(`│ ${index + 1}. ${ui.color(group.name, 'cyan')} (${ui.color(group.id, 'yellow')}) │`);
    });
    console.log('│                                                           │');
    console.log('└─────────────────────────────────────────────────────────┘');
    
    const answer = await new Promise<string>(resolve => {
      rl.question(ui.color('选择组序号查看详细配置 (1-' + groups.length + '): ', 'cyan'), (input) => {
        resolve(input);
      });
    });

    const groupIndex = parseInt(answer.trim()) - 1;
    
    if (groupIndex >= 0 && groupIndex < groups.length) {
      try {
        const details = await getRouterGroupDetails(baseUrl, apiKey, groups[groupIndex].id);
        
        console.log('\n┏━ 🔍 详细配置信息 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓');
        console.log('   组名: ' + ui.color(groups[groupIndex].name, 'cyan'));
        console.log('   ID: ' + ui.color(details.id, 'yellow'));
        if (details.description) {
          console.log('   描述: ' + ui.color(details.description, 'gray'));
        }
        console.log('   ╭─ 路由配置 ────────────────────────────────────────────╮');
        console.log('    默认: ' + ui.color(details.default || '未配置', 'blue'));
        console.log('    后台: ' + ui.color(details.background || '未配置', 'blue'));
        console.log('    思考: ' + ui.color(details.think || '未配置', 'blue'));
        console.log('    长文本: ' + ui.color(details.longContext || '未配置', 'blue'));
        console.log('    网络搜索: ' + ui.color(details.webSearch || '未配置', 'blue'));
        console.log('    长文本阈值: ' + ui.color((details.longContextThreshold || '8000') + ' tokens', 'cyan'));
        console.log('   ╰──────────────────────────────────────────────────────╯');
        console.log('┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛');
        
        // 添加用户交互控制，等待用户按键后才返回
        console.log('\n' + ui.color('💡 按 Enter 键返回主菜单...', 'gray'));
        await new Promise<void>(resolve => {
          rl.question('', () => resolve());
        });
      } catch (error) {
        console.log(ui.color(`❌ 加载详情失败: ${(error as Error).message}`, 'red'));
        // 即使出错也等待用户确认
        console.log('\n' + ui.color('💡 按 Enter 键返回主菜单...', 'gray'));
        await new Promise<void>(resolve => {
          rl.question('', () => resolve());
        });
      }
    } else {
      console.log(ui.color('❌ 无效的组序号', 'red'));
      // 错误情况下也等待用户确认
      console.log('\n' + ui.color('💡 按 Enter 键返回主菜单...', 'gray'));
      await new Promise<void>(resolve => {
        rl.question('', () => resolve());
      });
    }
  } catch (error) {
    console.log(ui.color(`❌ Error: ${(error as Error).message}`, 'red'));
    // 异常情况下也等待用户确认
    console.log('\n' + ui.color('💡 按 Enter 键返回主菜单...', 'gray'));
    await new Promise<void>(resolve => {
      rl.question('', () => resolve());
    });
  } finally {
    rl.close();
  }
}

// 创建兼容的新CLI类
export class EnhancedRouterCli {
  private baseUrl: string;
  private apiKey: string;

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
  }

  async run(): Promise<void> {
    await showEnhancedMainMenu(this.baseUrl, this.apiKey);
  }
}