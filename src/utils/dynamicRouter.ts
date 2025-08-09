import { EventEmitter } from "events";
import { log } from "./log";
import { ConfigWatcher, ConfigChangeEvent } from "./configWatcher";
import { ConfigValidator, ValidationResult } from "./configValidator";
import { ConfigVersionManager, ConfigVersion } from "./configVersionManager";
import { router as originalRouter } from "./router";
import { RouterGroupManager } from "./routerGroupManager";
import { CONFIG_FILE } from "../constants";

export interface DynamicRouterOptions {
  enableHotReload?: boolean;
  enableValidation?: boolean;
  enableVersioning?: boolean;
  maxVersions?: number;
  customRouterPath?: string;
  rollbackOnFailure?: boolean;
}

export interface RouterStatus {
  isActive: boolean;
  currentVersion: string;
  lastUpdate: number;
  hotReloadEnabled: boolean;
  health: 'healthy' | 'degraded' | 'failed';
  errorCount: number;
  lastError?: string;
}

export interface RouterUpdateResult {
  success: boolean;
  version?: ConfigVersion;
  validation?: ValidationResult;
  error?: string;
  rollbackPerformed?: boolean;
}

export class DynamicRouter extends EventEmitter {
  private configWatcher?: ConfigWatcher;
  private validator: ConfigValidator;
  private versionManager: ConfigVersionManager;
  private routerGroupManager: RouterGroupManager;
  private currentConfig: any = null;
  private currentCustomRouter: Function | null = null;
  private options: Required<DynamicRouterOptions>;
  private isInitialized = false;
  private status: RouterStatus;
  private updateInProgress = false;

  constructor(options: DynamicRouterOptions = {}) {
    super();
    
    this.options = {
      enableHotReload: true,
      enableValidation: true,
      enableVersioning: true,
      maxVersions: 10,
      customRouterPath: '',
      rollbackOnFailure: true,
      ...options
    };

    this.validator = new ConfigValidator();
    this.versionManager = new ConfigVersionManager(this.options.maxVersions);
    this.routerGroupManager = new RouterGroupManager({
      enableValidation: this.options.enableValidation,
      enableLogging: true
    });
    
    this.status = {
      isActive: false,
      currentVersion: 'none',
      lastUpdate: 0,
      hotReloadEnabled: this.options.enableHotReload,
      health: 'healthy',
      errorCount: 0
    };
  }

  /**
   * 初始化动态路由器
   */
  public async initialize(initialConfig?: any): Promise<boolean> {
    if (this.isInitialized) {
      log('DynamicRouter: Already initialized');
      return true;
    }

    try {
      // 加载初始配置
      if (initialConfig && initialConfig.Providers && initialConfig.Router) {
        this.currentConfig = initialConfig;
      } else {
        // 从版本管理器同步配置文件
        const version = await this.versionManager.syncFromFile();
        if (version) {
          this.currentConfig = version.config;
        } else if (initialConfig) {
          this.currentConfig = initialConfig;
        }
      }

      // 确保至少有基本配置结构
      if (!this.currentConfig) {
        this.currentConfig = {
          Providers: [],
          Router: {
            default: "openrouter,claude-3.5-sonnet"
          }
        };
      }
      
      // 确保 Providers 和 Router 字段存在
      if (!this.currentConfig.Providers) {
        this.currentConfig.Providers = [];
      }
      if (!this.currentConfig.Router) {
        this.currentConfig.Router = { default: "openrouter,claude-3.5-sonnet" };
      }
      if (!this.currentConfig.Router.default) {
        this.currentConfig.Router.default = "openrouter,claude-3.5-sonnet";
      }

      // 初始化路由组管理器
      if (this.currentConfig) {
        const routerGroupInitialized = this.routerGroupManager.initialize(this.currentConfig);
        if (!routerGroupInitialized) {
          log('DynamicRouter: RouterGroupManager initialization failed');
        }
      }

      // 验证初始配置
      if (this.options.enableValidation && this.currentConfig) {
        const validation = await this.validator.validateConfig(this.currentConfig);
        if (!validation.isValid) {
          log('DynamicRouter: Initial configuration is invalid:', validation.errors);
          this.status.health = 'failed';
          this.status.lastError = 'Invalid initial configuration';
          return false;
        }
      }

      // 添加初始版本
      if (this.options.enableVersioning && this.currentConfig) {
        const version = this.versionManager.addVersion(
          this.currentConfig, 
          'manual', 
          'Initial configuration'
        );
        this.status.currentVersion = version.version;
      }

      // 加载自定义路由器
      await this.loadCustomRouter();

      // 启动文件监听
      if (this.options.enableHotReload) {
        await this.startWatching();
      }

      this.isInitialized = true;
      this.status.isActive = true;
      this.status.lastUpdate = Date.now();
      
      log('DynamicRouter: Successfully initialized');
      this.emit('initialized', this.status);
      return true;

    } catch (error) {
      log('DynamicRouter: Initialization failed:', error);
      this.status.health = 'failed';
      this.status.lastError = (error as Error).message;
      this.emit('error', error);
      return false;
    }
  }

