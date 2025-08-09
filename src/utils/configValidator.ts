import { log } from "./log";
import { readFileSync } from "fs";

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  score: number; // 0-100
}

export interface ValidationError {
  type: 'schema' | 'connectivity' | 'security' | 'compatibility';
  field: string;
  message: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  suggestion?: string;
}

export interface ValidationWarning {
  type: 'performance' | 'deprecated' | 'best-practice';
  field: string;
  message: string;
  suggestion?: string;
}

export interface ProviderTestResult {
  name: string;
  endpoint: string;
  isReachable: boolean;
  responseTime?: number;
  error?: string;
  supportedModels?: string[];
}

export class ConfigValidator {
  private requiredFields = ['Providers', 'Router'];
  private requiredProviderFields = ['name', 'api_base_url', 'api_key', 'models'];
  private requiredRouterFields = ['default'];

  /**
   * 验证完整配置
   */
  public async validateConfig(config: any): Promise<ValidationResult> {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      score: 100
    };

    try {
      // 1. 架构验证
      this.validateSchema(config, result);

      // 2. 提供商验证
      await this.validateProviders(config.Providers || [], result);

      // 3. 路由配置验证
      this.validateRouter(config.Router || {}, config.Providers || [], result);

      // // 4. 安全性验证
      // this.validateSecurity(config, result);

      // // 5. 性能验证
      // this.validatePerformance(config, result);

      // 计算最终分数和状态
      this.calculateFinalScore(result);

    } catch (error) {
      result.errors.push({
        type: 'schema',
        field: 'config',
        message: `Configuration validation failed: ${(error as Error).message}`,
        severity: 'critical'
      });
      result.isValid = false;
      result.score = 0;
    }

