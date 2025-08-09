import { EventEmitter } from "events";
import { log } from "./log";

export interface Provider {
  name: string;
  api_base_url: string;
  api_key: string;
  models: string[];
  transformer?: any;
  status?: 'active' | 'inactive' | 'failed';
  lastHealthCheck?: number;
  responseTime?: number;
  errorCount?: number;
  lastError?: string;
}

export interface ProviderHealthStatus {
  name: string;
  status: 'healthy' | 'degraded' | 'failed' | 'unknown';
  responseTime?: number;
  lastCheck: number;
  errorMessage?: string;
  consecutiveFailures: number;
}

export interface ProviderUpdateResult {
  success: boolean;
  providersAdded: string[];
  providersRemoved: string[];
  providersUpdated: string[];
  errors: string[];
}

export class ProviderManager extends EventEmitter {
  private providers: Map<string, Provider> = new Map();
  private healthStatus: Map<string, ProviderHealthStatus> = new Map();
  private healthCheckInterval?: NodeJS.Timeout;
  private readonly healthCheckIntervalMs = 300000; // 5分钟
  private readonly healthCheckTimeoutMs = 10000; // 10秒

  constructor() {
    super();
  }

  /**
   * 更新提供商列表
   */
  public async updateProviders(newProviders: Provider[]): Promise<ProviderUpdateResult> {
    const result: ProviderUpdateResult = {
      success: true,
      providersAdded: [],
      providersRemoved: [],
      providersUpdated: [],
      errors: []
    };

    try {
      const currentProviderNames = new Set(this.providers.keys());
      const newProviderNames = new Set(newProviders.map(p => p.name));

      // 找出要删除的提供商
      for (const name of currentProviderNames) {
        if (!newProviderNames.has(name)) {
          this.removeProvider(name);
          result.providersRemoved.push(name);
        }
      }

      // 添加或更新提供商
      for (const provider of newProviders) {
        try {
          if (this.providers.has(provider.name)) {
            // 更新现有提供商
            const existingProvider = this.providers.get(provider.name);
            if (existingProvider && this.hasProviderChanged(existingProvider, provider)) {
              await this.updateProvider(provider);
              result.providersUpdated.push(provider.name);
            }
          } else {
            // 添加新提供商
            await this.addProvider(provider);
            result.providersAdded.push(provider.name);
          }
        } catch (error) {
          result.errors.push(`Failed to process provider ${provider.name}: ${(error as Error).message}`);
          result.success = false;
        }
      }

      // 如果有新的提供商添加，启动健康检查
      if (result.providersAdded.length > 0 || result.providersUpdated.length > 0) {
        this.startHealthChecks();
      }

      log(`ProviderManager: Updated providers - Added: ${result.providersAdded.length}, Updated: ${result.providersUpdated.length}, Removed: ${result.providersRemoved.length}`);
      this.emit('providersUpdated', result);

    } catch (error) {
      result.success = false;
      result.errors.push(`Provider update failed: ${(error as Error).message}`);
      log('ProviderManager: Provider update failed:', error);
    }

    return result;
  }

  /**
   * 添加新提供商
   */
  private async addProvider(provider: Provider): Promise<void> {
    // 验证提供商配置
    this.validateProvider(provider);
    
    // 初始化提供商状态
    provider.status = 'inactive';
    provider.errorCount = 0;
    
    this.providers.set(provider.name, provider);
    
    // 初始化健康状态
    this.healthStatus.set(provider.name, {
      name: provider.name,
      status: 'unknown',
      lastCheck: 0,
      consecutiveFailures: 0
    });

    // 立即进行健康检查
    await this.checkProviderHealth(provider.name);
    
    log(`ProviderManager: Added provider ${provider.name}`);
    this.emit('providerAdded', provider);
  }

  /**
   * 更新现有提供商
   */
  private async updateProvider(provider: Provider): Promise<void> {
    this.validateProvider(provider);
    
    const existingProvider = this.providers.get(provider.name);
    if (existingProvider) {
      // 保留状态信息
      provider.status = existingProvider.status;
      provider.errorCount = existingProvider.errorCount;
      provider.lastError = existingProvider.lastError;
    }
    
    this.providers.set(provider.name, provider);
    
    // 如果关键配置发生变化，重新检查健康状态
    if (existingProvider && (
      existingProvider.api_base_url !== provider.api_base_url ||
      existingProvider.api_key !== provider.api_key
    )) {
      await this.checkProviderHealth(provider.name);
    }
    
    log(`ProviderManager: Updated provider ${provider.name}`);
    this.emit('providerUpdated', provider);
  }

