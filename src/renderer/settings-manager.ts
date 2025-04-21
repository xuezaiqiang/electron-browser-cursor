/**
 * 设置管理器
 * 用于管理浏览器的各种设置
 */

// 默认设置
export interface BrowserSettings {
  // 一般设置
  homePage: string;
  startupPage: 'homePage' | 'newTab' | 'continue';
  defaultSearchEngine: string;
  
  // 隐私设置
  clearHistoryOnExit: boolean;
  doNotTrack: boolean;
  blockThirdPartyCookies: boolean;
  
  // 下载设置
  downloadPath: string;
  askWhereToSaveBeforeDownloading: boolean;
  
  // 外观设置
  theme: 'light' | 'dark' | 'system';
  showBookmarksBar: boolean;
  
  // 高级设置
  hardwareAcceleration: boolean;
  proxySettings: {
    enabled: boolean;
    server: string;
    port: number;
  };
  
  // 链接行为
  linkBehavior: 'new-tab' | 'current-tab' | 'new-window';
}

// 默认设置值
const DEFAULT_SETTINGS: BrowserSettings = {
  homePage: 'https://www.baidu.com',
  startupPage: 'homePage',
  defaultSearchEngine: 'baidu',
  
  clearHistoryOnExit: false,
  doNotTrack: false,
  blockThirdPartyCookies: false,
  
  downloadPath: '',  // 将在构造函数中设置
  askWhereToSaveBeforeDownloading: true,
  
  theme: 'system',
  showBookmarksBar: true,
  
  hardwareAcceleration: true,
  proxySettings: {
    enabled: false,
    server: '',
    port: 0
  },
  
  // 链接行为默认设置为在新标签页中打开
  linkBehavior: 'new-tab'
};

export class SettingsManager {
  private static readonly STORAGE_KEY = 'electron-browser-settings';
  private settings: BrowserSettings;
  private listeners: ((settings: BrowserSettings) => void)[] = [];
  
  constructor() {
    // 初始化默认下载路径
    const defaultSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    console.log('默认链接行为设置:', defaultSettings.linkBehavior);
    
    // 尝试从localStorage加载设置
    try {
      const savedSettings = localStorage.getItem(SettingsManager.STORAGE_KEY);
      if (savedSettings) {
        this.settings = { ...defaultSettings, ...JSON.parse(savedSettings) };
      } else {
        this.settings = defaultSettings;
      }
    } catch (error) {
      console.error('加载设置出错:', error);
      this.settings = defaultSettings;
    }
    
    console.log('初始化完成后的链接行为设置:', this.settings.linkBehavior);
    
    // 请求默认下载路径
    this.requestDefaultDownloadPath();
  }
  
  /**
   * 请求默认下载路径
   */
  private requestDefaultDownloadPath(): void {
    const { ipcRenderer } = (window as any).electron || { ipcRenderer: { send: () => {}, once: () => {} } };
    
    ipcRenderer.send('get-downloads-path');
    ipcRenderer.once('downloads-path', (_: any, path: string) => {
      if (path && !this.settings.downloadPath) {
        this.settings.downloadPath = path;
        this.saveSettings();
      }
    });
  }
  
  /**
   * 保存设置到localStorage
   */
  private saveSettings(): void {
    try {
      localStorage.setItem(SettingsManager.STORAGE_KEY, JSON.stringify(this.settings));
      this.notifyListeners();
    } catch (error) {
      console.error('保存设置出错:', error);
    }
  }
  
  /**
   * 获取所有设置
   */
  getSettings(): BrowserSettings {
    console.log('获取设置:', this.settings);
    return { ...this.settings };
  }
  
  /**
   * 更新设置
   */
  updateSettings(newSettings: Partial<BrowserSettings>): void {
    console.log('更新设置:', newSettings);
    
    this.settings = {
      ...this.settings,
      ...newSettings
    };
    
    // 对于嵌套对象，需要单独处理
    if (newSettings.proxySettings) {
      this.settings.proxySettings = {
        ...this.settings.proxySettings,
        ...newSettings.proxySettings
      };
    }
    
    console.log('更新后的设置:', this.settings);
    this.saveSettings();
  }
  
  /**
   * 重置设置为默认值
   */
  resetSettings(): void {
    console.log('重置所有设置到默认值');
    // 清除存储
    try {
      localStorage.removeItem(SettingsManager.STORAGE_KEY);
    } catch (error) {
      console.error('清除设置存储出错:', error);
    }
    
    // 设置为默认值
    this.settings = { ...DEFAULT_SETTINGS };
    console.log('重置后的设置:', this.settings);
    
    // 保存设置
    this.saveSettings();
  }
  
  /**
   * 添加设置变更监听器
   */
  addListener(listener: (settings: BrowserSettings) => void): void {
    this.listeners.push(listener);
  }
  
  /**
   * 移除设置变更监听器
   */
  removeListener(listener: (settings: BrowserSettings) => void): void {
    const index = this.listeners.indexOf(listener);
    if (index !== -1) {
      this.listeners.splice(index, 1);
    }
  }
  
  /**
   * 通知所有监听器
   */
  private notifyListeners(): void {
    const settingsCopy = { ...this.settings };
    this.listeners.forEach(listener => {
      try {
        listener(settingsCopy);
      } catch (error) {
        console.error('设置监听器执行出错:', error);
      }
    });
  }
  
  /**
   * 设置单个配置项
   * @param key 配置项键名
   * @param value 配置项值
   */
  setSetting(key: string, value: any): void {
    // 使用类型断言确保TypeScript不会报错
    (this.settings as any)[key] = value;
    this.saveSettings();
  }
} 