// 首先我们需要访问预加载脚本中的ipcRenderer
const electron = (window as any).electron || {
  ipcRenderer: {
    on: () => {},
    send: () => {},
    once: () => {},
    removeAllListeners: () => {}
  }
};

const { ipcRenderer } = electron;

/**
 * 下载项状态
 */
export enum DownloadState {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELED = 'canceled',
  FAILED = 'failed',
  PAUSED = 'paused'
}

/**
 * 下载项数据结构
 */
export interface DownloadItem {
  id: string;
  url: string;
  filename: string;
  savePath: string;
  startTime: number;
  endTime?: number;
  state: DownloadState;
  receivedBytes: number;
  totalBytes: number;
  error?: string;
}

/**
 * 下载管理器类
 */
export class DownloadManager {
  private static readonly STORAGE_KEY = 'electron-browser-downloads';
  private downloads: DownloadItem[] = [];
  private listeners: Map<string, ((item: DownloadItem) => void)[]> = new Map();

  constructor() {
    this.loadDownloads();
    this.setupIpcListeners();
  }

  /**
   * 加载下载记录
   */
  private loadDownloads(): void {
    try {
      const downloadsJson = localStorage.getItem(DownloadManager.STORAGE_KEY);
      if (downloadsJson) {
        this.downloads = JSON.parse(downloadsJson);
      }
    } catch (error) {
      console.error('加载下载记录出错:', error);
      this.downloads = [];
    }
  }

  /**
   * 保存下载记录
   */
  private saveDownloads(): void {
    try {
      localStorage.setItem(DownloadManager.STORAGE_KEY, JSON.stringify(this.downloads));
    } catch (error) {
      console.error('保存下载记录出错:', error);
    }
  }

  /**
   * 设置IPC监听器
   */
  private setupIpcListeners(): void {
    // 下载开始
    ipcRenderer.on('download-started', (_: any, downloadItem: DownloadItem) => {
      this.addOrUpdateDownload(downloadItem);
    });

    // 下载进度更新
    ipcRenderer.on('download-progress', (_: any, id: string, receivedBytes: number, totalBytes: number) => {
      this.updateDownloadProgress(id, receivedBytes, totalBytes);
    });

    // 下载完成
    ipcRenderer.on('download-completed', (_: any, id: string, savePath: string) => {
      this.completeDownload(id, savePath);
    });

    // 下载失败
    ipcRenderer.on('download-failed', (_: any, id: string, error: string) => {
      this.failDownload(id, error);
    });

    // 下载取消
    ipcRenderer.on('download-canceled', (_: any, id: string) => {
      this.cancelDownload(id);
    });
  }

  /**
   * 添加或更新下载项
   */
  private addOrUpdateDownload(item: DownloadItem): void {
    const index = this.downloads.findIndex(d => d.id === item.id);
    
    if (index !== -1) {
      this.downloads[index] = { ...this.downloads[index], ...item };
    } else {
      this.downloads.unshift(item);
    }
    
    this.saveDownloads();
    this.notifyListeners(item);
  }

  /**
   * 更新下载进度
   */
  private updateDownloadProgress(id: string, receivedBytes: number, totalBytes: number): void {
    const index = this.downloads.findIndex(d => d.id === id);
    
    if (index !== -1) {
      this.downloads[index] = {
        ...this.downloads[index],
        receivedBytes,
        totalBytes,
        state: DownloadState.IN_PROGRESS
      };
      
      this.saveDownloads();
      this.notifyListeners(this.downloads[index]);
    }
  }

  /**
   * 完成下载
   */
  private completeDownload(id: string, savePath: string): void {
    const index = this.downloads.findIndex(d => d.id === id);
    
    if (index !== -1) {
      this.downloads[index] = {
        ...this.downloads[index],
        state: DownloadState.COMPLETED,
        endTime: Date.now(),
        savePath
      };
      
      this.saveDownloads();
      this.notifyListeners(this.downloads[index]);
    }
  }

  /**
   * 下载失败
   */
  private failDownload(id: string, error: string): void {
    const index = this.downloads.findIndex(d => d.id === id);
    
    if (index !== -1) {
      this.downloads[index] = {
        ...this.downloads[index],
        state: DownloadState.FAILED,
        error,
        endTime: Date.now()
      };
      
      this.saveDownloads();
      this.notifyListeners(this.downloads[index]);
    }
  }

  /**
   * 取消下载
   */
  cancelDownload(id: string): void {
    const index = this.downloads.findIndex(d => d.id === id);
    
    if (index !== -1) {
      this.downloads[index] = {
        ...this.downloads[index],
        state: DownloadState.CANCELED,
        endTime: Date.now()
      };
      
      // 通知主进程取消下载
      ipcRenderer.send('cancel-download', id);
      
      this.saveDownloads();
      this.notifyListeners(this.downloads[index]);
    }
  }

