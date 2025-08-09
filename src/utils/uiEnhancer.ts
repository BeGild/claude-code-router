import chalk from 'chalk';

export interface UIConfig {
  enableColors?: boolean;
  enableASCII?: boolean;
  enableIcons?: boolean;
}

export class UIEnhancer {
  private config: Required<UIConfig>;

  constructor(config: UIConfig = {}) {
    this.config = {
      enableColors: true,
      enableASCII: true,
      enableIcons: true,
      ...config
    };
  }

  // 颜色主题
  private readonly theme = {
    primary: '#00D4FF',
    secondary: '#FF6B6B',
    success: '#51CF66',
    warning: '#FFD93D',
    error: '#FF6B6B',
    info: '#74C0FC',
    muted: '#8B9DC3',
    border: '#495057'
  };

  // 视觉分隔符
  private readonly borders = {
    separator: '━',
    topLeft: '┏',
    topRight: '┓',
    bottomLeft: '┗',
    bottomRight: '┛',
    vertical: '┃',
    horizontal: '━',
    cross: '╋',
    branch: '┣',
    end: '┗'
  };

  // 图标映射
  private readonly icons = {
    success: '✅',
    error: '❌',
    warning: '⚠️',
    info: 'ℹ️',
    loading: '🔄',
    server: '🖥️',
    api: '📡',
    port: '🔌',
    process: '🆔',
    file: '📄',
    router: '🚦',
    group: '👥',
    settings: '⚙️',
    time: '⏰',
    key: '🔑',
    link: '🔗',
    check: '✓',
    cross: '✗',
    arrow: '→',
    heart: '❤️',
    star: '⭐',
    fire: '🔥',
    rocket: '🚀',
    chart: '📊',
    clipboard: '📋',
    refresh: '🔄',
    power: '⚡',
    lock: '🔒',
    unlock: '🔓',
    gear: '⚙️',
    search: '🔍'
  };

  // 创建格式化的标题
  public createTitle(text: string, options: { icon?: string; color?: string; border?: boolean } = {}): string {
    const { icon = '', color = 'cyan', border = true } = options;
    
    if (!this.config.enableColors) {
      return `${icon} ${text}`;
    }

    const coloredText = this.colorize(text, color);
    const iconText = icon ? `${icon} ` : '';
    const title = `${iconText}${coloredText}`;
    
    if (border) {
      const width = Math.max(process.stdout.columns || 80, 40);
      const separator = this.borders.separator.repeat(Math.min(width - 2, 60));
      return `\n${title}\n${chalk.hex(this.theme.border)(separator)}\n`;
    }
    
    return title;
  }

  // 创建信息卡片
  public createInfoCard(title: string, items: Array<{ label: string; value: string; icon?: string }>): string {
    if (!this.config.enableColors) {
      return items.map(item => `${item.label}: ${item.value}`).join('\n');
    }

    const cardTitle = this.createTitle(title, { border: false });
    const lines = items.map(item => {
      const icon = item.icon || this.getRelevantIcon(item.label);
      const label = this.colorize(item.label, 'blue');
      const value = this.colorize(item.value, 'white');
      return `  ${icon} ${label}: ${value}`;
    });

    return `${cardTitle}\n${lines.join('\n')}\n`;
  }

  // 创建状态表格
  public createStatusTable(title: string, data: Record<string, string | number>, options: { icon?: string } = {}): string {
    const maxLabelLength = Math.max(...Object.keys(data).map(k => k.length));
    const rows = Object.entries(data).map(([key, value]) => {
      const padKey = key.padEnd(maxLabelLength);
      const icon = this.getRelevantIcon(key);
      return `  ${icon} ${this.colorize(padKey, 'blue')}: ${this.colorize(String(value), 'white')}`;
    });

    return `${this.createTitle(title, { icon: options.icon || this.icons.chart, border: false })}\n${rows.join('\n')}\n`;
  }

