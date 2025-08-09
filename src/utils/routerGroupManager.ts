import { EventEmitter } from "events";
import { log } from "./log";

export interface RouterGroup {
  name: string;
  description?: string;
  default: string;
  background?: string;
  think?: string;
  longContext?: string;
  longContextThreshold?: number;
  webSearch?: string;
  [key: string]: any;
}

export interface RouterGroupConfig {
  [groupId: string]: RouterGroup;
}

export interface RouterGroupManagerOptions {
  enableValidation?: boolean;
  enableLogging?: boolean;
}

export class RouterGroupManager extends EventEmitter {
  private config: any = null;
  private options: Required<RouterGroupManagerOptions>;
  private currentActiveGroup: string = 'router1';

  constructor(options: RouterGroupManagerOptions = {}) {
    super();
    
    this.options = {
      enableValidation: true,
      enableLogging: true,
      ...options
    };
  }

  /**
   * 初始化路由组管理器
   */
  public initialize(config: any): boolean {
    try {
      this.config = config;
      
      // 获取当前活跃的路由组
      if (config.Router?.activeGroup) {
        this.currentActiveGroup = config.Router.activeGroup;
      }

      // 验证路由组配置
      if (this.options.enableValidation) {
        const validation = this.validateRouterGroups();
        if (!validation.isValid && !this.config?.Router?.activeGroup) {
          // Only fail if no routing fallback exists
          this.logError('RouterGroupManager: Invalid router groups configuration:', validation.errors);
          // Don't return false for router group issues, let Router handle it
        }
      }

      this.logInfo('RouterGroupManager: Successfully initialized');
      return true;
    } catch (error) {
      this.logError('RouterGroupManager: Initialization failed:', error);
      return false;
    }
  }

  /**
   * 获取所有可用的路由组
   */
  public getRouterGroups(): { [groupId: string]: RouterGroup } {
    if (!this.config?.RouterGroups) {
      return {};
    }
    
    return this.config.RouterGroups;
  }

  /**
   * 获取当前活跃的路由组ID
   */
  public getCurrentActiveGroup(): string {
    return this.currentActiveGroup;
  }

  /**
   * 获取当前活跃的路由组配置
   */
  public getCurrentRouterConfig(): RouterGroup | null {
    const groups = this.getRouterGroups();
    return groups[this.currentActiveGroup] || null;
  }

  /**
   * 切换到指定的路由组
   */
  public switchToGroup(groupId: string): boolean {
    const groups = this.getRouterGroups();
    
    if (!groups[groupId]) {
      this.logError(`RouterGroupManager: Router group '${groupId}' does not exist`);
      return false;
    }

    const oldGroup = this.currentActiveGroup;
    this.currentActiveGroup = groupId;

    // 更新配置中的活跃组
    if (this.config?.Router) {
      this.config.Router.activeGroup = groupId;
    }

    this.logInfo(`RouterGroupManager: Switched from '${oldGroup}' to '${groupId}'`);
    this.emit('groupSwitched', {
      from: oldGroup,
      to: groupId,
      timestamp: Date.now()
    });

    return true;
  }

  /**
   * 获取路由组列表（用于CLI显示）
   */
  public getGroupsList(): Array<{
    id: string;
    name: string;
    description?: string;
    isActive: boolean;
  }> {
    const groups = this.getRouterGroups();
    
    return Object.entries(groups).map(([id, group]) => ({
      id,
      name: group.name,
      description: group.description,
      isActive: id === this.currentActiveGroup
    }));
  }

  /**
   * 获取指定路由组的配置
   */
  public getRouterGroup(groupId: string): RouterGroup | null {
    const groups = this.getRouterGroups();
    return groups[groupId] || null;
  }

  /**
   * 添加新的路由组
   */
  public addRouterGroup(groupId: string, group: RouterGroup): boolean {
    if (!this.config?.RouterGroups) {
      this.config.RouterGroups = {};
    }

    // 验证路由组配置
    if (this.options.enableValidation) {
      const validation = this.validateSingleRouterGroup(group);
      if (!validation.isValid) {
        this.logError(`RouterGroupManager: Invalid router group configuration for '${groupId}':`, validation.errors);
        return false;
      }
    }

    this.config.RouterGroups[groupId] = group;
    
    this.logInfo(`RouterGroupManager: Added new router group '${groupId}'`);
    this.emit('groupAdded', {
      groupId,
      group,
      timestamp: Date.now()
    });

    return true;
  }