  /**
   * 删除提供商
   */
  private removeProvider(name: string): void {
    const provider = this.providers.get(name);
    if (provider) {
      this.providers.delete(name);
      this.healthStatus.delete(name);
      
      log(`ProviderManager: Removed provider ${name}`);
      this.emit('providerRemoved', provider);
    }
  }

  /**
   * 验证提供商配置
   */
  private validateProvider(provider: Provider): void {
    if (!provider.name) {
      throw new Error('Provider name is required');
    }
    
    if (!provider.api_base_url) {
      throw new Error(`Provider ${provider.name}: API base URL is required`);
    }
    
    if (!provider.api_key) {
      throw new Error(`Provider ${provider.name}: API key is required`);
    }
    
    if (!Array.isArray(provider.models) || provider.models.length === 0) {
      throw new Error(`Provider ${provider.name}: At least one model is required`);
    }
    
    // 验证 URL 格式
    try {
      new URL(provider.api_base_url);
    } catch {
      throw new Error(`Provider ${provider.name}: Invalid API base URL format`);
    }
  }

  /**
   * 检查提供商配置是否发生变化
   */
  private hasProviderChanged(existing: Provider, updated: Provider): boolean {
    return (
      existing.api_base_url !== updated.api_base_url ||
      existing.api_key !== updated.api_key ||
      JSON.stringify(existing.models) !== JSON.stringify(updated.models) ||
      JSON.stringify(existing.transformer) !== JSON.stringify(updated.transformer)
    );
  }

