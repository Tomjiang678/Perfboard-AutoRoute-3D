const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("perfboardDesktop", {
  aiConfig: {
    load: () => ipcRenderer.invoke("ai-config:load"),
    save: (configuration) => ipcRenderer.invoke("ai-config:save", configuration)
  },
  aiApi: {
    request: (request) => ipcRenderer.invoke("ai-api:request", request)
  }
});
