const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openDirectory: () => ipcRenderer.invoke('open-directory'),
  analyzeProject: (path) => ipcRenderer.invoke('analyze-project', path),
  openFile: (filePath) => ipcRenderer.invoke('open-file', filePath),
});