  /**
   * 启动健康检查
   */
  public startHealthChecks(): void {
    if (this.healthCheckInterval) {
      return;
    }

    // 立即进行一次健康检查
    this.performHealthCheck();

    // 设置定期健康检查
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck();
    }, this.healthCheckIntervalMs);

    log('ProviderManager: Health checks started');
  }

  /**
   * 停止健康检查
   */
  public stopHealthChecks(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
      log('ProviderManager: Health checks stopped');
    }
  }

  /**
   * 执行所有提供商的健康检查
   */
  private async performHealthCheck(): Promise<void> {
    const checkPromises = Array.from(this.providers.keys()).map(name =>
      this.checkProviderHealth(name).catch(error => {
        log(`ProviderManager: Health check failed for ${name}:`, error);
      })
    );

    await Promise.all(checkPromises);
  }

  /**
   * 检查单个提供商健康状态
   */
  private async checkProviderHealth(providerName: string): Promise<void> {
    const provider = this.providers.get(providerName);
    if (!provider) {
      return;
    }

    const healthStatus = this.healthStatus.get(providerName)!;
    const startTime = Date.now();

    try {
      // 简单的连接性测试 - 使用 Node.js 内置模块替代 fetch
      const url = new URL(provider.api_base_url);
      const isHttps = url.protocol === 'https:';
      
      // 动态导入以避免在CLI环境中出现问题
      const { request } = isHttps ? await import('https') : await import('http');
      
      const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: '/',
        method: 'HEAD',
        timeout: this.healthCheckTimeoutMs,
        headers: {
          'User-Agent': 'claude-code-router/health-check'
        }
      };

      const response = await new Promise<{ statusCode: number; headers: any }>((resolve, reject) => {
        const req = request(options, (res: any) => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers
          });
        });

        req.on('error', (error: any) => {
          // 如果 HEAD 请求失败，尝试 OPTIONS 请求
          const optionsReq = request({
            ...options,
            method: 'OPTIONS'
          }, (res: any) => {
            resolve({
              statusCode: res.statusCode,
              headers: res.headers
            });
          });

          optionsReq.on('error', reject);
          optionsReq.on('timeout', () => {
            optionsReq.destroy();
            reject(new Error('Request timeout'));
          });
          optionsReq.end();
        });

        req.on('timeout', () => {
          req.destroy();
          reject(new Error('Request timeout'));
        });

        req.end();
      });

      const responseTime = Date.now() - startTime;

      if (response.statusCode && (response.statusCode < 300 || response.statusCode < 500)) {
        // 健康
        provider.status = 'active';
        provider.responseTime = responseTime;
        provider.errorCount = 0;
        provider.lastError = undefined;

        healthStatus.status = responseTime > 5000 ? 'degraded' : 'healthy';
        healthStatus.responseTime = responseTime;
        healthStatus.consecutiveFailures = 0;
        healthStatus.errorMessage = undefined;

      } else {
        // 服务器错误
        this.handleProviderError(provider, healthStatus, `HTTP ${response.statusCode}`);
      }

    } catch (error) {
      this.handleProviderError(provider, healthStatus, (error as Error).message);
    }

    healthStatus.lastCheck = Date.now();
    
    // 发出健康状态变化事件
    this.emit('healthStatusChanged', providerName, healthStatus);
  }

  /**
   * 处理提供商错误
   */
  private handleProviderError(
    provider: Provider, 
    healthStatus: ProviderHealthStatus, 
    errorMessage: string
  ): void {
    provider.errorCount = (provider.errorCount || 0) + 1;
    provider.lastError = errorMessage;
    
    healthStatus.consecutiveFailures++;
    healthStatus.errorMessage = errorMessage;

    if (healthStatus.consecutiveFailures >= 3) {
      provider.status = 'failed';
      healthStatus.status = 'failed';
    } else if (healthStatus.consecutiveFailures >= 1) {
      provider.status = 'inactive';
      healthStatus.status = 'degraded';
    }
  }

  /**
   * 获取健康的提供商
   */
  public getHealthyProviders(): Provider[] {
    return Array.from(this.providers.values()).filter(p => p.status === 'active');
  }

  /**
   * 获取指定提供商
   */
  public getProvider(name: string): Provider | undefined {
    return this.providers.get(name);
  }

  /**
   * 获取所有提供商
   */
  public getAllProviders(): Provider[] {
    return Array.from(this.providers.values());
  }

  /**
   * 获取提供商健康状态
   */
  public getProviderHealth(name: string): ProviderHealthStatus | undefined {
    return this.healthStatus.get(name);
  }

  /**
   * 获取所有提供商健康状态
   */
  public getAllHealthStatus(): ProviderHealthStatus[] {
    return Array.from(this.healthStatus.values());
  }

  /**
   * 查找支持指定模型的提供商
   */
  public findProvidersForModel(model: string): Provider[] {
    return Array.from(this.providers.values()).filter(provider =>
      provider.models.includes(model) && provider.status === 'active'
    );
  }

  /**
   * 获取最佳提供商（基于响应时间和健康状态）
   */
  public getBestProvider(excludeProviders: string[] = []): Provider | null {
    const candidates = Array.from(this.providers.values())
      .filter(p => 
        p.status === 'active' && 
        !excludeProviders.includes(p.name)
      )
      .sort((a, b) => {
        // 优先考虑响应时间
        const timeA = a.responseTime || Number.MAX_SAFE_INTEGER;
        const timeB = b.responseTime || Number.MAX_SAFE_INTEGER;
        return timeA - timeB;
      });

    return candidates.length > 0 ? candidates[0] : null;
  }

  /**
   * 获取提供商统计信息
   */
  public getStatistics(): any {
    const providers = Array.from(this.providers.values());
    const healthStatuses = Array.from(this.healthStatus.values());

    return {
      total: providers.length,
      active: providers.filter(p => p.status === 'active').length,
      inactive: providers.filter(p => p.status === 'inactive').length,
      failed: providers.filter(p => p.status === 'failed').length,
      averageResponseTime: this.calculateAverageResponseTime(),
      healthChecksEnabled: !!this.healthCheckInterval,
      lastHealthCheck: Math.max(...healthStatuses.map(s => s.lastCheck), 0)
    };
  }

  /**
   * 计算平均响应时间
   */
  private calculateAverageResponseTime(): number {
    const activProviders = Array.from(this.providers.values())
      .filter(p => p.status === 'active' && p.responseTime);
    
    if (activProviders.length === 0) {
      return 0;
    }

    const total = activProviders.reduce((sum, p) => sum + (p.responseTime || 0), 0);
    return Math.round(total / activProviders.length);
  }

  /**
   * 手动触发提供商健康检查
   */
  public async triggerHealthCheck(providerName?: string): Promise<void> {
    if (providerName) {
      await this.checkProviderHealth(providerName);
    } else {
      await this.performHealthCheck();
    }
  }

  /**
   * 重置提供商错误计数
   */
  public resetProviderErrors(providerName: string): boolean {
    const provider = this.providers.get(providerName);
    const healthStatus = this.healthStatus.get(providerName);
    
    if (provider && healthStatus) {
      provider.errorCount = 0;
      provider.lastError = undefined;
      healthStatus.consecutiveFailures = 0;
      healthStatus.errorMessage = undefined;
      
      log(`ProviderManager: Reset errors for provider ${providerName}`);
      return true;
    }
    
    return false;
  }

  /**
   * 清理资源
   */
  public dispose(): void {
    this.stopHealthChecks();
    this.providers.clear();
    this.healthStatus.clear();
    this.removeAllListeners();
    
    log('ProviderManager: Disposed');
  }
}