  /**
   * 启动配置文件监听
   */
  private async startWatching(): Promise<void> {
    if (this.configWatcher) {
      return;
    }

    this.configWatcher = new ConfigWatcher(
      CONFIG_FILE,
      this.options.customRouterPath,
      {
        debounceMs: 500,
        enableCustomRouter: !!this.options.customRouterPath,
        validateOnChange: this.options.enableValidation
      }
    );

    this.configWatcher.on('change', this.handleConfigChange.bind(this));
    this.configWatcher.on('error', this.handleWatcherError.bind(this));
    
    await this.configWatcher.startWatching();
    log('DynamicRouter: Configuration file watching started');
  }

  /**
   * 停止配置文件监听
   */
  public async stopWatching(): Promise<void> {
    if (this.configWatcher) {
      await this.configWatcher.stopWatching();
      this.configWatcher = undefined;
      log('DynamicRouter: Configuration file watching stopped');
    }
  }

  /**
   * 处理配置文件变化
   */
  private async handleConfigChange(changeEvent: ConfigChangeEvent): Promise<void> {
    if (this.updateInProgress) {
      log('DynamicRouter: Update already in progress, skipping change event');
      return;
    }

    log(`DynamicRouter: Configuration ${changeEvent.type} changed: ${changeEvent.path}`);
    
    try {
      this.updateInProgress = true;
      
      if (changeEvent.error) {
        log('DynamicRouter: Configuration change contains error:', changeEvent.error);
        this.handleUpdateError(changeEvent.error);
        return;
      }

      let updateResult: RouterUpdateResult;

      if (changeEvent.type === 'config') {
        updateResult = await this.updateConfiguration(changeEvent.content, 'file-watch');
      } else {
        updateResult = await this.updateCustomRouter(changeEvent.path);
      }

      if (updateResult.success) {
        log(`DynamicRouter: Successfully processed ${changeEvent.type} change`);
        this.emit('configUpdated', updateResult);
      } else {
        log(`DynamicRouter: Failed to process ${changeEvent.type} change:`, updateResult.error);
        this.emit('updateFailed', updateResult);
      }

    } finally {
      this.updateInProgress = false;
    }
  }

