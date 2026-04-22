// preload.js - Script de preload para segurança
const { contextBridge, ipcRenderer } = require('electron');

// Expor API mínima para fullscreen
contextBridge.exposeInMainWorld('electron', {
	toggleFullscreen: () => ipcRenderer.send('toggle-fullscreen')
});