  // 创建路由组展示
  public createRouterGroupList(groups: any[], currentGroup: string): string {
    if (!groups.length) {
      return this.createWarning('No router groups found');
    }

    const currentSection = this.createTitle('Current Active Group:', { icon: this.icons.group, border: false });
    const currentText = this.colorize(currentGroup, 'green');
    
    const groupsTitle = this.createTitle('Available Router Groups:', { icon: this.icons.router, border: false });
    
    const groupList = groups.map((group, index) => {
      const isActive = group.isActive;
      const marker = isActive ? this.colorize(`${this.icons.success} ACTIVE`, 'green') : `  ${index + 1}.`;
      const name = this.colorize(group.name, isActive ? 'green' : 'white');
      const id = this.colorize(`(${group.id})`, 'gray');
      
      let groupText = `${marker} ${name} ${id}`;
      
      if (group.description) {
        groupText += `\n      ${this.colorize('→', 'gray')} ${this.colorize(group.description, 'gray')}`;
      }
      
      if (isActive) {
        groupText += this.createQuickRouters(group);
      }
      
      return groupText;
    }).join('\n\n');

    return `${currentSection}\n${this.colorize('  ' + currentText, 'green')}\n\n${groupsTitle}\n${groupList}\n`;
  }

  private createQuickRouters(group: any): string {
    const routes = ['default', 'background', 'think', 'longContext', 'webSearch'];
    const routesDisplay = routes.map(route => {
      const value = group[route] || 'Not set';
      const icon = this.getRouteIcon(route);
      return `${icon} ${route}: ${this.colorize(value, 'cyan')}`;
    }).join(' | ');
    
    return `\n      ${this.colorize('Routes:', 'blue')}\n         ${routesDisplay}`;
  }

  // 获取相关的路由图标
  private getRouteIcon(route: string): string {
    const iconMap: Record<string, string> = {
      default: '🔄',
      background: '🌙',
      think: '🧠',
      longContext: '📏',
      webSearch: '🌐'
    };
    return iconMap[route] || '→';
  }

  // 获取相关图标
  private getRelevantIcon(key: string): string {
    const lowerKey = key.toLowerCase();
    const iconMap: Record<string, string> = {
      'status': this.icons.info,
      'pid': this.icons.process,
      'port': this.icons.port,
      'endpoint': this.icons.api,
      'file': this.icons.file,
      'name': this.icons.router,
      'description': '📝',
      'id': '🔑',
      'active': this.icons.success,
      'running': this.icons.server
    };

    for (const [k, icon] of Object.entries(iconMap)) {
      if (lowerKey.includes(k)) return icon;
    }
    return '→';
  }

  // 创建警告消息
  public createWarning(message: string): string {
    if (!this.config.enableColors) return `Warning: ${message}`;
    return `${this.colorize(this.icons.warning + ' Warning:', 'yellow')} ${this.colorize(message, 'white')}`;
  }

  // 创建错误消息
  public createError(message: string): string {
    if (!this.config.enableColors) return `Error: ${message}`;
    return `${this.colorize(this.icons.error + ' Error:', this.theme.error)} ${this.colorize(message, 'white')}`;
  }

  // 创建成功消息
  public createSuccess(message: string, details?: string): string {
    const successText = `${this.icons.success} ${this.colorize('Success:', this.theme.success)} ${this.colorize(message, 'white')}`;
    if (details) {
      return `${successText}\n${this.colorize(`   ${details}`, 'gray')}`;
    }
    return successText;
  }

  // 创建标题和底部装饰
  public createBoxedMessage(title: string, lines: string[]): string {
    const maxWidth = Math.max(title.length, ...lines.map(l => l.length)) + 4;
    const top = this.borders.topLeft + this.borders.horizontal.repeat(maxWidth - 2) + this.borders.topRight;
    const middle = lines.map(line => `${this.borders.vertical} ${line.padEnd(maxWidth - 2)} ${this.borders.vertical}`);
    const bottom = this.borders.bottomLeft + this.borders.horizontal.repeat(maxWidth - 2) + this.borders.bottomRight;

    return [top, this.borders.vertical + ' ' + this.colorize(title, 'cyan') + ' '.repeat(maxWidth - title.length - 3) + this.borders.vertical, 
            ...middle, bottom].join('\n');
  }

  // 创建对齐的文本列
  public createAlignedList(items: Array<{ label: string; value: string; icon?: string }>, spacing = 2): string {
    const maxLabelLength = Math.max(...items.map(item => item.label.length));
    return items.map(item => {
      const icon = item.icon || '•';
      const paddedLabel = item.label.padEnd(maxLabelLength + spacing);
      return `${icon} ${this.colorize(paddedLabel, 'blue')}${this.colorize(item.value, 'white')}`;
    }).join('\n');
  }