  /**
   * 更新配置
   */
  public async updateConfiguration(
    newConfig: any, 
    source: 'manual' | 'file-watch' | 'api' = 'manual'
  ): Promise<RouterUpdateResult> {
    const result: RouterUpdateResult = { success: false };

    try {
      // 验证新配置
      if (this.options.enableValidation) {
        result.validation = await this.validator.validateConfig(newConfig);
        
        if (!result.validation.isValid) {
          result.error = 'Configuration validation failed';
          
          // 如果启用了失败回滚，尝试回滚
          if (this.options.rollbackOnFailure) {
            const rollbackSuccess = await this.performRollback();
            result.rollbackPerformed = rollbackSuccess;
          }
          
          return result;
        }
      }

      // 创建备份（当前配置版本）
      let previousVersion: ConfigVersion | null = null;
      if (this.options.enableVersioning) {
        previousVersion = this.versionManager.getCurrentVersion();
      }

      // 添加新版本
      if (this.options.enableVersioning) {
        result.version = this.versionManager.addVersion(newConfig, source, 'Configuration update');
        this.status.currentVersion = result.version.version;
      }

      // 应用新配置
      this.currentConfig = newConfig;
      
      // 更新路由组管理器配置
      this.routerGroupManager.updateConfig(newConfig);
      
      this.status.lastUpdate = Date.now();
      this.status.health = 'healthy';
      this.status.errorCount = 0;
      this.status.lastError = undefined;

      result.success = true;
      log(`DynamicRouter: Configuration updated successfully to version ${this.status.currentVersion}`);

    } catch (error) {
      result.error = (error as Error).message;
      this.handleUpdateError(error as Error);
      
      // 如果启用了失败回滚，尝试回滚
      if (this.options.rollbackOnFailure) {
        const rollbackSuccess = await this.performRollback();
        result.rollbackPerformed = rollbackSuccess;
      }
    }

    return result;
  }

  /**
   * 更新自定义路由器
   */
  private async updateCustomRouter(filePath: string): Promise<RouterUpdateResult> {
    const result: RouterUpdateResult = { success: false };

    try {
      // 验证自定义路由器文件
      if (this.options.enableValidation) {
        result.validation = await this.validator.validateCustomRouter(filePath);
        
        if (!result.validation.isValid) {
          result.error = 'Custom router validation failed';
          return result;
        }
      }

      // 加载新的自定义路由器
      await this.loadCustomRouter(filePath);
      
      result.success = true;
      log('DynamicRouter: Custom router updated successfully');

    } catch (error) {
      result.error = (error as Error).message;
      this.handleUpdateError(error as Error);
    }

    return result;
  }

  /**
   * 加载自定义路由器
   */
  private async loadCustomRouter(filePath?: string): Promise<void> {
    const routerPath = filePath || this.options.customRouterPath;
    
    if (!routerPath) {
      this.currentCustomRouter = null;
      return;
    }

    try {
      // 清除模块缓存
      delete require.cache[require.resolve(routerPath)];
      
      // 加载自定义路由器
      this.currentCustomRouter = require(routerPath);
      
      if (typeof this.currentCustomRouter !== 'function') {
        throw new Error('Custom router must export a function');
      }

      log(`DynamicRouter: Custom router loaded from ${routerPath}`);

    } catch (error) {
      log(`DynamicRouter: Failed to load custom router from ${routerPath}:`, error);
      this.currentCustomRouter = null;
      throw error;
    }
  }

  /**
   * 路由请求
   */
  public async route(req: any, res: any): Promise<void> {
    if (!this.isInitialized || !this.currentConfig) {
      throw new Error('DynamicRouter not initialized');
    }

    try {
      // 使用自定义路由器（如果可用）
      if (this.currentCustomRouter && this.currentConfig.CUSTOM_ROUTER_PATH) {
        req.tokenCount = req.tokenCount || 0;
        const model = await this.currentCustomRouter(req, this.currentConfig);
        if (model) {
          req.body.model = model;
          return;
        }
      }

      // 获取合并的路由配置（包含当前活跃的路由组）
      const mergedConfig = {
        ...this.currentConfig,
        Router: this.routerGroupManager.getMergedRouterConfig()
      };

      // 使用默认路由器
      await originalRouter(req, res, mergedConfig);

    } catch (error) {
      this.handleRouterError(error as Error);
      
      // 降级处理：使用基本路由逻辑
      const currentRouter = this.routerGroupManager.getCurrentRouterConfig();
      if (currentRouter?.default) {
        req.body.model = currentRouter.default;
      } else if (this.currentConfig.Router?.default) {
        req.body.model = this.currentConfig.Router.default;
      }
      
      throw error;
    }
  }

