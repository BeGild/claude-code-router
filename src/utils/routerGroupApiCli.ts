import readline from 'readline';
import { log } from './log';

// 使用内置的 HTTP 模块代替 fetch 来避免依赖问题
const http = require('http');

export interface ApiCliOptions {
  baseUrl: string;
  apiKey: string;
  enableColors?: boolean;
  enableLogging?: boolean;
}

export interface RouterGroup {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
}

export class RouterGroupApiCli {
  private rl: readline.Interface;
  private options: Required<ApiCliOptions>;

  constructor(options: ApiCliOptions) {
    this.options = {
      enableColors: true,
      enableLogging: true,
      ...options
    };

    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  /**
   * 发送HTTP请求到服务器API
   */
  private async makeRequest(endpoint: string, method: 'GET' | 'POST' = 'GET', body?: any): Promise<any> {
    const url = `${this.options.baseUrl}${endpoint}`;
    
    // Use Node.js built-in http/https modules instead of fetch to avoid compatibility issues
    const https = await import('https');
    const http = await import('http');
    const { URL } = await import('url');
    
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
          'Authorization': `Bearer ${this.options.apiKey}`,
          'Content-Type': 'application/json'
        }
      };

      const req = client.request(options, (res: any) => {
        let data = '';
        
        res.on('data', (chunk: any) => {
          data += chunk;
        });
        
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              const jsonData = data ? JSON.parse(data) : {};
              resolve(jsonData);
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
  private async getRouterGroups(): Promise<{ groups: RouterGroup[]; currentGroup: string }> {
    const response = await this.makeRequest('/api/router-groups');
    return {
      groups: response.groups || [],
      currentGroup: response.currentGroup || ''
    };
  }

  /**
   * 切换路由组
   */
  private async switchRouterGroup(groupId: string): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      const response = await this.makeRequest('/api/router-groups/switch', 'POST', { groupId });
      return {
        success: response.success,
        message: response.message
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message
      };
    }
  }

  /**
   * 获取路由组详情
   */
  private async getRouterGroupDetails(groupId: string): Promise<any> {
    const response = await this.makeRequest(`/api/router-groups/${groupId}`);
    return response.group;
  }

  /**
   * 显示主菜单
   */
  public async showMainMenu(): Promise<void> {
    try {
      const { groups, currentGroup } = await this.getRouterGroups();
      
      console.log('\n' + this.colorize('🚦 Claude Code Router - Router Group Management', 'cyan'));
      console.log(this.colorize('================================================', 'cyan'));
      
      if (groups.length === 0) {
        console.log(this.colorize('⚠️  No router groups found in configuration', 'yellow'));
        console.log(this.colorize('Please add RouterGroups to your config.json file', 'yellow'));
        return;
      }

      console.log(`\n${this.colorize('Current Active Group:', 'green')} ${this.colorize(currentGroup, 'yellow')}`);
      console.log('\n' + this.colorize('Available Router Groups:', 'blue'));
      console.log('========================');

      for (const [index, group] of groups.entries()) {
        const marker = group.isActive ? this.colorize('●', 'green') : ' ';
        const nameColor = group.isActive ? 'green' : 'white';
        console.log(`${marker} ${index + 1}. ${this.colorize(group.name, nameColor)} (${group.id})`);
        
        if (group.description) {
          console.log(`   ${this.colorize('Description:', 'gray')} ${group.description}`);
        }
        
        if (group.isActive) {
          await this.showGroupDetails(group.id);
        }
      }

      console.log('\n' + this.colorize('Options:', 'blue'));
      console.log('1-' + groups.length + ': Switch to router group');
      console.log('d: Show details for a group');
      console.log('r: Refresh/reload configuration');
      console.log('q: Quit');

      await this.handleMenuChoice(groups);
    } catch (error) {
      console.log(this.colorize(`❌ Failed to load router groups: ${(error as Error).message}`, 'red'));
      console.log(this.colorize('Please ensure the service is running and accessible.', 'yellow'));
    }
  }