  /**
   * 暂停下载
   */
  pauseDownload(id: string): void {
    const index = this.downloads.findIndex(d => d.id === id);
    
    if (index !== -1 && this.downloads[index].state === DownloadState.IN_PROGRESS) {
      this.downloads[index] = {
        ...this.downloads[index],
        state: DownloadState.PAUSED
      };
      
      // 通知主进程暂停下载
      ipcRenderer.send('pause-download', id);
      
      this.saveDownloads();
      this.notifyListeners(this.downloads[index]);
    }
  }

  /**
   * 恢复下载
   */
  resumeDownload(id: string): void {
    const index = this.downloads.findIndex(d => d.id === id);
    
    if (index !== -1 && this.downloads[index].state === DownloadState.PAUSED) {
      this.downloads[index] = {
        ...this.downloads[index],
        state: DownloadState.IN_PROGRESS
      };
      
      // 通知主进程恢复下载
      ipcRenderer.send('resume-download', id);
      
      this.saveDownloads();
      this.notifyListeners(this.downloads[index]);
    }
  }

  /**
   * 重试下载
   */
  retryDownload(id: string): void {
    const index = this.downloads.findIndex(d => d.id === id);
    
    if (index !== -1 && (this.downloads[index].state === DownloadState.FAILED || this.downloads[index].state === DownloadState.CANCELED)) {
      const downloadItem = this.downloads[index];
      
      // 创建新的下载项
      const newItem: DownloadItem = {
        id: Date.now().toString(),
        url: downloadItem.url,
        filename: downloadItem.filename,
        savePath: downloadItem.savePath,
        startTime: Date.now(),
        state: DownloadState.PENDING,
        receivedBytes: 0,
        totalBytes: downloadItem.totalBytes
      };
      
      // 通知主进程开始下载
      ipcRenderer.send('start-download', newItem);
      
      this.addOrUpdateDownload(newItem);
    }
  }

  /**
   * 获取所有下载项
   */
  getAllDownloads(): DownloadItem[] {
    return [...this.downloads];
  }

  /**
   * 获取活动的下载项（进行中或暂停的）
   */
  getActiveDownloads(): DownloadItem[] {
    return this.downloads.filter(item => {
      return item.state === DownloadState.IN_PROGRESS || item.state === DownloadState.PAUSED;
    });
  }

  /**
   * 获取已完成的下载项
   */
  getCompletedDownloads(): DownloadItem[] {
    return this.downloads.filter(item => item.state === DownloadState.COMPLETED);
  }

  /**
   * 移除下载记录（不删除文件）
   */
  removeDownloadRecord(id: string): boolean {
    const initialLength = this.downloads.length;
    this.downloads = this.downloads.filter(item => item.id !== id);
    
    if (this.downloads.length !== initialLength) {
      this.saveDownloads();
      return true;
    }
    
    return false;
  }

  /**
   * 清空所有下载记录
   */
  clearAllDownloadRecords(): void {
    this.downloads = [];
    this.saveDownloads();
  }

  /**
   * 开始新下载
   */
  startDownload(url: string, filename: string, savePath: string, callback?: (item: DownloadItem) => void): void {
    const downloadItem: DownloadItem = {
      id: Date.now().toString(),
      url,
      filename,
      savePath,
      startTime: Date.now(),
      state: DownloadState.PENDING,
      receivedBytes: 0,
      totalBytes: 0
    };
    
    // 通知主进程开始下载
    ipcRenderer.send('start-download', downloadItem);
    
    this.addOrUpdateDownload(downloadItem);
    
    if (callback) {
      callback(downloadItem);
    }
  }

  /**
   * 添加下载状态变化监听器
   */
  addDownloadListener(id: string, listener: (item: DownloadItem) => void): void {
    if (!this.listeners.has(id)) {
      this.listeners.set(id, []);
    }
    
    this.listeners.get(id)?.push(listener);
  }

  /**
   * 移除下载状态变化监听器
   */
  removeDownloadListener(id: string, listener: (item: DownloadItem) => void): void {
    if (this.listeners.has(id)) {
      const listeners = this.listeners.get(id) || [];
      const index = listeners.indexOf(listener);
      
      if (index !== -1) {
        listeners.splice(index, 1);
      }
      
      if (listeners.length === 0) {
        this.listeners.delete(id);
      }
    }
  }

  /**
   * 通知下载状态变化
   */
  private notifyListeners(item: DownloadItem): void {
    if (this.listeners.has(item.id)) {
      const listeners = this.listeners.get(item.id) || [];
      
      listeners.forEach(listener => {
        try {
          listener(item);
        } catch (error) {
          console.error('下载监听器回调出错:', error);
        }
      });
    }
  }

  /**
   * 打开已下载的文件
   */
  openDownloadedFile(id: string, callback?: (success: boolean, error?: string) => void): void {
    const downloadItem = this.downloads.find(item => item.id === id);
    
    if (downloadItem && downloadItem.state === DownloadState.COMPLETED) {
      ipcRenderer.send('open-file', downloadItem.savePath);
      
      if (callback) {
        callback(true);
      }
    } else {
      if (callback) {
        callback(false, '文件未完成下载或不存在');
      }
    }
  }
} 