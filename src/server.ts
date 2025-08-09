import Server from "@musistudio/llms";
import { readConfigFile, writeConfigFile } from "./utils";
import { CONFIG_FILE } from "./constants";
import { join } from "path";
import { readFileSync } from "fs";
import fastifyStatic from "@fastify/static";
import { DynamicRouter } from "./utils/dynamicRouter";
import { setGlobalDynamicRouter, getGlobalDynamicRouter } from "./utils/dynamicRouterMiddleware";

// 全局动态路由器实例
let dynamicRouter: DynamicRouter | null = null;

export const createServer = (config: any): Server => {
  const server = new Server(config);

  // 初始化动态路由器
  const initializeDynamicRouter = async () => {
    if (!dynamicRouter) {
      dynamicRouter = new DynamicRouter({
        enableHotReload: true,
        enableValidation: true,
        enableVersioning: true,
        maxVersions: 10,
        customRouterPath: config.CUSTOM_ROUTER_PATH,
        rollbackOnFailure: true
      });

      await dynamicRouter.initialize(config);
      
      // 设置全局动态路由器实例
      setGlobalDynamicRouter(dynamicRouter);
      
      // 监听动态路由器事件
      dynamicRouter.on('configUpdated', (result) => {
        console.log('Dynamic router configuration updated:', result.version?.version);
      });
      
      dynamicRouter.on('error', (error) => {
        console.error('Dynamic router error:', error.message);
      });
    }
    return dynamicRouter;
  };

  // 确保动态路由器已初始化
  initializeDynamicRouter().catch(error => {
    console.error('Failed to initialize dynamic router:', error);
  });

  // Add endpoint to read config.json with access control
  server.app.get("/api/config", async (req, reply) => {
    // Get access level from request (set by auth middleware)
    const accessLevel = (req as any).accessLevel || "restricted";
    
    // If restricted access, return 401
    if (accessLevel === "restricted") {
      reply.status(401).send("API key required to access configuration");
      return;
    }
    
    // For full access (including temp API key), return complete config
    return await readConfigFile();
  });

  server.app.get("/api/transformers", async () => {
    const transformers =
      server.app._server!.transformerService.getAllTransformers();
    const transformerList = Array.from(transformers.entries()).map(
      ([name, transformer]: any) => ({
        name,
        endpoint: transformer.endPoint || null,
      })
    );
    return { transformers: transformerList };
  });

  // Add endpoint to save config.json with access control
  server.app.post("/api/config", async (req, reply) => {
    // Only allow full access users to save config
    const accessLevel = (req as any).accessLevel || "restricted";
    if (accessLevel !== "full") {
      reply.status(403).send("Full access required to modify configuration");
      return;
    }
    
    const newConfig = req.body;
    
    // Backup existing config file if it exists
    const { backupConfigFile } = await import("./utils");
    const backupPath = await backupConfigFile();
    if (backupPath) {
      console.log(`Backed up existing configuration file to ${backupPath}`);
    }
    
    await writeConfigFile(newConfig);
    return { success: true, message: "Config saved successfully" };
  });
  
  // Add endpoint for testing full access without modifying config
  server.app.post("/api/config/test", async (req, reply) => {
    // Only allow full access users to test config access
    const accessLevel = (req as any).accessLevel || "restricted";
    if (accessLevel !== "full") {
      reply.status(403).send("Full access required to test configuration access");
      return;
    }
    
    // Return success without modifying anything
    return { success: true, message: "Access granted" };
  });

  // Dynamic router hot-reload endpoints
  server.app.post("/api/config/hot-reload", async (req, reply) => {
    const accessLevel = (req as any).accessLevel || "restricted";
    if (accessLevel !== "full") {
      reply.status(403).send("Full access required to reload configuration");
      return;
    }

    try {
      const router = getGlobalDynamicRouter() || await initializeDynamicRouter();
      const result = await router.reloadConfiguration();
      
      return {
        success: result.success,
        message: result.success ? "Configuration reloaded successfully" : "Configuration reload failed",
        version: result.version?.version,
        validation: result.validation,
        error: result.error
      };
    } catch (error) {
      reply.status(500).send({
        success: false,
        message: "Configuration reload failed",
        error: (error as Error).message
      });
    }
  });

  server.app.get("/api/config/status", async (req, reply) => {
    const accessLevel = (req as any).accessLevel || "restricted";
    if (accessLevel === "restricted") {
      reply.status(401).send("API key required to access configuration status");
      return;
    }

    try {
      const router = getGlobalDynamicRouter() || await initializeDynamicRouter();
      const status = router.getStatus();
      const versionInfo = router.getVersionInfo();
      
      return {
        status,
        version: versionInfo.current,
        metadata: versionInfo.metadata,
        hotReloadEnabled: true
      };
    } catch (error) {
      reply.status(500).send({
        error: "Failed to get configuration status",
        message: (error as Error).message
      });
    }
  });

  server.app.post("/api/config/validate", async (req, reply) => {
    const accessLevel = (req as any).accessLevel || "restricted";
    if (accessLevel !== "full") {
      reply.status(403).send("Full access required to validate configuration");
      return;
    }

    try {
      const router = getGlobalDynamicRouter() || await initializeDynamicRouter();
      const validation = await router['validator'].validateConfig(req.body);
      
      return {
        success: true,
        validation
      };
    } catch (error) {
      reply.status(500).send({
        success: false,
        error: "Configuration validation failed",
        message: (error as Error).message
      });
    }
  });

  // Router Groups API endpoints
  server.app.get("/api/router-groups", async (req, reply) => {
    try {
      // Check if service is properly initialized
      const router = getGlobalDynamicRouter() || await initializeDynamicRouter();
      
      // Get router groups, handle case where there's no router group manager
      let groups = {};
      let currentGroup = 'default';
      
      if (router && router.getRouterGroups) {
        groups = router.getRouterGroups();
        currentGroup = router.getCurrentRouterGroup();
      }
      
      return {
        success: true,
        groups,
        currentGroup
      };
    } catch (error) {
      reply.status(500).send({
        success: false,
        error: "Failed to get router groups",
        message: (error as Error).message
      });
    }
  });

  server.app.post("/api/router-groups/switch", async (req, reply) => {
    try {
      const { groupId } = req.body;
      if (!groupId) {
        reply.status(400).send({
          success: false,
          error: "Group ID is required"
        });
        return;
      }

      const router = getGlobalDynamicRouter() || await initializeDynamicRouter();
      const success = router.switchRouterGroup(groupId);
      
      if (success) {
        return {
          success: true,
          message: `Successfully switched to router group: ${groupId}`,
          currentGroup: router.getCurrentRouterGroup()
        };
      } else {
        reply.status(400).send({
          success: false,
          error: `Failed to switch to router group: ${groupId}`
        });
      }
    } catch (error) {
      reply.status(500).send({
        success: false,
        error: "Failed to switch router group",
        message: (error as Error).message
      });
    }
  });

  server.app.get("/api/router-groups/:groupId", async (req, reply) => {
    try {
      const { groupId } = req.params as { groupId: string };
      const router = getGlobalDynamicRouter() || await initializeDynamicRouter();
      
      let group = null;
      if (router && router.getRouterGroupManager) {
        const routerGroupManager = router.getRouterGroupManager();
        group = routerGroupManager.getRouterGroup(groupId);
      }
      
      if (!group) {
        reply.status(404).send({
          success: false,
          error: `Router group '${groupId}' not found`
        });
        return;
      }

      return {
        success: true,
        group,
        isActive: groupId === (router ? router.getCurrentRouterGroup() : 'default')
      };
    } catch (error) {
      reply.status(500).send({
        success: false,
        error: "Failed to get router group details",
        message: (error as Error).message
      });
    }
  });

  server.app.post("/api/config/rollback", async (req, reply) => {
    const accessLevel = (req as any).accessLevel || "restricted";
    if (accessLevel !== "full") {
      reply.status(403).send("Full access required to rollback configuration");
      return;
    }

    const { versionId } = req.body;
    if (!versionId) {
      reply.status(400).send("Version ID is required for rollback");
      return;
    }

    try {
      const router = getGlobalDynamicRouter() || await initializeDynamicRouter();
      const success = await router.rollbackToVersion(versionId);
      
      return {
        success,
        message: success ? "Configuration rolled back successfully" : "Configuration rollback failed"
      };
    } catch (error) {
      reply.status(500).send({
        success: false,
        error: "Configuration rollback failed",
        message: (error as Error).message
      });
    }
  });

  server.app.get("/api/config/versions", async (req, reply) => {
    const accessLevel = (req as any).accessLevel || "restricted";
    if (accessLevel === "restricted") {
      reply.status(401).send("API key required to access version history");
      return;
    }

    try {
      const router = getGlobalDynamicRouter() || await initializeDynamicRouter();
      const versionInfo = router.getVersionInfo();
      
      return {
        current: versionInfo.current,
        metadata: versionInfo.metadata,
        versions: versionInfo.all
      };
    } catch (error) {
      reply.status(500).send({
        error: "Failed to get version history",
        message: (error as Error).message
      });
    }
  });

  server.app.get("/api/config/diff/:fromVersion/:toVersion", async (req, reply) => {
    const accessLevel = (req as any).accessLevel || "restricted";
    if (accessLevel === "restricted") {
      reply.status(401).send("API key required to access configuration diff");
      return;
    }

    const { fromVersion, toVersion } = req.params as any;
    
    try {
      const router = getGlobalDynamicRouter() || await initializeDynamicRouter();
      const diff = router['versionManager'].getVersionDiff(fromVersion, toVersion);
      
      if (!diff) {
        reply.status(404).send("One or both versions not found");
        return;
      }
      
      return { diff };
    } catch (error) {
      reply.status(500).send({
        error: "Failed to get configuration diff",
        message: (error as Error).message
      });
    }
  });

  // Add endpoint to restart the service with access control
  server.app.post("/api/restart", async (req, reply) => {
    // Only allow full access users to restart service
    const accessLevel = (req as any).accessLevel || "restricted";
    if (accessLevel !== "full") {
      reply.status(403).send("Full access required to restart service");
      return;
    }
    
    reply.send({ success: true, message: "Service restart initiated" });

    // Restart the service after a short delay to allow response to be sent
    setTimeout(() => {
      const { spawn } = require("child_process");
      spawn(process.execPath, [process.argv[1], "restart"], { detached: true, stdio: "ignore" });
    }, 1000);
  });

  // Register static file serving with caching
  server.app.register(fastifyStatic, {
    root: join(__dirname, "..", "dist"),
    prefix: "/ui/",
    maxAge: "1h",
  });

  // Redirect /ui to /ui/ for proper static file serving
  server.app.get("/ui", async (_, reply) => {
    return reply.redirect("/ui/");
  });

  return server;
};

// 导出动态路由器访问函数（保持向后兼容）
export const getDynamicRouter = (): DynamicRouter | null => {
  return getGlobalDynamicRouter();
};
