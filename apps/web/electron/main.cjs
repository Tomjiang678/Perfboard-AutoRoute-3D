const { app, BrowserWindow, ipcMain, safeStorage } = require("electron");
const fs = require("fs/promises");
const path = require("path");

const AI_CONFIG_FILE = "ai-config.json";

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

async function requestAiApi(_event, request) {
  const response = await fetch(request.url, {
    method: request.method ?? "POST",
    headers: request.headers,
    body: request.body
  });
  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    body: await response.text()
  };
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    backgroundColor: "#eef2f6",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.cjs")
    }
  });

  win.loadFile(path.join(__dirname, "../dist/index.html"));
}

app.whenReady().then(() => {
  ipcMain.handle("ai-config:load", readAiConfig);
  ipcMain.handle("ai-config:save", writeAiConfig);
  ipcMain.handle("ai-api:request", requestAiApi);
  createWindow();
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
