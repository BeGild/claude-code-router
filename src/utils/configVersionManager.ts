import { createHash } from "crypto";
import { log } from "./log";
import { readConfigFile, writeConfigFile } from "./index";

export interface ConfigVersion {
  id: string;
  version: string;
  timestamp: number;
  checksum: string;
  config: any;
  isActive: boolean;
  source: 'manual' | 'file-watch' | 'api';
  description?: string;
  rollbackSupported: boolean;
}

export interface VersionMetadata {
  totalVersions: number;
  activeVersion: string;
  oldestVersion: string;
  newestVersion: string;
  lastUpdate: number;
}

export class ConfigVersionManager {
  private versions: Map<string, ConfigVersion> = new Map();
  private activeVersionId: string | null = null;
  private readonly maxVersions: number;
  private versionCounter = 1;

  constructor(maxVersions: number = 10) {
    this.maxVersions = maxVersions;
  }

  /**
   * 添加新版本
   */
  public addVersion(
    config: any, 
    source: 'manual' | 'file-watch' | 'api' = 'manual',
    description?: string
  ): ConfigVersion {
    const checksum = this.calculateChecksum(config);
    const timestamp = Date.now();
    const versionString = `v${this.versionCounter}`;
    const id = `${versionString}-${timestamp}`;

    // 检查是否与当前活动版本相同
    if (this.activeVersionId) {
      const activeVersion = this.versions.get(this.activeVersionId);
      if (activeVersion && activeVersion.checksum === checksum) {
        log(`ConfigVersionManager: Configuration unchanged, skipping version creation`);
        return activeVersion;
      }
    }

    const newVersion: ConfigVersion = {
      id,
      version: versionString,
      timestamp,
      checksum,
      config: this.deepClone(config),
      isActive: false,
      source,
      description,
      rollbackSupported: true
    };

    // 停用当前活动版本
    if (this.activeVersionId) {
      const currentActive = this.versions.get(this.activeVersionId);
      if (currentActive) {
        currentActive.isActive = false;
      }
    }

    // 设置新版本为活动版本
    newVersion.isActive = true;
    this.activeVersionId = id;
    this.versions.set(id, newVersion);
    
    this.versionCounter++;

    // 清理旧版本
    this.cleanupOldVersions();

    log(`ConfigVersionManager: Added new configuration version ${versionString} (${id})`);
    return newVersion;
  }

  /**
   * 获取当前活动版本
   */
  public getCurrentVersion(): ConfigVersion | null {
    if (!this.activeVersionId) {
      return null;
    }
    return this.versions.get(this.activeVersionId) || null;
  }

  /**
   * 获取指定版本
   */
  public getVersion(versionId: string): ConfigVersion | null {
    return this.versions.get(versionId) || null;
  }

