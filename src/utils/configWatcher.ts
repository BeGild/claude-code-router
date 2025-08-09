import { EventEmitter } from "events";
import chokidar from "chokidar";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { log } from "./log";
import { createHash } from "crypto";

export interface ConfigChangeEvent {
  type: 'config' | 'custom-router';
  path: string;
  content?: any;
  checksum: string;
  timestamp: number;
  error?: Error;
}

export interface WatcherOptions {
  debounceMs?: number;
  enableCustomRouter?: boolean;
  validateOnChange?: boolean;
}

export class ConfigWatcher extends EventEmitter {
  private watcher?: chokidar.FSWatcher;
  private debounceTimer?: NodeJS.Timeout;
  private currentChecksums = new Map<string, string>();
  private isWatching = false;
  
  constructor(
    private configPath: string,
    private customRouterPath?: string,
    private options: WatcherOptions = {}
  ) {
    super();
    this.options = {
      debounceMs: 500,
      enableCustomRouter: true,
      validateOnChange: true,
      ...options
    };
  }

  /**
   * 开始监听配置文件变化
   */
  public async startWatching(): Promise<void> {
    if (this.isWatching) {
      return;
    }

    const watchPaths: string[] = [this.configPath];
    if (this.customRouterPath && this.options.enableCustomRouter) {
      watchPaths.push(this.customRouterPath);
    }

    // 初始化文件校验和
    for (const path of watchPaths) {
      if (existsSync(path)) {
        const checksum = this.calculateChecksum(path);
        this.currentChecksums.set(path, checksum);
      }
    }

    this.watcher = chokidar.watch(watchPaths, {
      persistent: true,
      ignoreInitial: true,
      atomic: true,
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 50
      }
    });

    this.watcher.on('change', this.handleFileChange.bind(this));
    this.watcher.on('add', this.handleFileChange.bind(this));
    this.watcher.on('error', this.handleWatcherError.bind(this));

    this.isWatching = true;
    log('ConfigWatcher: Started watching configuration files', watchPaths);
    this.emit('started', watchPaths);
  }

  /**
   * 停止监听
   */
  public async stopWatching(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = undefined;
    }

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = undefined;
    }

    this.isWatching = false;
    this.currentChecksums.clear();
    log('ConfigWatcher: Stopped watching configuration files');
    this.emit('stopped');
  }

  /**
   * 手动检查配置文件变化
   */
  public async checkForChanges(): Promise<ConfigChangeEvent[]> {
    const changes: ConfigChangeEvent[] = [];
    const watchPaths = [this.configPath];
    
    if (this.customRouterPath && this.options.enableCustomRouter) {
      watchPaths.push(this.customRouterPath);
    }

    for (const path of watchPaths) {
      if (!existsSync(path)) {
        continue;
      }

      const newChecksum = this.calculateChecksum(path);
      const oldChecksum = this.currentChecksums.get(path);

      if (oldChecksum !== newChecksum) {
        const changeEvent = await this.createChangeEvent(path, newChecksum);
        changes.push(changeEvent);
        this.currentChecksums.set(path, newChecksum);
      }
    }

    return changes;
  }

  /**
   * 获取当前监听状态
   */
  public getStatus() {
    return {
      isWatching: this.isWatching,
      watchedFiles: Array.from(this.currentChecksums.keys()),
      options: this.options
    };
  }

  /**
   * 处理文件变化事件
   */
  private handleFileChange(path: string): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(async () => {
      try {
        const newChecksum = this.calculateChecksum(path);
        const oldChecksum = this.currentChecksums.get(path);

        // 检查文件是否真正发生变化
        if (oldChecksum === newChecksum) {
          return;
        }

        const changeEvent = await this.createChangeEvent(path, newChecksum);
        this.currentChecksums.set(path, newChecksum);

        log(`ConfigWatcher: Configuration file changed - ${path}`);
        this.emit('change', changeEvent);

      } catch (error) {
        const changeEvent: ConfigChangeEvent = {
          type: this.getFileType(path),
          path,
          checksum: '',
          timestamp: Date.now(),
          error: error as Error
        };

        log(`ConfigWatcher: Error processing file change - ${path}:`, error);
        this.emit('error', changeEvent);
      }
    }, this.options.debounceMs);
  }

  /**
   * 处理监听器错误
   */
  private handleWatcherError(error: Error): void {
    log('ConfigWatcher: Watcher error:', error);
    this.emit('watcherError', error);
  }

  /**
   * 创建变化事件对象
   */
  private async createChangeEvent(path: string, checksum: string): Promise<ConfigChangeEvent> {
    const changeEvent: ConfigChangeEvent = {
      type: this.getFileType(path),
      path,
      checksum,
      timestamp: Date.now()
    };

    try {
      // 读取文件内容
      if (path.endsWith('.json')) {
        const content = readFileSync(path, 'utf-8');
        changeEvent.content = JSON.parse(content);
      } else if (path.endsWith('.js')) {
        // 对于自定义路由文件，我们不直接解析内容，只记录路径
        changeEvent.content = { customRouterPath: path };
      }
    } catch (error) {
      changeEvent.error = error as Error;
    }

    return changeEvent;
  }

  /**
   * 计算文件校验和
   */
  private calculateChecksum(filePath: string): string {
    try {
      const content = readFileSync(filePath);
      return createHash('md5').update(content).digest('hex');
    } catch (error) {
      log(`ConfigWatcher: Failed to calculate checksum for ${filePath}:`, error);
      return '';
    }
  }

  /**
   * 获取文件类型
   */
  private getFileType(path: string): 'config' | 'custom-router' {
    if (path === this.configPath) {
      return 'config';
    } else if (path === this.customRouterPath) {
      return 'custom-router';
    } else {
      // 根据文件扩展名判断
      return path.endsWith('.json') ? 'config' : 'custom-router';
    }
  }
}

/**
 * 创建配置监听器实例
 */
export const createConfigWatcher = (
  configPath: string,
  customRouterPath?: string,
  options?: WatcherOptions
): ConfigWatcher => {
  return new ConfigWatcher(configPath, customRouterPath, options);
};