  /**
   * 手动重新加载配置
   */
  public async reloadConfiguration(): Promise<RouterUpdateResult> {
    log('DynamicRouter: Manual configuration reload requested');
    
    try {
      const version = await this.versionManager.syncFromFile();
      if (!version) {
        return { success: false, error: 'Failed to load configuration from file' };
      }

      return await this.updateConfiguration(version.config, 'manual');
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * 回滚到指定版本
   */
  public async rollbackToVersion(versionId: string): Promise<boolean> {
    if (!this.options.enableVersioning) {
      log('DynamicRouter: Versioning is disabled, cannot rollback');
      return false;
    }

    const success = await this.versionManager.rollbackToVersion(versionId);
    
    if (success) {
      const version = this.versionManager.getVersion(versionId);
      if (version) {
        this.currentConfig = version.config;
        this.status.currentVersion = version.version;
        this.status.lastUpdate = Date.now();
        this.status.health = 'healthy';
        
        log(`DynamicRouter: Successfully rolled back to version ${version.version}`);
        this.emit('rollbackCompleted', version);
      }
    }

    return success;
  }

  /**
   * 执行自动回滚
   */
  private async performRollback(): Promise<boolean> {
    if (!this.options.enableVersioning) {
      return false;
    }

    const versions = this.versionManager.getAllVersions();
    const previousVersion = versions.find(v => !v.isActive && v.rollbackSupported);

    if (!previousVersion) {
      log('DynamicRouter: No suitable version found for rollback');
      return false;
    }

    log(`DynamicRouter: Attempting automatic rollback to version ${previousVersion.version}`);
    return await this.rollbackToVersion(previousVersion.id);
  }

  /**
   * 获取路由器状态
   */
  public getStatus(): RouterStatus {
    return { ...this.status };
  }

  /**
   * 获取配置版本信息
   */
  public getVersionInfo() {
    return {
      current: this.versionManager.getCurrentVersion(),
      metadata: this.versionManager.getMetadata(),
      all: this.versionManager.getAllVersions()
    };
  }

  /**
   * 获取当前配置
   */
  public getCurrentConfig(): any {
    return this.currentConfig;
  }

  /**
   * 获取路由组管理器
   */
  public getRouterGroupManager(): RouterGroupManager {
    return this.routerGroupManager;
  }

  /**
   * 切换路由组
   */
  public switchRouterGroup(groupId: string): boolean {
    const success = this.routerGroupManager.switchToGroup(groupId);
    if (success) {
      log(`DynamicRouter: Switched to router group '${groupId}'`);
      this.emit('routerGroupSwitched', {
        groupId,
        timestamp: Date.now()
      });
    }
    return success;
  }

  /**
   * 获取所有路由组
   */
  public getRouterGroups() {
    return this.routerGroupManager.getGroupsList();
  }

  /**
   * 获取当前活跃的路由组
   */
  public getCurrentRouterGroup() {
    return this.routerGroupManager.getCurrentActiveGroup();
  }

  /**
   * 处理更新错误
   */
  private handleUpdateError(error: Error): void {
    this.status.errorCount++;
    this.status.lastError = error.message;
    this.status.health = this.status.errorCount > 3 ? 'failed' : 'degraded';
    
    log('DynamicRouter: Update error:', error);
    this.emit('error', error);
  }

  /**
   * 处理路由错误
   */
  private handleRouterError(error: Error): void {
    this.status.errorCount++;
    this.status.lastError = error.message;
    
    if (this.status.errorCount > 5) {
      this.status.health = 'failed';
    } else if (this.status.errorCount > 2) {
      this.status.health = 'degraded';
    }
    
    log('DynamicRouter: Router error:', error);
    this.emit('routerError', error);
  }

  /**
   * 处理监听器错误
   */
  private handleWatcherError(changeEvent: ConfigChangeEvent): void {
    this.status.errorCount++;
    this.status.lastError = changeEvent.error?.message || 'Watcher error';
    
    log('DynamicRouter: Watcher error:', changeEvent.error);
    this.emit('watcherError', changeEvent.error);
  }

  /**
   * 清理资源
   */
  public async dispose(): Promise<void> {
    await this.stopWatching();
    this.removeAllListeners();
    this.isInitialized = false;
    this.status.isActive = false;
    
    log('DynamicRouter: Disposed');
  }
}