  /**
   * 处理菜单选择
   */
  private async handleMenuChoice(groups: RouterGroup[]): Promise<void> {
    return new Promise((resolve) => {
      this.rl.question('\nSelect an option: ', async (answer) => {
        const choice = answer.trim().toLowerCase();
        
        if (choice === 'q' || choice === 'quit') {
          console.log(this.colorize('👋 Goodbye!', 'green'));
          resolve();
          return;
        }

        if (choice === 'r' || choice === 'refresh') {
          console.log(this.colorize('🔄 Refreshing configuration...', 'blue'));
          try {
            // Trigger a configuration reload on the server
            await this.makeRequest('/api/config/hot-reload', 'POST');
            console.log(this.colorize('✅ Configuration reloaded successfully', 'green'));
          } catch (error) {
            console.log(this.colorize(`❌ Failed to reload: ${(error as Error).message}`, 'red'));
          }
          setTimeout(() => this.showMainMenu().then(resolve), 1000);
          return;
        }

        if (choice === 'd' || choice === 'details') {
          await this.showGroupSelectionForDetails(groups);
          setTimeout(() => this.showMainMenu().then(resolve), 2000);
          return;
        }

        // 检查是否是数字选择
        const groupIndex = parseInt(choice) - 1;
        if (groupIndex >= 0 && groupIndex < groups.length) {
          const selectedGroup = groups[groupIndex];
          
          if (selectedGroup.isActive) {
            console.log(this.colorize(`ℹ️  Group '${selectedGroup.name}' is already active`, 'yellow'));
          } else {
            await this.switchToGroup(selectedGroup.id, selectedGroup.name);
          }
          
          setTimeout(() => this.showMainMenu().then(resolve), 1500);
          return;
        }

        console.log(this.colorize('❌ Invalid option. Please try again.', 'red'));
        setTimeout(() => this.handleMenuChoice(groups).then(resolve), 1000);
      });
    });
  }

  /**
   * 切换到指定路由组
   */
  private async switchToGroup(groupId: string, groupName: string): Promise<void> {
    console.log(this.colorize(`🔄 Switching to router group '${groupName}'...`, 'blue'));
    
    const result = await this.switchRouterGroup(groupId);
    
    if (result.success) {
      console.log(this.colorize(`✅ Successfully switched to '${groupName}'`, 'green'));
      console.log(this.colorize('New requests will now use this router group', 'green'));
    } else {
      console.log(this.colorize(`❌ Failed to switch to '${groupName}'`, 'red'));
      if (result.error) {
        console.log(this.colorize(`Error: ${result.error}`, 'red'));
      }
    }
  }

  /**
   * 显示组详情选择
   */
  private async showGroupSelectionForDetails(groups: RouterGroup[]): Promise<void> {
    return new Promise((resolve) => {
      console.log('\n' + this.colorize('Select a group to view details (1-' + groups.length + '):', 'blue'));
      
      this.rl.question('Group number: ', async (answer) => {
        const groupIndex = parseInt(answer.trim()) - 1;
        
        if (groupIndex >= 0 && groupIndex < groups.length) {
          await this.showGroupDetails(groups[groupIndex].id);
        } else {
          console.log(this.colorize('❌ Invalid group number', 'red'));
        }
        
        resolve();
      });
    });
  }

  /**
   * 显示组详细信息
   */
  private async showGroupDetails(groupId: string): Promise<void> {
    try {
      const group = await this.getRouterGroupDetails(groupId);
      
      console.log(`\n${this.colorize('📋 Router Group Details:', 'cyan')}`);
      console.log(`${this.colorize('Name:', 'blue')} ${group.name}`);
      if (group.description) {
        console.log(`${this.colorize('Description:', 'blue')} ${group.description}`);
      }
      
      console.log(`\n${this.colorize('Router Configuration:', 'blue')}`);
      console.log(`  ${this.colorize('Default:', 'green')} ${group.default || 'Not set'}`);
      console.log(`  ${this.colorize('Background:', 'green')} ${group.background || 'Not set'}`);
      console.log(`  ${this.colorize('Think:', 'green')} ${group.think || 'Not set'}`);
      console.log(`  ${this.colorize('Long Context:', 'green')} ${group.longContext || 'Not set'}`);
      console.log(`  ${this.colorize('Web Search:', 'green')} ${group.webSearch || 'Not set'}`);
      
      if (group.longContextThreshold) {
        console.log(`  ${this.colorize('Long Context Threshold:', 'green')} ${group.longContextThreshold} tokens`);
      }
    } catch (error) {
      console.log(this.colorize(`❌ Failed to load group details: ${(error as Error).message}`, 'red'));
    }
  }

  /**
   * 运行交互式CLI
   */
  public async run(): Promise<void> {
    try {
      await this.showMainMenu();
    } catch (error) {
      console.log(this.colorize(`❌ Error: ${(error as Error).message}`, 'red'));
    } finally {
      this.close();
    }
  }

  /**
   * 颜色化输出
   */
  private colorize(text: string, color: string): string {
    if (!this.options.enableColors) {
      return text;
    }

    const colors: { [key: string]: string } = {
      red: '\x1b[31m',
      green: '\x1b[32m',
      yellow: '\x1b[33m',
      blue: '\x1b[34m',
      magenta: '\x1b[35m',
      cyan: '\x1b[36m',
      white: '\x1b[37m',
      gray: '\x1b[90m',
      reset: '\x1b[0m'
    };

    const colorCode = colors[color] || colors.white;
    return `${colorCode}${text}${colors.reset}`;
  }

  /**
   * 关闭CLI
   */
  public close(): void {
    this.rl.close();
  }
}

export default RouterGroupApiCli;