    return result;
  }

  /**
   * 验证配置文件架构
   */
  private validateSchema(config: any, result: ValidationResult): void {
    if (!config || typeof config !== 'object') {
      result.errors.push({
        type: 'schema',
        field: 'root',
        message: 'Configuration must be a valid object',
        severity: 'critical'
      });
      return;
    }

    // 检查必需字段
    for (const field of this.requiredFields) {
      if (!config[field]) {
        result.errors.push({
          type: 'schema',
          field,
          message: `Required field '${field}' is missing`,
          severity: 'critical',
          suggestion: `Add '${field}' field to your configuration`
        });
      }
    }

    // 验证提供商架构
    if (config.Providers && Array.isArray(config.Providers)) {
      config.Providers.forEach((provider: any, index: number) => {
        this.validateProviderSchema(provider, index, result);
      });
    } else if (config.Providers) {
      result.errors.push({
        type: 'schema',
        field: 'Providers',
        message: 'Providers must be an array',
        severity: 'critical'
      });
    }

    // 验证路由器架构
    if (config.Router && typeof config.Router !== 'object') {
      result.errors.push({
        type: 'schema',
        field: 'Router',
        message: 'Router configuration must be an object',
        severity: 'high'
      });
    }
  }

  /**
   * 验证单个提供商架构
   */
  private validateProviderSchema(provider: any, index: number, result: ValidationResult): void {
    if (!provider || typeof provider !== 'object') {
      result.errors.push({
        type: 'schema',
        field: `Providers[${index}]`,
        message: 'Provider must be a valid object',
        severity: 'critical'
      });
      return;
    }

    for (const field of this.requiredProviderFields) {
      if (!provider[field]) {
        result.errors.push({
          type: 'schema',
          field: `Providers[${index}].${field}`,
          message: `Required provider field '${field}' is missing`,
          severity: 'critical',
          suggestion: `Add '${field}' to provider configuration`
        });
      }
    }

    // 验证模型列表
    if (provider.models && !Array.isArray(provider.models)) {
      result.errors.push({
        type: 'schema',
        field: `Providers[${index}].models`,
        message: 'Provider models must be an array',
        severity: 'high'
      });
    }

    // 验证API URL格式
    if (provider.api_base_url && typeof provider.api_base_url === 'string') {
      try {
        new URL(provider.api_base_url);
      } catch {
        result.errors.push({
          type: 'schema',
          field: `Providers[${index}].api_base_url`,
          message: 'Invalid API base URL format',
          severity: 'high',
          suggestion: 'Ensure URL starts with http:// or https://'
        });
      }
    }
  }

  /**
   * 验证提供商连接性
   */
  private async validateProviders(providers: any[], result: ValidationResult): Promise<void> {
    const testPromises = providers.map((provider, index) => 
      this.testProviderConnectivity(provider, index)
    );

    const testResults = await Promise.allSettled(testPromises);
    
    testResults.forEach((testResult, index) => {
      if (testResult.status === 'rejected') {
        result.errors.push({
          type: 'connectivity',
          field: `Providers[${index}]`,
          message: `Provider connectivity test failed: ${testResult.reason}`,
          severity: 'medium'
        });
      } else if (!testResult.value.isReachable) {
        result.warnings.push({
          type: 'performance',
          field: `Providers[${index}].${testResult.value.name}`,
          message: `Provider "${testResult.value.name}" is not reachable`,
          suggestion: 'Check API endpoint and network connectivity'
        });
      } else if (testResult.value.responseTime && testResult.value.responseTime > 5000) {
        result.warnings.push({
          type: 'performance',
          field: `Providers[${index}].${testResult.value.name}`,
          message: `Provider "${testResult.value.name}" has high latency (${testResult.value.responseTime}ms)`,
          suggestion: 'Consider using a closer endpoint or different provider'
        });
      }
    });
  }

  /**
   * 测试提供商连接性
   */
  private async testProviderConnectivity(provider: any, index: number): Promise<ProviderTestResult> {
    const result: ProviderTestResult = {
      name: provider.name || `Provider[${index}]`,
      endpoint: provider.api_base_url,
      isReachable: false
    };

    try {
      const startTime = Date.now();
      
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
        timeout: 5000,
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

      result.responseTime = Date.now() - startTime;
      result.isReachable = response.statusCode && (response.statusCode < 300 || response.statusCode < 500);
      
    } catch (error) {
      result.error = (error as Error).message;
      result.isReachable = false;
    }

    return result;
  }

  /**
   * 验证路由配置
   */
  private validateRouter(router: any, providers: any[], result: ValidationResult): void {
    // 检查必需的路由字段
    for (const field of this.requiredRouterFields) {
      if (!router[field]) {
        result.errors.push({
          type: 'schema',
          field: `Router.${field}`,
          message: `Required router field '${field}' is missing`,
          severity: 'critical',
          suggestion: `Add '${field}' route configuration`
        });
      }
    }

    // 验证路由引用的提供商和模型是否存在
    const routeFields = ['default', 'background', 'think', 'longContext', 'webSearch'];
    
    routeFields.forEach(routeField => {
      if (router[routeField]) {
        this.validateRouteReference(router[routeField], routeField, providers, result);
      }
    });

    // 验证长上下文阈值
    if (router.longContextThreshold !== undefined) {
      if (typeof router.longContextThreshold !== 'number' || router.longContextThreshold < 0) {
        result.errors.push({
          type: 'schema',
          field: 'Router.longContextThreshold',
          message: 'longContextThreshold must be a positive number',
          severity: 'medium'
        });
      }
    }
  }

  /**
   * 验证路由引用
   */
  private validateRouteReference(route: string, field: string, providers: any[], result: ValidationResult): void {
    if (typeof route !== 'string') {
      result.errors.push({
        type: 'schema',
        field: `Router.${field}`,
        message: 'Route must be a string',
        severity: 'high'
      });
      return;
    }

    if (route.includes(',')) {
      const [providerName, modelName] = route.split(',');
      const provider = providers.find(p => p.name === providerName);
      
      if (!provider) {
        result.errors.push({
          type: 'compatibility',
          field: `Router.${field}`,
          message: `Referenced provider "${providerName}" not found`,
          severity: 'high',
          suggestion: `Add provider "${providerName}" or update route reference`
        });
      } else if (provider.models && !provider.models.includes(modelName)) {
        result.warnings.push({
          type: 'best-practice',
          field: `Router.${field}`,
          message: `Model "${modelName}" not found in provider "${providerName}" model list`,
          suggestion: 'Verify model availability with the provider'
        });
      }
    }
  }

  /**
   * 验证安全性配置
   */
  private validateSecurity(config: any, result: ValidationResult): void {
    // 检查API密钥安全性
    if (config.Providers) {
      config.Providers.forEach((provider: any, index: number) => {
        if (provider.api_key) {
          if (provider.api_key === 'sk-xxx' || provider.api_key === 'your-api-key') {
            result.errors.push({
              type: 'security',
              field: `Providers[${index}].api_key`,
              message: 'Using default/placeholder API key',
              severity: 'critical',
              suggestion: 'Replace with actual API key from provider'
            });
          } else if (provider.api_key.length < 10) {
            result.warnings.push({
              type: 'best-practice',
              field: `Providers[${index}].api_key`,
              message: 'API key appears to be too short',
              suggestion: 'Verify API key is complete and valid'
            });
          }
        }
      });
    }

    // 检查主机安全性
    if (config.HOST === '0.0.0.0') {
      result.warnings.push({
        type: 'best-practice',
        field: 'HOST',
        message: 'Server is binding to all interfaces (0.0.0.0)',
        suggestion: 'Consider binding to localhost or specific interface for security'
      });
    }

    // 检查API密钥配置
    if (config.APIKEY === 'your-secret-key') {
      result.errors.push({
        type: 'security',
        field: 'APIKEY',
        message: 'Using default API key for router access',
        severity: 'high',
        suggestion: 'Set a strong, unique API key for router access'
      });
    }
  }

  /**
   * 验证性能配置
   */
  private validatePerformance(config: any, result: ValidationResult): void {
    // 检查超时配置
    if (config.API_TIMEOUT_MS !== undefined) {
      if (typeof config.API_TIMEOUT_MS !== 'number' || config.API_TIMEOUT_MS < 1000) {
        result.warnings.push({
          type: 'performance',
          field: 'API_TIMEOUT_MS',
          message: 'API timeout is very low, may cause request failures',
          suggestion: 'Consider increasing timeout to at least 30000ms'
        });
      } else if (config.API_TIMEOUT_MS > 600000) {
        result.warnings.push({
          type: 'performance',
          field: 'API_TIMEOUT_MS',
          message: 'API timeout is very high, may cause poor user experience',
          suggestion: 'Consider reducing timeout to improve responsiveness'
        });
      }
    }

    // 检查提供商数量
    if (config.Providers && config.Providers.length === 1) {
      result.warnings.push({
        type: 'best-practice',
        field: 'Providers',
        message: 'Only one provider configured, no failover available',
        suggestion: 'Add backup providers for better reliability'
      });
    }
  }

  /**
   * 计算最终分数
   */
  private calculateFinalScore(result: ValidationResult): void {
    let score = 100;
    
    result.errors.forEach(error => {
      switch (error.severity) {
        case 'critical':
          score -= 25;
          result.isValid = false;
          break;
        case 'high':
          score -= 15;
          break;
        case 'medium':
          score -= 10;
          break;
        case 'low':
          score -= 5;
          break;
      }
    });

    result.warnings.forEach(() => {
      score -= 2;
    });

    result.score = Math.max(0, score);
    
    // 如果有关键错误，配置无效
    if (result.errors.some(e => e.severity === 'critical')) {
      result.isValid = false;
    }
  }

  /**
   * 验证自定义路由文件
   */
  public async validateCustomRouter(filePath: string): Promise<ValidationResult> {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      score: 100
    };

    try {
      // 检查文件是否存在
      const content = readFileSync(filePath, 'utf-8');
      
      // 尝试加载自定义路由
      delete require.cache[require.resolve(filePath)];
      const customRouter = require(filePath);
      
      if (typeof customRouter !== 'function') {
        result.errors.push({
          type: 'schema',
          field: 'customRouter',
          message: 'Custom router must export a function',
          severity: 'critical',
          suggestion: 'Ensure your custom router file exports a function'
        });
        result.isValid = false;
      }

      // 检查语法和基本结构
      if (content.includes('require(') && !content.includes('module.exports')) {
        result.warnings.push({
          type: 'best-practice',
          field: 'customRouter',
          message: 'Custom router should use module.exports',
          suggestion: 'Export your router function using module.exports = function(req, config) {...}'
        });
      }

    } catch (error) {
      result.errors.push({
        type: 'schema',
        field: 'customRouter',
        message: `Custom router validation failed: ${(error as Error).message}`,
        severity: 'critical'
      });
      result.isValid = false;
      result.score = 0;
    }

    this.calculateFinalScore(result);
    return result;
  }
}