const { app, BrowserWindow, ipcMain, safeStorage, Menu } = require("electron");
const fs = require("fs/promises");
const path = require("path");

const AI_CONFIG_FILE = "ai-config.json";
const PROJECT_FILE_EXTENSION = ".json";
const pendingProjectFiles = [];
let mainWindow;
let rendererReady = false;

app.setName("ProtoRoute 3D");

function projectFileFromArgs(args) {
  return args.find((arg) => typeof arg === "string" &&
    path.extname(arg).toLowerCase() === PROJECT_FILE_EXTENSION &&
    !arg.startsWith("--"));
}

function queueProjectFile(filePath) {
  if (!filePath || path.extname(filePath).toLowerCase() !== PROJECT_FILE_EXTENSION) return;
  pendingProjectFiles.push(path.resolve(filePath));
  dispatchProjectFiles();
}

async function dispatchProjectFiles() {
  if (!rendererReady || !mainWindow || mainWindow.isDestroyed()) return;
  while (pendingProjectFiles.length) {
    const filePath = pendingProjectFiles.shift();
    try {
      const content = await fs.readFile(filePath, "utf8");
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("project:open-file", { filePath, content });
      }
    } catch (error) {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("project:open-file-error", {
          filePath,
          message: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  queueProjectFile(projectFileFromArgs(process.argv.slice(1)));
  app.on("second-instance", (_event, argv) => {
    queueProjectFile(projectFileFromArgs(argv.slice(1)));
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
  app.on("open-file", (event, filePath) => {
    event.preventDefault();
    queueProjectFile(filePath);
  });
}

function aiConfigPath() {
  return path.join(app.getPath("userData"), AI_CONFIG_FILE);
}

async function readAiConfig() {
  try {
    const raw = JSON.parse(await fs.readFile(aiConfigPath(), "utf8"));
    let apiKey = "";
    if (raw.encryptedApiKey && safeStorage.isEncryptionAvailable()) {
      apiKey = safeStorage.decryptString(Buffer.from(raw.encryptedApiKey, "base64"));
    }
    return { ...raw, apiKey, encryptedApiKey: undefined, storage: "electron-safe-storage" };
  } catch {
    return undefined;
  }
}

async function writeAiConfig(_event, configuration) {
  const { apiKey = "", ...publicConfiguration } = configuration ?? {};
  const encryptedApiKey = apiKey && safeStorage.isEncryptionAvailable()
    ? safeStorage.encryptString(apiKey).toString("base64")
    : undefined;
  if (apiKey && !encryptedApiKey) {
    throw new Error("当前系统无法安全加密 API Key，配置未保存。");
  }
  await fs.mkdir(app.getPath("userData"), { recursive: true });
  await fs.writeFile(aiConfigPath(), JSON.stringify({ ...publicConfiguration, encryptedApiKey }, null, 2), "utf8");
  return { storage: "electron-safe-storage" };
}

const AI_REQUEST_TIMEOUT_MS = 90_000;

async function requestAiApi(_event, request) {
  // 渲染进程的 AbortController 传不过 IPC，主进程必须自己兜底超时，
  // 否则请求挂住时前端的 instructionRunning 永远不会复位。
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(request.url, {
      method: request.method ?? "POST",
      headers: request.headers,
      body: request.body,
      signal: controller.signal
    });
    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      body: await response.text()
    };
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`AI 请求超过 ${AI_REQUEST_TIMEOUT_MS / 1000} 秒没有响应，已中止。`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    backgroundColor: "#eef2f6",
    icon: path.join(__dirname, "../assets/image1.png"),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.cjs")
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = undefined;
    rendererReady = false;
  });
  mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
}

app.whenReady().then(() => {
  // Hide the default native menu bar (File/Edit/View/Window/Help) so the
  // in-app toolbar row is the first thing at the top of the window.
  Menu.setApplicationMenu(null);
  ipcMain.handle("ai-config:load", readAiConfig);
  ipcMain.handle("ai-config:save", writeAiConfig);
  ipcMain.handle("ai-api:request", requestAiApi);
  ipcMain.on("project:renderer-ready", () => {
    rendererReady = true;
    dispatchProjectFiles();
  });
  if (hasSingleInstanceLock) createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