  // 颜色化文本
  private colorize(text: string, color: string): string {
    if (!this.config.enableColors) return text;

    const colorMap: Record<string, string> = {
      red: '#FF6B6B',
      green: '#51CF66',
      yellow: '#FFD93D',
      blue: '#74C0FC',
      cyan: '#00D4FF',
      white: '#FFFFFF',
      gray: '#8B9DC3',
      magenta: '#E599F7'
    };

    return chalk.hex(colorMap[color] || colorMap.white)(text);
  }

  // 创建加载动画
  public createSpinner(text: string): string {
    return `${this.icons.loading} ${text}...`;
  }

  // 创建优雅的帮助信息
  public createHelpSection(): string {
    const commands = [
      { command: 'ccr start', description: 'Start the router service' },
      { command: 'ccr stop', description: 'Stop the router service' },
      { command: 'ccr status', description: 'Check service status' },
      { command: 'ccr code "prompt"', description: 'Execute Claude command via router' },
      { command: 'ccr ui', description: 'Open web interface' },
      { command: 'ccr router', description: 'Manage router groups' }
    ];

    const maxLength = Math.max(...commands.map(c => c.command.length));
    const lines = commands.map(cmd => 
      `${this.colorize(cmd.command.padEnd(maxLength + 2), 'cyan')} ${this.colorize(cmd.description, 'gray')}`
    );

    return this.createTitle('📋 Available Commands', { border: false, icon: this.icons.clipboard }) + 
           '\n' + lines.join('\n');
  }

  // 创建分隔符
  public separator(title: string, width = 60): string {
    if (!this.config.enableColors) {
      return `${title}\n${'='.repeat(width)}`;
    }
    const separator = this.borders.separator.repeat(width);
    return `\n${this.colorize(title, 'cyan')}\n${chalk.hex(this.theme.border)(separator)}\n`;
  }

  // 创建表格
  public createTable(rows: string[][], options: { padding?: number } = {}): string {
    const { padding = 1 } = options;
    
    if (rows.length === 0) return '';
    
    // Calculate column widths
    const colWidths = rows[0].map((_, colIndex) =>
      Math.max(...rows.map(row => (row[colIndex] || '').length))
    );
    
    // Format rows
    const formattedRows = rows.map((row, rowIndex) => {
      const formattedCells = row.map((cell, colIndex) => {
        const paddedCell = (cell || '').padEnd(colWidths[colIndex] + padding);
        return paddedCell;
      });
      
      // Header row styling
      if (rowIndex === 0) {
        return `  ${formattedCells.join(' ')}`;
      }
      
      return `  ${formattedCells.join(' ')}`;
    });
    
    return formattedRows.join('\n');
  }

  // 创建列表项
  public listItem(text: string): string {
    return `  • ${text}`;
  }

  // 简化的颜色方法（对外接口）
  public color(text: string, color: string): string {
    return this.colorize(text, color);
  }

  // 创建边框
  public border(startChar: string, fillChar: string, endChar: string, width = 60): string {
    if (!this.config.enableColors) {
      return startChar + fillChar.repeat(width - 2) + endChar;
    }
    const border = startChar + fillChar.repeat(width - 2) + endChar;
    return chalk.hex(this.theme.border)(border);
  }

  // 格式化系统信息
  public formatSystemInfo(info: any): string {
    const items = [
      { label: 'Status', value: info.running ? 'Running' : 'Stopped', icon: info.running ? this.icons.success : this.icons.error },
      { label: 'Process ID', value: info.pid ? info.pid.toString() : 'N/A', icon: this.icons.process },
      { label: 'Port', value: info.port.toString(), icon: this.icons.port },
      { label: 'Endpoint', value: info.endpoint, icon: this.icons.api },
      { label: 'Reference Count', value: info.referenceCount.toString(), icon: this.icons.chart },
      { label: 'PID File', value: info.pidFile, icon: this.icons.file }
    ];

    return this.createAlignedList(items);
  }

  // 获取表情符号
  public emoji(name: string): string {
    return this.icons[name] || '•';
  }
}