  /**
   * 获取所有版本
   */
  public getAllVersions(): ConfigVersion[] {
    return Array.from(this.versions.values())
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * 回滚到指定版本
   */
  public async rollbackToVersion(versionId: string): Promise<boolean> {
    const targetVersion = this.versions.get(versionId);
    
    if (!targetVersion) {
      log(`ConfigVersionManager: Version ${versionId} not found for rollback`);
      return false;
    }

    if (!targetVersion.rollbackSupported) {
      log(`ConfigVersionManager: Version ${versionId} does not support rollback`);
      return false;
    }

    try {
      // 创建当前配置的备份版本（标记为回滚前状态）
      const currentVersion = this.getCurrentVersion();
      if (currentVersion) {
        const backupVersion: ConfigVersion = {
          ...currentVersion,
          id: `backup-${Date.now()}`,
          version: `backup-${currentVersion.version}`,
          description: `Backup before rollback to ${targetVersion.version}`,
          source: 'manual',
          isActive: false
        };
        this.versions.set(backupVersion.id, backupVersion);
      }

      // 停用所有版本
      this.versions.forEach(version => {
        version.isActive = false;
      });

      // 激活目标版本
      targetVersion.isActive = true;
      this.activeVersionId = versionId;

      // 写入配置文件
      await writeConfigFile(targetVersion.config);

      log(`ConfigVersionManager: Successfully rolled back to version ${targetVersion.version}`);
      return true;

    } catch (error) {
      log(`ConfigVersionManager: Failed to rollback to version ${versionId}:`, error);
      return false;
    }
  }

  /**
   * 获取版本差异
   */
  public getVersionDiff(fromVersionId: string, toVersionId: string): any {
    const fromVersion = this.versions.get(fromVersionId);
    const toVersion = this.versions.get(toVersionId);

    if (!fromVersion || !toVersion) {
      return null;
    }

    return this.calculateConfigDiff(fromVersion.config, toVersion.config);
  }

  /**
   * 删除版本
   */
  public deleteVersion(versionId: string): boolean {
    const version = this.versions.get(versionId);
    
    if (!version) {
      return false;
    }

    if (version.isActive) {
      log(`ConfigVersionManager: Cannot delete active version ${versionId}`);
      return false;
    }

    this.versions.delete(versionId);
    log(`ConfigVersionManager: Deleted version ${versionId}`);
    return true;
  }

  /**
   * 获取版本元数据
   */
  public getMetadata(): VersionMetadata {
    const versions = this.getAllVersions();
    
    return {
      totalVersions: versions.length,
      activeVersion: this.activeVersionId || 'none',
      oldestVersion: versions.length > 0 ? versions[versions.length - 1].id : 'none',
      newestVersion: versions.length > 0 ? versions[0].id : 'none',
      lastUpdate: versions.length > 0 ? versions[0].timestamp : 0
    };
  }

  /**
   * 从文件系统同步当前配置
   */
  public async syncFromFile(): Promise<ConfigVersion | null> {
    try {
      const currentConfig = await readConfigFile();
      return this.addVersion(currentConfig, 'file-watch', 'Synced from file system');
    } catch (error) {
      log('ConfigVersionManager: Failed to sync from file system:', error);
      return null;
    }
  }

  /**
   * 导出版本历史
   */
  public exportHistory(): any {
    return {
      metadata: this.getMetadata(),
      versions: this.getAllVersions().map(version => ({
        ...version,
        config: version.isActive ? version.config : '[redacted]' // 只导出活动版本的完整配置
      }))
    };
  }

  /**
   * 清理旧版本
   */
  private cleanupOldVersions(): void {
    if (this.versions.size <= this.maxVersions) {
      return;
    }

    const sortedVersions = this.getAllVersions();
    const versionsToRemove = sortedVersions.slice(this.maxVersions);

    versionsToRemove.forEach(version => {
      if (!version.isActive) {
        this.versions.delete(version.id);
        log(`ConfigVersionManager: Cleaned up old version ${version.id}`);
      }
    });
  }

  /**
   * 计算配置校验和
   */
  private calculateChecksum(config: any): string {
    const configString = JSON.stringify(this.sortObjectKeys(config));
    return createHash('sha256').update(configString).digest('hex');
  }

  /**
   * 深度克隆对象
   */
  private deepClone(obj: any): any {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    if (obj instanceof Date) {
      return new Date(obj.getTime());
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.deepClone(item));
    }

    const cloned: any = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        cloned[key] = this.deepClone(obj[key]);
      }
    }

    return cloned;
  }

  /**
   * 排序对象键以确保一致的校验和
   */
  private sortObjectKeys(obj: any): any {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.sortObjectKeys(item));
    }

    const sorted: any = {};
    Object.keys(obj).sort().forEach(key => {
      sorted[key] = this.sortObjectKeys(obj[key]);
    });

    return sorted;
  }

  /**
   * 计算配置差异
   */
  private calculateConfigDiff(oldConfig: any, newConfig: any): any {
    const diff: any = {
      added: {},
      removed: {},
      modified: {},
      unchanged: {}
    };

    // 简化的差异计算 - 可以使用更复杂的库如 deep-diff
    const oldKeys = Object.keys(oldConfig || {});
    const newKeys = Object.keys(newConfig || {});

    // 找出新增的键
    newKeys.filter(key => !oldKeys.includes(key)).forEach(key => {
      diff.added[key] = newConfig[key];
    });

    // 找出删除的键
    oldKeys.filter(key => !newKeys.includes(key)).forEach(key => {
      diff.removed[key] = oldConfig[key];
    });

    // 找出修改的键
    oldKeys.filter(key => newKeys.includes(key)).forEach(key => {
      const oldValue = JSON.stringify(oldConfig[key]);
      const newValue = JSON.stringify(newConfig[key]);
      
      if (oldValue !== newValue) {
        diff.modified[key] = {
          old: oldConfig[key],
          new: newConfig[key]
        };
      } else {
        diff.unchanged[key] = newConfig[key];
      }
    });

    return diff;
  }

  /**
   * 验证版本完整性
   */
  public validateVersionIntegrity(): boolean {
    let isValid = true;
    
    // 检查是否有活动版本
    const activeVersions = Array.from(this.versions.values()).filter(v => v.isActive);
    if (activeVersions.length !== 1) {
      log(`ConfigVersionManager: Invalid active version count: ${activeVersions.length}`);
      isValid = false;
    }

    // 验证校验和
    this.versions.forEach(version => {
      const calculatedChecksum = this.calculateChecksum(version.config);
      if (calculatedChecksum !== version.checksum) {
        log(`ConfigVersionManager: Checksum mismatch for version ${version.id}`);
        isValid = false;
      }
    });

    return isValid;
  }
}