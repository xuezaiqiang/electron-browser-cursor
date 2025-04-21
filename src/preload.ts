const { contextBridge, ipcRenderer } = require('electron');

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

// 检查是否为开发环境
const isDevMode = process.env.IS_DEV === 'true' || false;

// 暴露安全的API给渲染进程
contextBridge.exposeInMainWorld('electron', {
  isDev: isDevMode,
  ipcRenderer: {
    send: (channel: string, ...args: any[]): void => {
      ipcRenderer.send(channel, ...args);
    },
    on: (channel: string, listener: (...args: any[]) => void): (() => void) => {
      ipcRenderer.on(channel, (_event: any, ...args: any[]) => listener(...args));
      return () => {
        ipcRenderer.removeListener(channel, listener);
      };
    },
    once: (channel: string, listener: (...args: any[]) => void): void => {
      ipcRenderer.once(channel, (_event: any, ...args: any[]) => listener(...args));
    },
    removeAllListeners: (channel: string): void => {
      ipcRenderer.removeAllListeners(channel);
    },
    // 添加invoke支持，用于需要返回结果的IPC通信
    invoke: (channel: string, ...args: any[]): Promise<any> => {
      return ipcRenderer.invoke(channel, ...args);
    }
  },
  path: pathUtils,
  
  // 添加文件操作相关方法
  dialog: {
    // 保存文件对话框
    showSaveDialog: (options: any): Promise<any> => {
      return ipcRenderer.invoke('show-save-dialog', options);
    }
  },
  
  // 添加网页相关操作
  webContents: {
    savePage: (url: string, filename: string): Promise<any> => {
      return ipcRenderer.invoke('save-page', { url, filename });
    },
    print: (): Promise<any> => {
      return ipcRenderer.invoke('print-page');
    },
    // 剪贴板操作
    copy: (): void => {
      ipcRenderer.send('copy-selection');
    },
    paste: (): void => {
      ipcRenderer.send('paste-selection');
    },
    cut: (): void => {
      ipcRenderer.send('cut-selection');
    },
    selectAll: (): void => {
      ipcRenderer.send('select-all');
    }
  }
}); 