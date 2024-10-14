/**
 * Preload script for Electron application.
 *
 * This script uses Electron's contextBridge and ipcRenderer to securely expose
 * APIs to the renderer process.
 *
 * @module preload
 * @requires electron
 */
const { contextBridge, ipcRenderer } = require("electron");

// Expose methods to the renderer
contextBridge.exposeInMainWorld("electronAPI", {
  selectFolder: () => ipcRenderer.invoke("select-folder"),
  scanFolder: (folderPath) => ipcRenderer.invoke("scan-folder", folderPath),
  removeText: (filePath, textToRemove) =>
    ipcRenderer.invoke("remove-text", filePath, textToRemove),
});
