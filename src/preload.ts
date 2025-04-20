import { contextBridge, ipcRenderer } from 'electron';

// 实现简单的path工具函数，不依赖Node.js的path模块
const pathUtils = {
  join: (...parts: string[]): string => {
    return parts.join('/').replace(/\\/g, '/').replace(/\/+/g, '/');
  },
  
  dirname: (path: string): string => {
    const parts = path.split(/[\/\\]/);
    parts.pop();
    return parts.join('/') || '.';
  },
  
  basename: (path: string, ext?: string): string => {
    const name = path.split(/[\/\\]/).pop() || '';
    if (!ext) return name;
    const extIndex = name.lastIndexOf(ext);
    return extIndex === -1 ? name : name.substring(0, extIndex);
  },
  
  extname: (path: string): string => {
    const name = path.split(/[\/\\]/).pop() || '';
    const dotIndex = name.lastIndexOf('.');
    return dotIndex === -1 ? '' : name.substring(dotIndex);
  },
  
  resolve: (...parts: string[]): string => {
    let result = '';
    for (const part of parts) {
      if (part.startsWith('/')) {
        result = part;
      } else {
        result = pathUtils.join(result, part);
      }
    }
    return result;
  }
};

// 暴露安全的API给渲染进程
contextBridge.exposeInMainWorld('electron', {
  ipcRenderer: {
    send: (channel: string, ...args: any[]) => {
      ipcRenderer.send(channel, ...args);
    },
    on: (channel: string, listener: (...args: any[]) => void) => {
      ipcRenderer.on(channel, (event, ...args) => listener(...args));
      return () => {
        ipcRenderer.removeListener(channel, listener);
      };
    },
    once: (channel: string, listener: (...args: any[]) => void) => {
      ipcRenderer.once(channel, (event, ...args) => listener(...args));
    },
    removeAllListeners: (channel: string) => {
      ipcRenderer.removeAllListeners(channel);
    }
  },
  path: pathUtils
}); 