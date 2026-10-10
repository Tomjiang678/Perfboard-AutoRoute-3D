const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("perfboardDesktop", {
  aiConfig: {
    load: () => ipcRenderer.invoke("ai-config:load"),
    save: (configuration) => ipcRenderer.invoke("ai-config:save", configuration)
  },
  aiApi: {
    request: (request) => ipcRenderer.invoke("ai-api:request", request)
  },
  projectFiles: {
    onOpen: (callback) => {
      const listener = (_event, file) => callback(file);
      ipcRenderer.on("project:open-file", listener);
      ipcRenderer.on("project:open-file-error", listener);
      ipcRenderer.send("project:renderer-ready");
      return () => {
        ipcRenderer.removeListener("project:open-file", listener);
        ipcRenderer.removeListener("project:open-file-error", listener);
      };
    }
  }
});
