import { log } from "./log";
import { router as originalRouter } from "./router";
import type { DynamicRouter } from "./dynamicRouter";

// 存储动态路由器实例的全局变量
let globalDynamicRouter: DynamicRouter | null = null;

/**
 * 设置全局动态路由器实例
 */
export const setGlobalDynamicRouter = (router: DynamicRouter | null) => {
  globalDynamicRouter = router;
};

/**
 * 获取全局动态路由器实例
 */
export const getGlobalDynamicRouter = (): DynamicRouter | null => {
  return globalDynamicRouter;
};

/**
 * 动态路由中间件
 * 优先使用动态路由器，如果不可用则回退到原始路由器
 */
export const dynamicRouterMiddleware = async (req: any, res: any, config: any) => {
  try {
    // 获取动态路由器实例
    const dynamicRouter = getGlobalDynamicRouter();
    
    if (dynamicRouter && dynamicRouter.getStatus().isActive) {
      // 使用动态路由器
      await dynamicRouter.route(req, res);
      log('DynamicRouterMiddleware: Routed request using dynamic router');
    } else {
      // 回退到原始路由器
      await originalRouter(req, res, config);
      log('DynamicRouterMiddleware: Routed request using original router (fallback)');
    }
  } catch (error) {
    log('DynamicRouterMiddleware: Error occurred, falling back to original router:', error);
    
    try {
      // 错误时回退到原始路由器
      await originalRouter(req, res, config);
    } catch (fallbackError) {
      log('DynamicRouterMiddleware: Fallback router also failed:', fallbackError);
      
      // 最后的回退：使用默认路由
      if (config.Router?.default) {
        req.body.model = config.Router.default;
      }
    }
  }
};