  /**
   * 删除路由组
   */
  public removeRouterGroup(groupId: string): boolean {
    const groups = this.getRouterGroups();
    
    if (!groups[groupId]) {
      this.logError(`RouterGroupManager: Router group '${groupId}' does not exist`);
      return false;
    }

    // 如果删除的是当前活跃组，切换到第一个可用组
    if (groupId === this.currentActiveGroup) {
      const remainingGroups = Object.keys(groups).filter(id => id !== groupId);
      if (remainingGroups.length === 0) {
        this.logError('RouterGroupManager: Cannot delete the last router group');
        return false;
      }
      
      this.switchToGroup(remainingGroups[0]);
    }

    delete this.config.RouterGroups[groupId];
    
    this.logInfo(`RouterGroupManager: Removed router group '${groupId}'`);
    this.emit('groupRemoved', {
      groupId,
      timestamp: Date.now()
    });

    return true;
  }

  /**
   * 验证所有路由组配置
   */
  private validateRouterGroups(): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    const groups = this.getRouterGroups();
    
    if (Object.keys(groups).length === 0) {
      errors.push('No router groups defined');
    }

    for (const [groupId, group] of Object.entries(groups)) {
      const validation = this.validateSingleRouterGroup(group);
      if (!validation.isValid) {
        errors.push(`Group '${groupId}': ${validation.errors.join(', ')}`);
      }
    }

    // 验证当前活跃组是否存在
    if (this.currentActiveGroup && !groups[this.currentActiveGroup]) {
      errors.push(`Active group '${this.currentActiveGroup}' does not exist`);
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * 验证单个路由组配置
   */
  private validateSingleRouterGroup(group: RouterGroup): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!group.name) {
      errors.push('Missing required field: name');
    }

    if (!group.default) {
      errors.push('Missing required field: default');
    }

    // 验证路由格式 (provider,model)
    const routeFields = ['default', 'background', 'think', 'longContext', 'webSearch'];
    for (const field of routeFields) {
      if (group[field] && typeof group[field] === 'string') {
        const route = group[field] as string;
        if (!route.includes(',')) {
          errors.push(`Invalid route format for '${field}': expected 'provider,model'`);
        }
      }
    }

    // 验证长上下文阈值
    if (group.longContextThreshold !== undefined && 
        (typeof group.longContextThreshold !== 'number' || group.longContextThreshold < 0)) {
      errors.push('longContextThreshold must be a positive number');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * 获取合并后的Router配置（用于向后兼容）
   */
  public getMergedRouterConfig(): any {
    const currentGroup = this.getCurrentRouterConfig();
    if (!currentGroup) {
      return this.config?.Router || {};
    }

    // 合并当前路由组配置到Router配置中
    const mergedConfig = {
      ...this.config?.Router,
      ...currentGroup,
      activeGroup: this.currentActiveGroup
    };

    // 移除路由组特有的字段
    delete mergedConfig.name;
    delete mergedConfig.description;

    return mergedConfig;
  }

  /**
   * 更新配置
   */
  public updateConfig(config: any): boolean {
    this.config = config;
    
    // 重新获取活跃组
    if (config.Router?.activeGroup) {
      this.currentActiveGroup = config.Router.activeGroup;
    }

    if (this.options.enableValidation) {
      const validation = this.validateRouterGroups();
      if (!validation.isValid) {
        this.logError('RouterGroupManager: Invalid updated configuration:', validation.errors);
        return false;
      }
    }

    this.emit('configUpdated', {
      activeGroup: this.currentActiveGroup,
      timestamp: Date.now()
    });

    return true;
  }

  /**
   * 日志记录
   */
  private logInfo(message: string, ...args: any[]): void {
    if (this.options.enableLogging) {
      log(message, ...args);
    }
  }

  private logError(message: string, ...args: any[]): void {
    if (this.options.enableLogging) {
      log(message, ...args);
    }
  }
}

export default RouterGroupManager;