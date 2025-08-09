#!/usr/bin/env node
import './polyfill';
import { run } from "./index";
import { showStatus } from "./utils/status";
import { executeCodeCommand } from "./utils/codeCommand";
import {
  cleanupPidFile,
  isServiceRunning,
  getServiceInfo,
} from "./utils/processCheck";
import { version } from "../package.json";
import { spawn, exec } from "child_process";
import { PID_FILE, REFERENCE_COUNT_FILE } from "./constants";
import fs, { existsSync, readFileSync } from "fs";
import { join } from "path";

const command = process.argv[2];

import { UIEnhancer } from './utils/uiEnhancer'; // 导入 UIEnhancer 类
import { EnhancedRouterCli } from './utils/EnhancedRouterCli'; // 导入新的CLI类

const ui = new UIEnhancer(); // 在此处实例化 uiEnhancer

const HELP_TEXT = `
${ui.createTitle('🚦 Claude Code Router Command Guide', 60)}

${ui.separator('🎯 Quick Commands', 60)}
${ui.createTable([
  [ui.color('Command', 'cyan'), ui.color('Description', 'blue'), ui.color('Example', 'green')],
  ['start', '启动路由服务', 'ccr start'],
  ['stop', '停止路由服务', 'ccr stop'],
  ['restart', '重启路由服务', 'ccr restart'],
  ['status', '查看服务状态', 'ccr status'],
  ['code', '执行Claude指令', 'ccr code "Write a function"'],
  ['ui', '打开Web界面', 'ccr ui'],
  ['router', '管理路由组', 'ccr router'],
  ['-v', '显示版本信息', 'ccr -v'],
  ['-h', '显示帮助信息', 'ccr -h']
], { padding: 1 })}

${ui.separator('🚀 Usage Examples', 60)}
${ui.listItem(ui.color('ccr start', 'green') + ' - 启动Claude Code Router服务')}
${ui.listItem(ui.color('ccr code "optimize this code"', 'cyan') + ' - 通过路由发送Claude请求')}
${ui.listItem(ui.color('ccr status', 'blue') + ' - 查看当前服务运行状态')}
${ui.listItem(ui.color('ccr ui', 'magenta') + ' - 在浏览器中打开Web管理界面')}
${ui.listItem(ui.color('ccr router', 'yellow') + ' - 交互式管理路由组配置')}

${ui.separator('📋 Connection Info', 60)}
${ui.color('✨ 路由器默认运行在', 'gray')} ${ui.color('http://localhost:3456', 'cyan')}
${ui.color('📄 配置文件位于:', 'gray')} ${ui.color('~/.claude-code-router/config.json', 'green')}

${ui.border('└', '─', '┘', 60)}
`;

