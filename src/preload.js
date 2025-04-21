// 主窗口预加载脚本
const { contextBridge, ipcRenderer, app } = require('electron');

// 检查是否为开发环境
const isDev = process.env.IS_DEV === 'true' || false;

// 向渲染进程暴露 Electron API
contextBridge.exposeInMainWorld('electron', {
  isDev: isDev,
  ipcRenderer: {
    send: (channel, ...args) => {
      ipcRenderer.send(channel, ...args);
    },
    on: (channel, func) => {
      // 包装函数以避免 contextIsolation 问题
      ipcRenderer.on(channel, (event, ...args) => func(...args));
    },
    once: (channel, func) => {
      ipcRenderer.once(channel, (event, ...args) => func(...args));
    },
    removeAllListeners: (channel) => {
      ipcRenderer.removeAllListeners(channel);
    }
  }
}); 