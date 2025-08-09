import readline from 'readline';
import { log } from './log';
import { DynamicRouter } from './dynamicRouter';

export interface CliOptions {
  enableColors?: boolean;
  enableLogging?: boolean;
}

export class RouterGroupCli {
  private rl: readline.Interface;
  private options: Required<CliOptions>;
  private dynamicRouter?: DynamicRouter;

  constructor(options: CliOptions = {}) {
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
   * 设置动态路由器实例
   */
  public setDynamicRouter(router: DynamicRouter): void {
    this.dynamicRouter = router;
  }

  /**
   * 显示主菜单
   */
  public async showMainMenu(): Promise<void> {
    if (!this.dynamicRouter) {
      console.log(this.colorize('❌ Error: Dynamic router not initialized', 'red'));
      return;
    }

    const groups = this.dynamicRouter.getRouterGroups();
    const currentGroup = this.dynamicRouter.getCurrentRouterGroup();
    
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

    groups.forEach((group, index) => {
      const marker = group.isActive ? this.colorize('●', 'green') : ' ';
      const nameColor = group.isActive ? 'green' : 'white';
      console.log(`${marker} ${index + 1}. ${this.colorize(group.name, nameColor)} (${group.id})`);
      
      if (group.description) {
        console.log(`   ${this.colorize('Description:', 'gray')} ${group.description}`);
      }
      
      if (group.isActive) {
        await this.showGroupDetails(group.id);
      }
    });

    console.log('\n' + this.colorize('Options:', 'blue'));
    console.log('1-' + groups.length + ': Switch to router group');
    console.log('d: Show details for a group');
    console.log('r: Refresh/reload configuration');
    console.log('q: Quit');

    await this.handleMenuChoice(groups);
  }

  /**
   * 处理菜单选择
   */
  private async handleMenuChoice(groups: any[]): Promise<void> {
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
          const result = await this.dynamicRouter?.reloadConfiguration();
          if (result?.success) {
            console.log(this.colorize('✅ Configuration reloaded successfully', 'green'));
          } else {
            console.log(this.colorize(`❌ Failed to reload: ${result?.error}`, 'red'));
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
    
    const success = this.dynamicRouter?.switchRouterGroup(groupId);
    
    if (success) {
      console.log(this.colorize(`✅ Successfully switched to '${groupName}'`, 'green'));
      console.log(this.colorize('New requests will now use this router group', 'green'));
    } else {
      console.log(this.colorize(`❌ Failed to switch to '${groupName}'`, 'red'));
    }
  }

  /**
   * 显示组详情选择
   */
  private async showGroupSelectionForDetails(groups: any[]): Promise<void> {
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
    if (!this.dynamicRouter) return;

    const routerGroupManager = this.dynamicRouter.getRouterGroupManager();
    const group = routerGroupManager.getRouterGroup(groupId);
    
    if (!group) {
      console.log(this.colorize(`❌ Group '${groupId}' not found`, 'red'));
      return;
    }

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

export default RouterGroupCli;