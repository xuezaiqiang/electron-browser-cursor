const { app, BrowserWindow, ipcMain, Menu, dialog, shell, session } = require('electron');
const path = require('path');
// 删除原来的导入，改用条件判断
// import isDev from 'electron-is-dev';
const { DownloadHandler } = require('./download-handler');

// 在应用启动前禁用可能导致警告的特性
app.commandLine.appendSwitch('disable-features', 'Autofill,AutofillDrivers');

// 自定义判断是否为开发环境
const isDev = !app.isPackaged;

let mainWindow: import('electron').BrowserWindow | null = null;
let downloadHandler: import('./download-handler').DownloadHandler;

// 处理右键菜单所需的IPC通信
function setupIpcHandlers() {
  // 处理保存页面请求
  ipcMain.handle('save-page', async (event: Electron.IpcMainInvokeEvent, data: { url: string, filename: string }) => {
    if (!mainWindow) return { success: false, error: 'Window not available' };
    
    try {
      // 打开保存对话框
      const { filePath } = await dialog.showSaveDialog(mainWindow, {
        defaultPath: data.filename || 'webpage.html',
        filters: [
          { name: '网页', extensions: ['html', 'htm'] },
          { name: '所有文件', extensions: ['*'] }
        ]
      });
      
      if (!filePath) return { success: false, error: 'User cancelled' };
      
      // 保存页面
      const webContents = event.sender;
      await webContents.savePage(filePath, 'HTMLComplete');
      
      return { success: true, path: filePath };
    } catch (error: any) {
      console.error('保存页面失败:', error);
      return { success: false, error: error.message };
    }
  });
  
  // 处理打印页面请求
  ipcMain.handle('print-page', async (event: Electron.IpcMainInvokeEvent) => {
    try {
      const webContents = event.sender;
      await webContents.print();
      return { success: true };
    } catch (error: any) {
      console.error('打印页面失败:', error);
      return { success: false, error: error.message };
    }
  });
  
  // 处理保存对话框请求
  ipcMain.handle('show-save-dialog', async (event: Electron.IpcMainInvokeEvent, options: Electron.SaveDialogOptions) => {
    if (!mainWindow) return { canceled: true };
    
    try {
      return await dialog.showSaveDialog(mainWindow, options);
    } catch (error: any) {
      console.error('显示保存对话框失败:', error);
      return { canceled: true, error: error.message };
    }
  });
  
  // 剪贴板操作
  ipcMain.on('copy-selection', (event: Electron.IpcMainEvent) => {
    const webContents = event.sender;
    webContents.copy();
  });
  
  ipcMain.on('paste-selection', (event: Electron.IpcMainEvent) => {
    const webContents = event.sender;
    webContents.paste();
  });
  
  ipcMain.on('cut-selection', (event: Electron.IpcMainEvent) => {
    const webContents = event.sender;
    webContents.cut();
  });
  
  ipcMain.on('select-all', (event: Electron.IpcMainEvent) => {
    const webContents = event.sender;
    webContents.selectAll();
  });

  // 处理保存图片请求
  ipcMain.on('save-image', async (event: Electron.IpcMainEvent, data: { url: string, filename: string }) => {
    if (!mainWindow) return;
    
    try {
      // 打开保存对话框
      const { filePath } = await dialog.showSaveDialog(mainWindow, {
        defaultPath: data.filename,
        filters: [
          { name: '图片', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] },
          { name: '所有文件', extensions: ['*'] }
        ]
      });
      
      if (!filePath) return; // 用户取消
      
      // 使用fetch下载图片
      const { net } = require('electron');
      const fs = require('fs');
      
      const request = net.request(data.url);
      request.on('response', (response: Electron.IncomingMessage) => {
        const chunks: Buffer[] = [];
        
        response.on('data', (chunk: Buffer) => {
          chunks.push(Buffer.from(chunk));
        });
        
        response.on('end', () => {
          const buffer = Buffer.concat(chunks);
          fs.writeFile(filePath, buffer, (err: Error) => {
            if (err) {
              console.error('保存图片失败:', err);
              event.sender.send('save-image-result', { success: false, error: err.message });
            } else {
              console.log('图片已保存:', filePath);
              event.sender.send('save-image-result', { success: true, path: filePath });
            }
          });
        });
      });
      
      request.on('error', (error: Error) => {
        console.error('下载图片失败:', error);
        event.sender.send('save-image-result', { success: false, error: error.message });
      });
      
      request.end();
    } catch (error: any) {
      console.error('保存图片失败:', error);
      event.sender.send('save-image-result', { success: false, error: error.message });
    }
  });
}