async function waitForService(
  timeout = 10000,
  initialDelay = 1000
): Promise<boolean> {
  // Wait for an initial period to let the service initialize
  await new Promise((resolve) => setTimeout(resolve, initialDelay));

  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    if (isServiceRunning()) {
      // Wait for an additional short period to ensure service is fully ready
      await new Promise((resolve) => setTimeout(resolve, 500));
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
}

async function handleRouterCommand(): Promise<void> {
  // Check if service is running
  if (!isServiceRunning()) {
    console.log("Service not running. Please start the service first with 'ccr start'");
    console.log("Router group switching requires the service to be running.");
    process.exit(1);
  }

  try {
    // Dynamic import to avoid circular dependencies
    const { getServiceInfo } = await import("./utils/processCheck");
    const { initConfig } = await import("./utils");
    const { getTempAPIKey } = await import("./utils/systemUUID");

    // Get service info
    const serviceInfo = await getServiceInfo();
    
    // Read config to get proper API key, same as start command
    let apiKey = "";
    try {
      const config = await initConfig();
      apiKey = config.APIKEY || "fallback-router-key";
    } catch (error: any) {
      // Fallback to temporary API key only if no config key available
      try {
        apiKey = await getTempAPIKey();
      } catch (uuidError: any) {
        console.warn("Warning: No API key in config and failed to generate temporary API key, using fallback");
        apiKey = "fallback-router-key";
      }
    }

    // Create API-based CLI and run
    const cli = new EnhancedRouterCli(serviceInfo.endpoint, apiKey);
    await cli.run();

  } catch (error: any) {
    console.error("Failed to initialize router group CLI:", error.message);
    process.exit(1);
  }
}

async function main() {
  switch (command) {
    case "start":
      run();
      break;
    case "stop":
      try {
        const pid = parseInt(readFileSync(PID_FILE, "utf-8"));
        process.kill(pid);
        cleanupPidFile();
        if (existsSync(REFERENCE_COUNT_FILE)) {
          try {
            fs.unlinkSync(REFERENCE_COUNT_FILE);
          } catch (e) {
            // Ignore cleanup errors
          }
        }
        console.log(
          "claude code router service has been successfully stopped."
        );
      } catch (e) {
        console.log(
          "Failed to stop the service. It may have already been stopped."
        );
        cleanupPidFile();
      }
      break;
    case "status":
      await showStatus();
      break;
    case "code":
      if (!isServiceRunning()) {
        console.log("Service not running, starting service...");
        const cliPath = join(__dirname, "cli.js");
        const startProcess = spawn("node", [cliPath, "start"], {
          detached: true,
          stdio: "ignore",
        });

        // let errorMessage = "";
        // startProcess.stderr?.on("data", (data) => {
        //   errorMessage += data.toString();
        // });

        startProcess.on("error", (error) => {
          console.error("Failed to start service:", error.message);
          process.exit(1);
        });

        // startProcess.on("close", (code) => {
        //   if (code !== 0 && errorMessage) {
        //     console.error("Failed to start service:", errorMessage.trim());
        //     process.exit(1);
        //   }
        // });

        startProcess.unref();

        if (await waitForService()) {
          // Join all code arguments into a single string to preserve spaces within quotes
          const codeArgs = process.argv.slice(3);
          executeCodeCommand(codeArgs);
        } else {
          console.error(
            "Service startup timeout, please manually run `ccr start` to start the service"
          );
          process.exit(1);
        }
      } else {
        // Join all code arguments into a single string to preserve spaces within quotes
        const codeArgs = process.argv.slice(3);
        executeCodeCommand(codeArgs);
      }
      break;
    case "ui":
      // Check if service is running
      if (!isServiceRunning()) {
        console.log("Service not running, starting service...");
        const cliPath = join(__dirname, "cli.js");
        const startProcess = spawn("node", [cliPath, "start"], {
          detached: true,
          stdio: "ignore",
        });

        startProcess.on("error", (error) => {
          console.error("Failed to start service:", error.message);
          process.exit(1);
        });

        startProcess.unref();

        if (!(await waitForService())) {
          // If service startup fails, try to start with default config
          console.log(
            "Service startup timeout, trying to start with default configuration..."
          );
          const {
            initDir,
            writeConfigFile,
            backupConfigFile,
          } = require("./utils");

          try {
            // Initialize directories
            await initDir();

            // Backup existing config file if it exists
            const backupPath = await backupConfigFile();
            if (backupPath) {
              console.log(
                `Backed up existing configuration file to ${backupPath}`
              );
            }

            // Create a minimal default config file
            await writeConfigFile({
              PORT: 3456,
              Providers: [],
              Router: {},
            });
            console.log(
              "Created minimal default configuration file at ~/.claude-code-router/config.json"
            );
            console.log(
              "Please edit this file with your actual configuration."
            );

            // Try starting the service again
            const restartProcess = spawn("node", [cliPath, "start"], {
              detached: true,
              stdio: "ignore",
            });

            restartProcess.on("error", (error) => {
              console.error(
                "Failed to start service with default config:",
                error.message
              );
              process.exit(1);
            });

            restartProcess.unref();

            if (!(await waitForService(15000))) {
              // Wait a bit longer for the first start
              console.error(
                "Service startup still failing. Please manually run `ccr start` to start the service and check the logs."
              );
              process.exit(1);
            }
          } catch (error: any) {
            console.error(
              "Failed to create default configuration:",
              error.message
            );
            process.exit(1);
          }
        }
      }

      // Get service info and open UI
      const serviceInfo = await getServiceInfo();
      
      // Generate temporary API key based on system UUID or use configured one
      let tempApiKey = "";
      try {
        const { initConfig } = require("./utils");
        const config = await initConfig();
        tempApiKey = config.APIKEY || "ui-fallback-key";
      } catch (error: any) {
        // Fallback to temporary API key only if no config key available
        try {
          const { getTempAPIKey } = require("./utils/systemUUID");
          tempApiKey = await getTempAPIKey();
        } catch (uuidError: any) {
          console.warn("Warning: No API key in config and failed to generate temporary API key, using fallback");
          tempApiKey = "ui-fallback-key";
        }
      }
      
      // Add API key as URL parameter
      const uiUrl = `${serviceInfo.endpoint}/ui/?tempApiKey=${tempApiKey}`;
      
      console.log(`Opening UI at ${uiUrl}`);

      // Open URL in browser based on platform
      const platform = process.platform;
      let openCommand = "";

      if (platform === "win32") {
        // Windows
        openCommand = `start ${uiUrl}`;
      } else if (platform === "darwin") {
        // macOS
        openCommand = `open ${uiUrl}`;
      } else if (platform === "linux") {
        // Linux
        openCommand = `xdg-open ${uiUrl}`;
      } else {
        console.error("Unsupported platform for opening browser");
        process.exit(1);
      }

      exec(openCommand, (error) => {
        if (error) {
          console.error("Failed to open browser:", error.message);
          process.exit(1);
        }
      });
      break;
    case "router":
      await handleRouterCommand();
      break;
    case "-v":
    case "version":
      console.log(`claude-code-router version: ${version}`);
      break;
    case "restart":
      // Stop the service if it's running
      try {
        const pid = parseInt(readFileSync(PID_FILE, "utf-8"));
        process.kill(pid);
        cleanupPidFile();
        if (existsSync(REFERENCE_COUNT_FILE)) {
          try {
            fs.unlinkSync(REFERENCE_COUNT_FILE);
          } catch (e) {
            // Ignore cleanup errors
          }
        }
        console.log("claude code router service has been stopped.");
      } catch (e) {
        console.log("Service was not running or failed to stop.");
        cleanupPidFile();
      }

      // Start the service again in the background
      console.log("Starting claude code router service...");
      const cliPath = join(__dirname, "cli.js");
      const startProcess = spawn("node", [cliPath, "start"], {
        detached: true,
        stdio: "ignore",
      });

      startProcess.on("error", (error) => {
        console.error("Failed to start service:", error);
        process.exit(1);
      });

      startProcess.unref();
      console.log("✅ Service started successfully in the background.");
      break;
    case "-h":
    case "help":
      console.log(HELP_TEXT);
      break;
    default:
      console.log(HELP_TEXT);
      process.exit(1);
  }
}

main().catch(console.error);
