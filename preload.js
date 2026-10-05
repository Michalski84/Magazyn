const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronBridge', {
  getAppDataPath: () => ipcRenderer.sendSync('getAppDataPath'),
  storage: {
    getItem: (key) => ipcRenderer.sendSync('storage:getItem', key) ?? null,
    setItem: (key, value) => ipcRenderer.sendSync('storage:setItem', key, String(value)),
    removeItem: (key) => ipcRenderer.sendSync('storage:removeItem', key),
    clear: () => ipcRenderer.sendSync('storage:clear')
  }
});