function createWindow() {
  // 创建浏览器窗口
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: true,
      preload: path.resolve(__dirname, '..', 'preload.js')
    }
  });

  // 加载应用
  const indexUrl = isDev 
    ? 'http://localhost:5173' 
    : `file://${path.join(__dirname, '../index.html')}`;
  
  mainWindow!.loadURL(indexUrl);

  // 设置窗口打开处理器 - 拦截所有 window.open 调用
  mainWindow!.webContents.setWindowOpenHandler((details) => {
    console.log('拦截到窗口打开请求:', details.url);
    
    // 将 URL 发送到渲染进程，在新标签中打开
    if (details.url && details.url !== 'about:blank') {
      mainWindow!.webContents.send('open-url-in-new-tab', details.url);
    }
    
    // 阻止默认行为
    return { action: 'deny' };
  });

  // 打开开发者工具
  if (isDev) {
    // 以非默认方式打开DevTools，减少警告
    mainWindow!.webContents.openDevTools({ mode: 'detach' });
    
    // 设置DevTools打开回调
    mainWindow!.webContents.on('devtools-opened', () => {
      // 发送消息到DevTools控制台，提供解决方案信息
      setTimeout(() => {
        mainWindow!.webContents.devToolsWebContents?.executeJavaScript(`
          console.log("%c可以忽略Autofill相关警告，这些不影响应用程序的功能", "color: green; font-weight: bold");
          
          // 重写console.error以过滤Autofill警告
          const originalConsoleError = console.error;
          console.error = function(...args) {
            const errorMsg = args.join(' ');
            if (errorMsg.includes('Autofill.enable') || errorMsg.includes('Autofill.setAddresses')) {
              // 忽略这些警告
              return;
            }
            return originalConsoleError.apply(this, args);
          };
        `);
      }, 1000);
    });
  }

  // 当窗口关闭时取消引用
  mainWindow!.on('closed', () => {
    mainWindow = null;
  });

  // 初始化下载处理器
  if (!downloadHandler) {
    downloadHandler = new DownloadHandler();
  }
  downloadHandler.registerDownloadHandlers(mainWindow!);
  
  // 初始化IPC处理程序
  setupIpcHandlers();

  // 创建菜单
  const template = [
    {
      label: '文件',
      submenu: [
        {
          label: '新建窗口',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            createWindow();
          }
        },
        {
          label: '新建隐私浏览窗口',
          accelerator: 'CmdOrCtrl+Shift+N',
          click: () => {
            mainWindow!.webContents.send('new-private-tab');
          }
        },
        {
          label: '恢复上次会话',
          click: () => {
            mainWindow!.webContents.send('restore-last-session');
          }
        },
        { type: 'separator' },
        {
          label: '退出',
          accelerator: 'CmdOrCtrl+Q',
          click: () => {
            app.quit();
          }
        }
      ]
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'delete', label: '删除' },
        { type: 'separator' },
        { role: 'selectAll', label: '全选' }
      ]
    },
    {
      label: '视图',
      submenu: [
        { role: 'reload', label: '刷新' },
        { role: 'forceReload', label: '强制刷新' },
        { role: 'toggleDevTools', label: '开发者工具' },
        { type: 'separator' },
        { role: 'resetZoom', label: '重置缩放' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '切换全屏' }
      ]
    },
    {
      label: '历史与书签',
      submenu: [
        {
          label: '查看历史记录',
          accelerator: 'CmdOrCtrl+H',
          click: () => {
            mainWindow!.webContents.send('show-history');
          }
        },
        {
          label: '查看书签',
          accelerator: 'CmdOrCtrl+B',
          click: () => {
            mainWindow!.webContents.send('show-bookmarks');
          }
        },
        { type: 'separator' },
        {
          label: '添加书签',
          accelerator: 'CmdOrCtrl+D',
          click: () => {
            mainWindow!.webContents.send('add-bookmark');
          }
        }
      ]
    },
    {
      label: '下载',
      submenu: [
        {
          label: '查看下载',
          accelerator: 'CmdOrCtrl+J',
          click: () => {
            mainWindow!.webContents.send('show-downloads');
          }
        },
        {
          label: '打开下载文件夹',
          click: () => {
            const downloadsPath = path.join(app.getPath('downloads'), 'electron-browser');
            shell.openPath(downloadsPath);
          }
        }
      ]
    },
    {
      label: '设置',
      submenu: [
        {
          label: '偏好设置',
          accelerator: 'CmdOrCtrl+,',
          click: () => {
            mainWindow!.webContents.send('show-settings');
          }
        }
      ]
    },
    {
      label: '帮助',
      submenu: [
        {
          label: '关于',
          click: () => {
            dialog.showMessageBox(mainWindow!, {
              title: '关于 Electron 浏览器',
              message: 'Electron 浏览器',
              detail: '基于 Electron 和 TypeScript 开发的跨平台浏览器应用。\n版本：1.0.0',
              buttons: ['确定'],
              type: 'info'
            });
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template as any);
  Menu.setApplicationMenu(menu);

  return mainWindow;
}

// 当Electron完成初始化并准备创建浏览器窗口时调用此方法
app.whenReady().then(() => {
  downloadHandler = new DownloadHandler();
  createWindow();

  app.on('activate', () => {
    // 在macOS上，当点击dock图标且没有其他窗口打开时，通常会在应用程序中重新创建一个窗口
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// 除了macOS外，当所有窗口关闭时退出应用
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// 处理webview内容与主进程间的通信
ipcMain.on('open-new-window', (_: Electron.IpcMainEvent, url: string) => {
  console.log('主进程收到打开新窗口请求，URL:', url);
  const win = createWindow();
  // 如果提供了URL，在新窗口加载该URL
  if (url && win) {
    console.log('准备在新窗口加载URL:', url);
    win.webContents.once('did-finish-load', () => {
      console.log('新窗口加载完成，发送load-url事件');
      win.webContents.send('load-url', url);
    });
  }
});

// 在默认浏览器中打开链接
ipcMain.on('open-external-link', (_: Electron.IpcMainEvent, url: string) => {
  shell.openExternal(url);
});

// 打开文件
ipcMain.on('open-file', (_: Electron.IpcMainEvent, filePath: string) => {
  shell.openPath(filePath);
});

// 在文件管理器中显示文件
ipcMain.on('show-item-in-folder', (_: Electron.IpcMainEvent, filePath: string) => {
  shell.showItemInFolder(filePath);
});

// 获取下载路径
ipcMain.on('get-downloads-path', (event: Electron.IpcMainEvent) => {
  const downloadsPath = path.join(app.getPath('downloads'), 'electron-browser');
  event.reply('downloads-path', downloadsPath);
});

// 选择目录
ipcMain.on('select-directory', async (event: Electron.IpcMainEvent) => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory']
  });
  
  if (!result.canceled && result.filePaths.length > 0) {
    event.reply('selected-directory', result.filePaths[0]);
  } else {
    event.reply('selected-directory', '');
  }
});

// 设置下载路径
ipcMain.on('set-download-path', (_: Electron.IpcMainEvent, downloadPath: string) => {
  if (downloadHandler) {
    downloadHandler.setDownloadPath(downloadPath);
  }
});

// 设置代理
ipcMain.on('set-proxy', (_: Electron.IpcMainEvent, config: { server: string, port: number }) => {
  if (mainWindow) {
    const { server, port } = config;
    const proxyUrl = `http://${server}:${port}`;
    
    session.defaultSession.setProxy({
      proxyRules: proxyUrl
    }).then(() => {
      console.log('代理设置成功:', proxyUrl);
    }).catch((err: Error) => {
      console.error('代理设置失败:', err);
    });
  }
});

// 禁用代理
ipcMain.on('disable-proxy', () => {
  session.defaultSession.setProxy({
    proxyRules: ''
  }).then(() => {
    console.log('代理已禁用');
  }).catch((err: Error) => {
    console.error('禁用代理失败:', err);
  });
});

// 设置硬件加速
ipcMain.on('set-hardware-acceleration', (_: Electron.IpcMainEvent, enabled: boolean) => {
  if (!enabled) {
    app.disableHardwareAcceleration();
    console.log('硬件加速已禁用');
  } else {
    console.log('硬件加速已启用（需要重启应用生效）');
  }
}); 