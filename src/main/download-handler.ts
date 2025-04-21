import { app, dialog, ipcMain, BrowserWindow, WebContents } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

/**
 * 下载处理器类
 */
export class DownloadHandler {
  private activeDownloads: Map<string, any>;
  private downloadDirectory: string;

  constructor() {
    this.activeDownloads = new Map();
    this.downloadDirectory = path.join(app.getPath('downloads'), 'electron-browser');
    this.ensureDownloadDirectoryExists();
    this.setupIpcHandlers();
  }

  /**
   * 确保下载目录存在
   */
  ensureDownloadDirectoryExists(): void {
    if (!fs.existsSync(this.downloadDirectory)) {
      fs.mkdirSync(this.downloadDirectory, { recursive: true });
    }
  }

  /**
   * 设置IPC处理程序
   */
  setupIpcHandlers(): void {
    // 开始下载
    ipcMain.on('start-download', (event: Electron.IpcMainEvent, downloadInfo: any) => {
      const webContents = event.sender;
      this.startDownload(webContents, downloadInfo);
    });

    // 取消下载
    ipcMain.on('cancel-download', (_: Electron.IpcMainEvent, id: string) => {
      this.cancelDownload(id);
    });

    // 暂停下载（Electron目前不支持暂停下载，所以这里实际上是取消下载）
    ipcMain.on('pause-download', (_: Electron.IpcMainEvent, id: string) => {
      this.cancelDownload(id);
    });

    // 恢复下载（Electron目前不支持恢复下载，所以这里实际上是重新开始下载）
    ipcMain.on('resume-download', (event: Electron.IpcMainEvent, id: string) => {
      const downloadInfo = this.activeDownloads.get(id);
      if (downloadInfo) {
        const webContents = event.sender;
        this.startDownload(webContents, downloadInfo);
      }
    });
  }

  /**
   * 注册下载监听器
   */
  registerDownloadHandlers(window: BrowserWindow): void {
    window.webContents.session.on('will-download', (_: Electron.Event, item: Electron.DownloadItem, webContents: WebContents) => {
      // 获取默认保存路径
      const filePath = path.join(this.downloadDirectory, item.getFilename());
      item.setSavePath(filePath);

      // 生成唯一ID
      const id = Date.now().toString();

      // 创建下载信息
      const downloadInfo = {
        id,
        url: item.getURL(),
        filename: item.getFilename(),
        savePath: filePath,
        item
      };

      // 保存到活动下载映射
      this.activeDownloads.set(id, downloadInfo);

      // 通知渲染进程下载开始
      webContents.send('download-started', {
        id,
        url: item.getURL(),
        filename: item.getFilename(),
        savePath: filePath,
        startTime: Date.now(),
        state: 'in_progress',
        receivedBytes: 0,
        totalBytes: item.getTotalBytes()
      });

      // 更新下载进度
      item.on('updated', (_, state) => {
        if (state === 'progressing') {
          const receivedBytes = item.getReceivedBytes();
          const totalBytes = item.getTotalBytes();
          
          webContents.send('download-progress', id, receivedBytes, totalBytes);
        } else if (state === 'interrupted') {
          webContents.send('download-failed', id, '下载被中断');
          this.activeDownloads.delete(id);
        }
      });

      // 下载完成
      item.once('done', (_, state) => {
        if (state === 'completed') {
          webContents.send('download-completed', id, filePath);
        } else {
          webContents.send('download-failed', id, `下载失败: ${state}`);
        }
        
        this.activeDownloads.delete(id);
      });
    });
  }

  /**
   * 开始下载
   */
  startDownload(webContents: WebContents, downloadInfo: any): void {
    webContents.downloadURL(downloadInfo.url);
  }

  /**
   * 取消下载
   */
  cancelDownload(id: string): void {
    const download = this.activeDownloads.get(id);
    
    if (download && download.item) {
      download.item.cancel();
      this.activeDownloads.delete(id);
    }
  }

  /**
   * 显示保存文件对话框
   */
  async showSaveDialog(window: BrowserWindow, filename: string): Promise<string | null> {
    const { canceled, filePath } = await dialog.showSaveDialog(window, {
      defaultPath: path.join(this.downloadDirectory, filename),
      buttonLabel: '保存'
    });
    
    if (canceled || !filePath) {
      return null;
    }
    
    return filePath;
  }

  /**
   * 设置下载目录路径
   * @param directoryPath 新的下载目录路径
   */
  setDownloadPath(directoryPath: string): void {
    if (directoryPath && directoryPath !== this.downloadDirectory) {
      this.downloadDirectory = directoryPath;
      this.ensureDownloadDirectoryExists();
      console.log('下载目录已更改为:', this.downloadDirectory);
    }
  }

  /**
   * 获取当前下载目录路径
   */
  getDownloadPath(): string {
    return this.downloadDirectory;
  }
} 