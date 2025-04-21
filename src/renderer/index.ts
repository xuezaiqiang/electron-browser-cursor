// 不要直接导入Electron模块
import './style.css';
import { BookmarkManager } from './bookmark-manager';
import { HistoryManager } from './history-manager';
import { DownloadManager } from './download-manager';
import { SettingsManager } from './settings-manager';
import * as PathHelper from './path-helper';

// 定义WebviewTag接口，替代之前从electron导入的类型
interface WebviewTag extends HTMLElement {
  src: string;
  preload: string;
  nodeintegration: boolean;
  webpreferences: string;
  allowpopups: string;
  useragent: string;
  partition: string;
  disablewebsecurity: boolean;
  nativeWindowOpen: string;
  canGoBack: boolean;
  canGoForward: boolean;
  goBack(): void;
  goForward(): void;
  reload(): void;
  // 添加其他需要的webview属性和方法
}

// 从window对象获取electron预加载脚本的API
const electron = (window as any).electron;
// 使用一个不同的名称避免重复声明
const electronIpc = electron ? electron.ipcRenderer : {
  on: () => {},
  send: () => {},
  invoke: () => Promise.resolve(),
  once: () => {},
  removeAllListeners: () => {}
};

// 将全局node_modules下的path替换为我们的pathHelper
if (typeof window !== 'undefined') {
  (window as any).path = PathHelper;
}

interface Tab {
  id: string;
  title: string;
  url: string;
  isActive: boolean;
  isPrivate?: boolean; // 标记是否为隐私标签页
  groupId?: string; // 标签页所属分组ID
}

// 添加标签页分组接口
interface TabGroup {
  id: string;
  name: string;
  color: string;
  collapsed: boolean;
  tabs: string[]; // 包含的标签页ID数组
}

interface SessionTabGroup {
  id: string;
  name: string;
  color: string;
  collapsed: boolean;
  tabs: string[];
}

interface SessionTab {
  id: string;
  url: string;
  title: string;
  isActive: boolean;
  isPrivate?: boolean;
  groupId?: string;
}

interface SessionData {
  tabs: SessionTab[];
  tabGroups?: SessionTabGroup[];
}

interface MenuItem {
  type?: 'separator';
  text?: string;
  callback?: () => void;
}

interface CustomNewWindowEvent extends Event {
  url: string;
  preventDefault: () => void;
}

// 自定义接口定义
interface BookmarkManagerType {
  // 添加BookmarkManager的必要方法和属性
  getAllBookmarks(): any[];
  addBookmark(title: string, url: string): any;
  removeBookmark(id: string): boolean;
  isBookmarked(url: string): boolean;
  getBookmarkByUrl(url: string): any;
  // 其他需要的方法...
}

interface HistoryManagerType {
  // 添加HistoryManager的必要方法和属性
  addHistoryItem(title: string, url: string, favicon?: string): any;
  getAllHistory(): any[];
  getHistoryGroupedByDate(): any;
  removeHistoryItem(id: string): void;
  clearAllHistory(): void;
  // 其他需要的方法...
}

interface DownloadManagerType {
  // 添加DownloadManager的必要方法和属性
  getAllDownloads(): any[];
  getActiveDownloads(): any[];
  getCompletedDownloads(): any[];
  clearAllDownloadRecords(): void;
  cancelDownload(id: string): void;
  retryDownload(id: string): void;
  resumeDownload(id: string): void;
  removeDownloadRecord(id: string): void;
  // 其他需要的方法...
}

interface SettingsManagerType {
  getSettings(): any;
  updateSettings(settings: any): void;
  resetSettings(): void;
  setSetting(key: string, value: any): void;
  // 其他需要的方法...
}

class BrowserApp {
  private static readonly SESSION_STORAGE_KEY = 'electron-browser-session';
  private tabs: Tab[] = [];
  private tabList: HTMLElement;
  private webviewContainer: HTMLElement;
  private urlInput: HTMLInputElement;
  private currentTabId: string | null = null;
  private tabGroups: Map<string, TabGroup> = new Map(); // 标签分组管理
  
  // 管理器实例
  private bookmarkManager: BookmarkManagerType;
  private historyManager: HistoryManagerType;
  private downloadManager: DownloadManagerType;
  private settingsManager: SettingsManagerType;

  constructor() {
    this.tabList = document.getElementById('tab-list') as HTMLElement;
    this.webviewContainer = document.getElementById('webview-container') as HTMLElement;
    this.urlInput = document.getElementById('url-input') as HTMLInputElement;
    
    // 初始化管理器
    this.bookmarkManager = new BookmarkManager();
    this.historyManager = new HistoryManager();
    this.downloadManager = new DownloadManager();
    this.settingsManager = new SettingsManager();

    this.initEventListeners();
    
    // 恢复会话或根据设置决定启动页
    this.restoreSessionOrCreateNewTab();
    
    // 设置会话保存
    this.setupSessionSaving();
    
    // 强制设置链接行为为新标签页，确保设置正确
    console.log('初始化链接行为设置');
    const settings = this.settingsManager.getSettings();
    settings.linkBehavior = 'new-tab';
    this.settingsManager.setSetting('linkBehavior', 'new-tab');
    console.log('设置链接行为为:', settings.linkBehavior);

    // 监听保存图片结果消息
    electronIpc.on('save-image-result', (result: { success: boolean, path?: string, error?: string }) => {
      if (result.success) {
        this.showNotification('图片已保存');
      } else {
        this.showNotification(`保存图片失败: ${result.error || '未知错误'}`);
      }
    });
  }

  private initEventListeners(): void {
    // 导航按钮事件
    document.getElementById('back-button')?.addEventListener('click', () => this.goBack());
    document.getElementById('forward-button')?.addEventListener('click', () => this.goForward());
    document.getElementById('refresh-button')?.addEventListener('click', () => this.refresh());
    
    // 地址栏事件
    this.urlInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.navigateToUrl();
      }
    });
    document.getElementById('go-button')?.addEventListener('click', () => this.navigateToUrl());
    
    // 标签页操作
    document.getElementById('new-tab-button')?.addEventListener('click', () => this.createNewTab());
    
    // 书签按钮
    document.getElementById('bookmark-button')?.addEventListener('click', () => this.toggleBookmark());
    
    // 隐私浏览按钮
    document.getElementById('private-button')?.addEventListener('click', () => this.createPrivateTab());
    
    // 设置按钮
    document.getElementById('settings-button')?.addEventListener('click', () => this.showSettings());
    
    // 全局错误处理，防止未处理的 Promise 拒绝
    window.addEventListener('unhandledrejection', (event) => {
      console.error('未处理的 Promise 拒绝:', event.reason);
      event.preventDefault();
    });
    
    // 主进程菜单事件监听
    electronIpc.on('show-history', () => this.showHistory());
    electronIpc.on('show-bookmarks', () => this.showBookmarks());
    electronIpc.on('add-bookmark', () => this.addCurrentPageToBookmarks());
    electronIpc.on('show-downloads', () => this.showDownloads());
    electronIpc.on('show-settings', () => this.showSettings());
    electronIpc.on('new-private-tab', () => this.createPrivateTab());
    electronIpc.on('restore-last-session', () => this.restoreSession());
    
    // 处理主进程发送的打开URL请求
    electronIpc.on('open-url-in-new-tab', (_: any, url: string) => {
      console.log('收到在新标签页打开URL请求:', url);
      if (url && typeof url === 'string') {
        this.createNewTab(url);
      }
    });
    
    // 从新窗口加载URL
    electronIpc.on('load-url', (_: any, url: string) => {
      console.log('收到load-url事件，URL:', url);
      if (url) {
        console.log('准备在新标签页中加载URL:', url);
        this.createNewTab(url);
      }
    });
    
    // 设置会话保存
    this.setupSessionSaving();
  }

  private generateTabId(): string {
    return `tab-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  }

  private createNewTab(url: string = 'about:blank', id?: string, title?: string, groupId?: string): void {
    const tabId = id || this.generateTabId();
    
    // 创建标签页
    const tab: Tab = {
      id: tabId,
      title: title || '新标签页',
      url: url,
      isActive: true,
      groupId
    };
    
    // 将所有标签设为非活动状态
    this.tabs.forEach(t => t.isActive = false);
    
    // 添加新标签
    this.tabs.push(tab);
    this.currentTabId = tabId;
    
    // 更新UI
    this.renderTabs();
    this.createWebView(tab);
    this.updateUrlBar(url);
  }

  private renderTabs(): void {
    // 清空标签容器
    this.tabList.innerHTML = '';
    
    // 按分组组织标签
    const groupedTabs: {[key: string]: Tab[]} = {};
    const ungroupedTabs: Tab[] = [];
    
    // 将标签分配到对应的分组
    this.tabs.forEach(tab => {
      if (tab.groupId) {
        if (!groupedTabs[tab.groupId]) {
          groupedTabs[tab.groupId] = [];
        }
        groupedTabs[tab.groupId].push(tab);
      } else {
        ungroupedTabs.push(tab);
      }
    });
    
    // 先渲染分组标签
    for (const [groupId, tabs] of Object.entries(groupedTabs)) {
      const group = this.tabGroups.get(groupId);
      if (!group) continue;
      
      // 创建分组标题
      const groupHeader = document.createElement('div');
      groupHeader.className = 'tab-group-header';
      groupHeader.style.backgroundColor = group.color;
      
      // 添加分组标题和控件
      const groupTitle = document.createElement('div');
      groupTitle.className = 'tab-group-title';
      groupTitle.textContent = group.name;
      
      const groupControls = document.createElement('div');
      groupControls.className = 'tab-group-controls';
      
      const collapseButton = document.createElement('button');
      collapseButton.className = 'tab-group-collapse';
      collapseButton.innerHTML = group.collapsed ? '&#9654;' : '&#9660;'; // 三角形图标
      collapseButton.title = group.collapsed ? '展开分组' : '折叠分组';
      collapseButton.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleGroupCollapse(groupId);
      });
      
      const closeGroupButton = document.createElement('button');
      closeGroupButton.className = 'tab-group-close';
      closeGroupButton.innerHTML = '&times;';
      closeGroupButton.title = '解散分组';
      closeGroupButton.addEventListener('click', (e) => {
        e.stopPropagation();
        // 解散分组（从所有标签中移除分组ID）
        tabs.forEach(tab => {
          this.removeTabFromGroup(tab.id);
        });
      });
      
      groupControls.appendChild(collapseButton);
      groupControls.appendChild(closeGroupButton);
      
      groupHeader.appendChild(groupTitle);
      groupHeader.appendChild(groupControls);
      
      this.tabList.appendChild(groupHeader);
      
      // 如果分组没有折叠，显示分组下的标签
      if (!group.collapsed) {
        const groupContainer = document.createElement('div');
        groupContainer.className = 'tab-group-container';
        groupContainer.dataset.groupId = groupId;
        
        // 渲染分组下的标签
        tabs.forEach((tab, index) => {
          const tabElement = this.createTabElement(tab, this.tabs.indexOf(tab));
          groupContainer.appendChild(tabElement);
        });
        
        this.tabList.appendChild(groupContainer);
      }
    }
    
    // 然后渲染未分组的标签
    ungroupedTabs.forEach((tab, index) => {
      const tabElement = this.createTabElement(tab, this.tabs.indexOf(tab));
      this.tabList.appendChild(tabElement);
    });
    
    // 添加新标签按钮
    const newTabButton = document.getElementById('new-tab-button');
    if (!newTabButton) {
      const addButton = document.createElement('div');
      addButton.id = 'new-tab-button';
      addButton.className = 'new-tab-button';
      addButton.innerHTML = '+';
      addButton.title = '新建标签页';
      addButton.addEventListener('click', () => this.createNewTab());
      this.tabList.appendChild(addButton);
    }
  }

  private createWebView(tab: Tab): void {
    console.log('创建WebView，tab:', tab);
    // 隐藏所有webview
    Array.from(this.webviewContainer.children).forEach(child => {
      (child as HTMLElement).style.display = 'none';
    });
    
    // 查找是否已存在此标签页的webview
    let webview = document.getElementById(`webview-${tab.id}`);
    
    if (!webview) {
      // 创建新webview
      webview = document.createElement('webview') as unknown as WebviewTag;
      webview.id = `webview-${tab.id}`;
      webview.className = 'browser-webview';
      webview.setAttribute('src', tab.url || '');
      webview.setAttribute('partition', 'persist:main');
      
      // 设置更全面的权限配置
      webview.setAttribute('webpreferences', 'contextIsolation=false,nodeIntegration=true,webviewTag=true,enableRemoteModule=true,allowRunningInsecureContent=true');
      
      // 禁用原生窗口打开，我们将用自己的方式处理
      webview.setAttribute('nativeWindowOpen', 'false');
      webview.setAttribute('allowpopups', 'false');
      
      // 如果是隐私标签页，添加相关属性
      if (tab.isPrivate) {
        webview.classList.add('private-webview');
        webview.setAttribute('partition', `private-${tab.id}`);
      }
      
      // 在 DOM Ready 时注入 JavaScript 拦截 window.open
      webview.addEventListener('dom-ready', () => {
        console.log('Webview DOM 已加载，准备注入脚本:', tab.id);
        
        // 使用简单的脚本进行注入，避免任何序列化问题
        const script = `
          // 拦截 window.open
          window.open = function(url) {
            if (url) {
              console.log('OPEN_URL:' + url);
            }
            // 返回一个简单对象
            return {
              closed: false,
              close: function() {}
            };
          };
          
          // 拦截链接点击
          document.addEventListener('click', function(e) {
            var link = e.target;
            while (link && link.tagName !== 'A') {
              link = link.parentElement;
            }
            
            if (link && link.target === '_blank') {
              e.preventDefault();
              console.log('OPEN_URL:' + link.href);
            }
          });
          
          // 确保右键菜单在页面加载后仍能工作
          // 创建全局事件监听器，捕获所有contextmenu事件
          // 使用捕获阶段而不是冒泡阶段，确保先捕获到事件
          document.addEventListener('contextmenu', function(e) {
            // 阻止默认右键菜单和事件传播
            e.preventDefault();
            e.stopPropagation();
            
            console.log('页面内捕获到右键事件:', e.target);
            
            let contextInfo = {
              type: 'default',
              srcUrl: '',
              linkUrl: '',
              linkText: '',
              selectedText: window.getSelection().toString()
            };
            
            // 检查是否点击了图片
            if (e.target.tagName === 'IMG') {
              contextInfo.type = 'image';
              contextInfo.srcUrl = e.target.src;
            }
            
            // 检查是否点击了链接
            let link = e.target;
            while (link && link.tagName !== 'A') {
              link = link.parentElement;
            }
            if (link) {
              contextInfo.type = contextInfo.type === 'image' ? 'imageLink' : 'link';
              contextInfo.linkUrl = link.href;
              contextInfo.linkText = link.textContent || '';
            }
            
            // 发送上下文信息
            console.log('CONTEXT_MENU_INFO:' + JSON.stringify(contextInfo));
            
            // 在这里手动触发一个自定义事件，以便主进程捕获
            var customEvent = new CustomEvent('show-context-menu', {
              bubbles: true,
              cancelable: true,
              detail: {
                pageX: e.pageX,
                pageY: e.pageY,
                clientX: e.clientX,
                clientY: e.clientY,
                contextInfo: contextInfo
              }
            });
            document.dispatchEvent(customEvent);
          }, true); // 使用捕获阶段
          
          // 在document上监听自定义事件，确保事件被传递
          document.addEventListener('show-context-menu', function(e) {
            console.log('自定义右键菜单事件已触发:', e.detail);
          });
          
          console.log('注入脚本已完成');
        `;
        
        // 执行脚本
        try {
          (webview as any).executeJavaScript(script);
        } catch (error) {
          console.error('注入脚本失败:', error);
        }
      });
      
      // 添加右键菜单
      webview.addEventListener('contextmenu', (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('收到webview的右键菜单事件');
        
        // 添加调试信息
        console.log('右键事件详情:', {
          clientX: e.clientX,
          clientY: e.clientY,
          pageX: e.pageX,
          pageY: e.pageY,
          target: e.target
        });
        
        // 直接显示简化版右键菜单
        this.showWebViewContextMenu(tab.id, e);
      });
      
      // 监听webview发出的自定义事件
      webview.addEventListener('ipc-message', (e: any) => {
        if (e.channel === 'context-menu') {
          console.log('收到webview内部发送的context-menu事件:', e.args[0]);
          
          // 创建一个模拟的MouseEvent对象
          const eventData = e.args[0];
          const mouseEvent = {
            preventDefault: () => {},
            stopPropagation: () => {},
            pageX: eventData.pageX || 0,
            pageY: eventData.pageY || 0,
            clientX: eventData.clientX || 0,
            clientY: eventData.clientY || 0,
            target: null
          } as MouseEvent;
          
          // 保存上下文信息
          (webview as any).contextInfo = eventData.contextInfo || {};
          
          // 显示右键菜单
          this.showWebViewContextMenu(tab.id, mouseEvent);
        }
      });
      
      // 设置IPC事件通信
      webview.addEventListener('dom-ready', () => {
        try {
          // 允许webview发送IPC消息
          (webview as any).executeJavaScript(`
            document.addEventListener('show-context-menu', function(e) {
              // 使用内置的ipcRenderer发送消息到主进程
              const detail = e.detail || {};
              if (window.ipcRenderer) {
                window.ipcRenderer.sendToHost('context-menu', detail);
              } else {
                // 回退方案：在控制台打印一个特殊格式的消息
                console.log('CUSTOM_CONTEXT_MENU:' + JSON.stringify(detail));
              }
            });
          `);
        } catch (error) {
          console.error('注入IPC事件脚本失败:', error);
        }
      });
      
      // 监听控制台消息，处理自定义上下文菜单信息
      webview.addEventListener('console-message', (e: any) => {
        const message = e.message || '';
        if (message.startsWith('CUSTOM_CONTEXT_MENU:')) {
          try {
            const detail = JSON.parse(message.substring('CUSTOM_CONTEXT_MENU:'.length));
            console.log('通过控制台消息接收到右键菜单信息:', detail);
            
            // 创建一个模拟的MouseEvent对象
            const mouseEvent = {
              preventDefault: () => {},
              stopPropagation: () => {},
              pageX: detail.pageX || 0,
              pageY: detail.pageY || 0,
              clientX: detail.clientX || 0,
              clientY: detail.clientY || 0,
              target: null
            } as MouseEvent;
            
            // 保存上下文信息
            (webview as any).contextInfo = detail.contextInfo || {};
            
            // 显示右键菜单
            this.showWebViewContextMenu(tab.id, mouseEvent);
          } catch (error) {
            console.error('解析CUSTOM_CONTEXT_MENU信息失败:', error);
          }
        } else if (message.startsWith('OPEN_URL:')) {
          const url = message.substring('OPEN_URL:'.length);
          console.log('收到打开URL请求:', url);
          if (url) {
            this.createNewTab(url);
          }
        } else if (message.startsWith('CONTEXT_MENU_INFO:')) {
          try {
            const contextInfo = JSON.parse(message.substring('CONTEXT_MENU_INFO:'.length));
            // 将上下文信息存储到webview元素上，以便右键菜单使用
            (webview as any).contextInfo = contextInfo;
          } catch (error) {
            console.error('解析上下文信息失败:', error);
          }
        }
      });
      
      // 作为备份，仍然监听 new-window 事件
      webview.addEventListener('new-window', (e: any) => {
        e.preventDefault();
        const url = e.url;
        console.log('拦截到 new-window 事件:', url);
        if (url && url !== 'about:blank') {
          // 根据用户设置决定链接行为
          const settings = this.settingsManager.getSettings();
          console.log('当前链接行为设置:', settings.linkBehavior);
          
          if (settings.linkBehavior === 'new-tab') {
            this.createNewTab(url);
          } else if (settings.linkBehavior === 'current-tab') {
            const currentWebview = this.getCurrentWebview();
            if (currentWebview) {
              currentWebview.src = url;
              // 更新当前标签页的URL
              if (this.currentTabId) {
                this.updateTabUrl(this.currentTabId, url);
              }
            }
          } else if (settings.linkBehavior === 'new-window') {
            // 在新窗口中打开
            electronIpc.send('open-new-window', url);
          }
        }
      });
      
      // 监听webview事件
      webview.addEventListener('page-title-updated', (e: any) => {
        this.updateTabTitle(tab.id, e.title);
      });
      
      webview.addEventListener('did-navigate', (e: any) => {
        this.updateUrlBar(e.url);
        this.updateBookmarkStatus();
        
        // 更新标签页URL
        this.updateTabUrl(tab.id, e.url);
        
        // 添加到历史记录 (除非是隐私标签页)
        const title = this.getTabTitle(tab.id) || '无标题';
        if (!tab.isPrivate) {
          this.historyManager.addHistoryItem(title, e.url);
        }
      });
      
      webview.addEventListener('did-navigate-in-page', (e: any) => {
        this.updateUrlBar(e.url);
        this.updateBookmarkStatus();
      });
      
      // 下载事件处理
      webview.addEventListener('will-download', (e: any) => {
        // 由主进程处理下载
      });
      
      this.webviewContainer.appendChild(webview);
    } else {
      // 显示已存在的webview
      (webview as HTMLElement).style.display = 'flex';
    }
  }

  private activateTab(tabId: string): void {
    // 更新标签状态
    this.tabs.forEach(tab => {
      if (tab.id === tabId) {
        tab.isActive = true;
        this.currentTabId = tabId;
      } else {
        tab.isActive = false;
      }
    });
    
    // 更新UI
    this.renderTabs();
    
    // 显示对应的webview
    const activeTab = this.tabs.find(tab => tab.id === tabId);
    if (activeTab) {
      // 显示对应的webview
      Array.from(this.webviewContainer.children).forEach(child => {
        if (child.id === `webview-${tabId}`) {
          (child as HTMLElement).style.display = 'flex';
          this.updateUrlBar(activeTab.url);
          this.updateBookmarkStatus();
        } else {
          (child as HTMLElement).style.display = 'none';
        }
      });
    }
  }

  private closeTab(tabId: string): void {
    const tabIndex = this.tabs.findIndex(tab => tab.id === tabId);
    if (tabIndex === -1) return;
    
    // 如果关闭的是当前活动标签，则激活下一个标签
    const wasActive = this.tabs[tabIndex].isActive;
    
    // 移除标签
    this.tabs.splice(tabIndex, 1);
    
    // 移除对应的webview
    const webview = document.getElementById(`webview-${tabId}`);
    if (webview) {
      this.webviewContainer.removeChild(webview);
    }
    
    // 如果没有标签了，创建一个新标签
    if (this.tabs.length === 0) {
      this.createNewTab();
      return;
    }
    
    // 如果关闭的是活动标签，激活下一个标签
    if (wasActive) {
      // 优先激活右侧标签，如果没有则激活左侧标签
      const newActiveIndex = Math.min(tabIndex, this.tabs.length - 1);
      this.tabs[newActiveIndex].isActive = true;
      this.currentTabId = this.tabs[newActiveIndex].id;
      this.activateTab(this.currentTabId);
    } else {
      // 如果关闭的不是活动标签，只需要重新渲染
      this.renderTabs();
    }
  }

  private updateTabTitle(tabId: string, title: string): void {
    const tab = this.tabs.find(tab => tab.id === tabId);
    if (tab) {
      tab.title = title;
      this.renderTabs();
    }
  }

  private updateTabUrl(tabId: string, url: string): void {
    const tab = this.tabs.find(tab => tab.id === tabId);
    if (tab) {
      tab.url = url;
    }
  }

  private getTabTitle(tabId: string): string | null {
    const tab = this.tabs.find(tab => tab.id === tabId);
    return tab ? tab.title : null;
  }

  // 添加缺失的createTabElement方法
  private createTabElement(tab: Tab, index: number): HTMLElement {
    const tabElement = document.createElement('div');
    tabElement.className = 'browser-tab';
    tabElement.id = `tab-${tab.id}`;
    tabElement.dataset.tabId = tab.id;
    tabElement.dataset.index = index.toString();
    
    // 设置活动状态
    if (tab.isActive) {
      tabElement.classList.add('active');
    }
    
    // 设置隐私标签样式
    if (tab.isPrivate) {
      tabElement.classList.add('private-tab');
    }
    
    // 添加可拖拽属性
    tabElement.draggable = true;
    tabElement.addEventListener('dragstart', (e) => this.handleDragStart(e, index));
    
    // 标签内容
    const tabContent = document.createElement('div');
    tabContent.className = 'tab-content';
    
    // 图标
    const favicon = document.createElement('div');
    favicon.className = 'tab-favicon';
    if (tab.isPrivate) {
      favicon.innerHTML = '<i class="fas fa-user-secret"></i>';
    } else {
      favicon.innerHTML = '<i class="fas fa-globe"></i>';
    }
    
    // 标题
    const title = document.createElement('div');
    title.className = 'tab-title';
    title.textContent = tab.title || '新标签页';
    title.title = tab.title || '新标签页';
    
    // 关闭按钮
    const closeBtn = document.createElement('div');
    closeBtn.className = 'tab-close';
    closeBtn.innerHTML = '×';
    closeBtn.title = '关闭标签页';
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeTab(tab.id);
    });
    
    // 组装元素
    tabContent.appendChild(favicon);
    tabContent.appendChild(title);
    tabContent.appendChild(closeBtn);
    tabElement.appendChild(tabContent);
    
    // 点击标签激活
    tabElement.addEventListener('click', () => {
      this.activateTab(tab.id);
    });
    
    // 右键菜单
    tabElement.addEventListener('contextmenu', (e) => {
      this.showTabContextMenu(tab.id, e);
    });
    
    return tabElement;
  }

  private updateUrlBar(url: string): void {
    this.urlInput.value = url;
  }

  private navigateToUrl(): void {
    let url = this.urlInput.value.trim();
    
    // 如果没有协议，添加http://
    if (url && !url.startsWith('http://') && !url.startsWith('https://')) {
      // 检查是否是有效域名或IP地址
      if (/^(([a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9\-]*[a-zA-Z0-9])\.)+([A-Za-z]|[A-Za-z][A-Za-z0-9\-]*[A-Za-z0-9])$/.test(url) ||
          /^([0-9]{1,3}\.){3}[0-9]{1,3}$/.test(url)) {
        url = 'http://' + url;
      } else {
        // 否则作为搜索词使用百度搜索
        url = `https://www.baidu.com/s?wd=${encodeURIComponent(url)}`;
      }
    }
    
    if (this.currentTabId) {
      // 更新当前活动标签的URL
      const tab = this.tabs.find(tab => tab.id === this.currentTabId);
      if (tab) {
        tab.url = url;
        
        // 更新webview的URL
        const webview = document.getElementById(`webview-${this.currentTabId}`) as WebviewTag;
        if (webview) {
          webview.src = url;
        }
      }
    }
  }

  // 获取当前webview
  private getCurrentWebview(): WebviewTag | null {
    const activeTab = document.querySelector('.tab.active');
    if (activeTab) {
      const id = activeTab.id;
      // 使用ID选择器查找webview元素
      const webview = document.getElementById(`webview-${id}`);
      if (webview) {
        // 使用unknown作为中间类型安全地进行类型转换
        return webview as unknown as WebviewTag;
      }
    }
    return null;
  }

  private getCurrentUrl(): string {
    const tab = this.tabs.find(tab => tab.id === this.currentTabId);
    return tab ? tab.url : '';
  }

  private getCurrentTitle(): string {
    const tab = this.tabs.find(tab => tab.id === this.currentTabId);
    return tab ? tab.title : '新标签页';
  }

  private goBack(): void {
    const webview = this.getCurrentWebview();
    if (webview && webview.canGoBack) {
      webview.goBack();
    }
  }

  private goForward(): void {
    const webview = this.getCurrentWebview();
    if (webview && webview.canGoForward) {
      webview.goForward();
    }
  }

  private refresh(): void {
    const webview = this.getCurrentWebview();
    if (webview) {
      webview.reload();
    }
  }

  // 书签相关功能
  private updateBookmarkStatus(): void {
    const bookmarkButton = document.getElementById('bookmark-button');
    if (bookmarkButton) {
      const currentUrl = this.getCurrentUrl();
      const isBookmarked = this.bookmarkManager.isBookmarked(currentUrl);
      
      if (isBookmarked) {
        bookmarkButton.classList.add('active');
        bookmarkButton.title = '从书签中删除';
      } else {
        bookmarkButton.classList.remove('active');
        bookmarkButton.title = '添加到书签';
      }
    }
  }

  private toggleBookmark(): void {
    const currentUrl = this.getCurrentUrl();
    const isBookmarked = this.bookmarkManager.isBookmarked(currentUrl);
    
    if (isBookmarked) {
      // 删除书签
      const bookmark = this.bookmarkManager.getBookmarkByUrl(currentUrl);
      if (bookmark) {
        this.bookmarkManager.removeBookmark(bookmark.id);
      }
    } else {
      // 添加书签
      this.addCurrentPageToBookmarks();
    }
    
    this.updateBookmarkStatus();
  }

  private addCurrentPageToBookmarks(): void {
    const url = this.getCurrentUrl();
    const title = this.getCurrentTitle();
    
    if (url && !this.bookmarkManager.isBookmarked(url)) {
      this.bookmarkManager.addBookmark(title, url);
      this.updateBookmarkStatus();
      this.showBookmarkAddedNotification();
    }
  }

  private showBookmarkAddedNotification(): void {
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.textContent = '书签已添加';
    
    document.body.appendChild(notification);
    
    // 2秒后移除通知
    setTimeout(() => {
      document.body.removeChild(notification);
    }, 2000);
  }

  // 显示书签视图
  private showBookmarks(): void {
    // 创建一个新标签页显示书签
    const tabId = this.generateTabId();
    
    // 创建标签页
    const tab: Tab = {
      id: tabId,
      title: '书签',
      url: 'about:bookmarks',
      isActive: true
    };
    
    // 将所有标签设为非活动状态
    this.tabs.forEach(t => t.isActive = false);
    
    // 添加新标签
    this.tabs.push(tab);
    this.currentTabId = tabId;
    
    // 更新UI
    this.renderTabs();
    
    // 创建书签视图
    this.createBookmarksView(tabId);
    this.updateUrlBar('about:bookmarks');
  }

  private createBookmarksView(tabId: string): void {
    // 隐藏所有webview
    Array.from(this.webviewContainer.children).forEach(child => {
      (child as HTMLElement).style.display = 'none';
    });
    
    // 创建书签视图容器
    const container = document.createElement('div');
    container.id = `webview-${tabId}`;
    container.className = 'browser-view bookmarks-view';
    
    // 获取所有书签
    const bookmarks = this.bookmarkManager.getAllBookmarks();
    
    // 创建书签列表
    const bookmarksList = document.createElement('div');
    bookmarksList.className = 'bookmarks-list';
    
    if (bookmarks.length === 0) {
      const emptyMessage = document.createElement('div');
      emptyMessage.className = 'empty-message';
      emptyMessage.textContent = '没有书签';
      bookmarksList.appendChild(emptyMessage);
    } else {
      bookmarks.forEach(bookmark => {
        const bookmarkItem = document.createElement('div');
        bookmarkItem.className = 'bookmark-item';
        
        const title = document.createElement('div');
        title.className = 'bookmark-title';
        title.textContent = bookmark.title;
        
        const url = document.createElement('div');
        url.className = 'bookmark-url';
        url.textContent = bookmark.url;
        
        const actions = document.createElement('div');
        actions.className = 'bookmark-actions';
        
        const openButton = document.createElement('button');
        openButton.textContent = '打开';
        openButton.addEventListener('click', () => {
          this.createNewTab(bookmark.url);
        });
        
        const removeButton = document.createElement('button');
        removeButton.textContent = '删除';
        removeButton.addEventListener('click', () => {
          this.bookmarkManager.removeBookmark(bookmark.id);
          bookmarkItem.remove();
          
          // 如果删除后没有书签了，显示空消息
          if (this.bookmarkManager.getAllBookmarks().length === 0) {
            const emptyMessage = document.createElement('div');
            emptyMessage.className = 'empty-message';
            emptyMessage.textContent = '没有书签';
            bookmarksList.appendChild(emptyMessage);
          }
        });
        
        actions.appendChild(openButton);
        actions.appendChild(removeButton);
        
        bookmarkItem.appendChild(title);
        bookmarkItem.appendChild(url);
        bookmarkItem.appendChild(actions);
        
        bookmarksList.appendChild(bookmarkItem);
      });
    }
    
    // 添加标题
    const header = document.createElement('h2');
    header.textContent = '书签';
    
    container.appendChild(header);
    container.appendChild(bookmarksList);
    
    this.webviewContainer.appendChild(container);
  }

  // 显示历史记录视图
  private showHistory(): void {
    // 创建一个新标签页显示历史记录
    const tabId = this.generateTabId();
    
    // 创建标签页
    const tab: Tab = {
      id: tabId,
      title: '历史记录',
      url: 'about:history',
      isActive: true
    };
    
    // 将所有标签设为非活动状态
    this.tabs.forEach(t => t.isActive = false);
    
    // 添加新标签
    this.tabs.push(tab);
    this.currentTabId = tabId;
    
    // 更新UI
    this.renderTabs();
    
    // 创建历史记录视图
    this.createHistoryView(tabId);
    this.updateUrlBar('about:history');
  }

  private createHistoryView(tabId: string): void {
    // 隐藏所有webview
    Array.from(this.webviewContainer.children).forEach(child => {
      (child as HTMLElement).style.display = 'none';
    });
    
    // 创建历史记录视图容器
    const container = document.createElement('div');
    container.id = `webview-${tabId}`;
    container.className = 'browser-view history-view';
    
    // 获取所有历史记录并按日期分组
    const historyGrouped = this.historyManager.getHistoryGroupedByDate();
    
    // 创建历史记录列表
    const historyList = document.createElement('div');
    historyList.className = 'history-list';
    
    if (Object.keys(historyGrouped).length === 0) {
      const emptyMessage = document.createElement('div');
      emptyMessage.className = 'empty-message';
      emptyMessage.textContent = '没有历史记录';
      historyList.appendChild(emptyMessage);
    } else {
      // 按日期排序（从最近到最早）
      const sortedDates = Object.keys(historyGrouped).sort((a, b) => {
        return new Date(b).getTime() - new Date(a).getTime();
      });
      
      sortedDates.forEach(dateStr => {
        const dateGroup = document.createElement('div');
        dateGroup.className = 'history-date-group';
        
        const dateHeader = document.createElement('h3');
        dateHeader.className = 'history-date';
        
        // 格式化日期显示
        const date = new Date(dateStr);
        const today = new Date();
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        
        let dateDisplay;
        if (date.toDateString() === today.toDateString()) {
          dateDisplay = '今天';
        } else if (date.toDateString() === yesterday.toDateString()) {
          dateDisplay = '昨天';
        } else {
          dateDisplay = date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
        }
        
        dateHeader.textContent = dateDisplay;
        dateGroup.appendChild(dateHeader);
        
        // 添加该日期的历史记录
        historyGrouped[dateStr].forEach((item: {id: string, title: string, url: string, visitTime: number}) => {
          const historyItem = document.createElement('div');
          historyItem.className = 'history-item';
          
          const time = document.createElement('div');
          time.className = 'history-time';
          time.textContent = new Date(item.visitTime).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
          
          const title = document.createElement('div');
          title.className = 'history-title';
          title.textContent = item.title;
          
          const url = document.createElement('div');
          url.className = 'history-url';
          url.textContent = item.url;
          
          const actions = document.createElement('div');
          actions.className = 'history-actions';
          
          const openButton = document.createElement('button');
          openButton.textContent = '打开';
          openButton.addEventListener('click', () => {
            this.createNewTab(item.url);
          });
          
          const removeButton = document.createElement('button');
          removeButton.textContent = '删除';
          removeButton.addEventListener('click', () => {
            this.historyManager.removeHistoryItem(item.id);
            historyItem.remove();
            
            // 如果该日期组下没有记录了，移除整个日期组
            if (dateGroup.querySelectorAll('.history-item').length === 0) {
              dateGroup.remove();
            }
            
            // 如果删除后没有历史记录了，显示空消息
            if (historyList.querySelectorAll('.history-date-group').length === 0) {
              const emptyMessage = document.createElement('div');
              emptyMessage.className = 'empty-message';
              emptyMessage.textContent = '没有历史记录';
              historyList.appendChild(emptyMessage);
            }
          });
          
          actions.appendChild(openButton);
          actions.appendChild(removeButton);
          
          historyItem.appendChild(time);
          historyItem.appendChild(title);
          historyItem.appendChild(url);
          historyItem.appendChild(actions);
          
          dateGroup.appendChild(historyItem);
        });
        
        historyList.appendChild(dateGroup);
      });
    }
    
    // 添加标题和清除按钮
    const headerContainer = document.createElement('div');
    headerContainer.className = 'history-header';
    
    const header = document.createElement('h2');
    header.textContent = '历史记录';
    
    const clearButton = document.createElement('button');
    clearButton.className = 'clear-history-button';
    clearButton.textContent = '清除所有历史记录';
    clearButton.addEventListener('click', () => {
      this.historyManager.clearAllHistory();
      
      // 更新视图
      historyList.innerHTML = '';
      const emptyMessage = document.createElement('div');
      emptyMessage.className = 'empty-message';
      emptyMessage.textContent = '没有历史记录';
      historyList.appendChild(emptyMessage);
    });
    
    headerContainer.appendChild(header);
    headerContainer.appendChild(clearButton);
    
    container.appendChild(headerContainer);
    container.appendChild(historyList);
    
    this.webviewContainer.appendChild(container);
  }

  // 显示下载视图
  private showDownloads(): void {
    // 创建一个新标签页显示下载
    const tabId = this.generateTabId();
    
    // 创建标签页
    const tab: Tab = {
      id: tabId,
      title: '下载',
      url: 'about:downloads',
      isActive: true
    };
    
    // 将所有标签设为非活动状态
    this.tabs.forEach(t => t.isActive = false);
    
    // 添加新标签
    this.tabs.push(tab);
    this.currentTabId = tabId;
    
    // 更新UI
    this.renderTabs();
    
    // 创建下载视图
    this.createDownloadsView(tabId);
    this.updateUrlBar('about:downloads');
  }

  private createDownloadsView(tabId: string): void {
    // 隐藏所有webview
    Array.from(this.webviewContainer.children).forEach(child => {
      (child as HTMLElement).style.display = 'none';
    });
    
    // 创建下载视图容器
    const container = document.createElement('div');
    container.id = `webview-${tabId}`;
    container.className = 'browser-view downloads-view';
    
    // 获取所有下载记录
    const downloads = this.downloadManager.getAllDownloads();
    
    // 创建下载列表
    const downloadsList = document.createElement('div');
    downloadsList.className = 'downloads-list';
    
    if (downloads.length === 0) {
      const emptyMessage = document.createElement('div');
      emptyMessage.className = 'empty-message';
      emptyMessage.textContent = '没有下载记录';
      downloadsList.appendChild(emptyMessage);
    } else {
      // 首先显示活动下载
      const activeDownloads = this.downloadManager.getActiveDownloads();
      if (activeDownloads.length > 0) {
        const activeSection = document.createElement('div');
        activeSection.className = 'downloads-section';
        
        const activeSectionHeader = document.createElement('h3');
        activeSectionHeader.textContent = '正在进行的下载';
        activeSection.appendChild(activeSectionHeader);
        
        activeDownloads.forEach(download => {
          const downloadItem = this.createDownloadItem(download);
          activeSection.appendChild(downloadItem);
        });
        
        downloadsList.appendChild(activeSection);
      }
      
      // 然后显示已完成的下载
      const completedDownloads = this.downloadManager.getCompletedDownloads();
      if (completedDownloads.length > 0) {
        const completedSection = document.createElement('div');
        completedSection.className = 'downloads-section';
        
        const completedSectionHeader = document.createElement('h3');
        completedSectionHeader.textContent = '已完成的下载';
        completedSection.appendChild(completedSectionHeader);
        
        completedDownloads.forEach(download => {
          const downloadItem = this.createDownloadItem(download);
          completedSection.appendChild(downloadItem);
        });
        
        downloadsList.appendChild(completedSection);
      }
      
      // 最后显示其他下载（失败或取消的）
      const otherDownloads = downloads.filter(
        d => !activeDownloads.includes(d) && !completedDownloads.includes(d)
      );
      
      if (otherDownloads.length > 0) {
        const otherSection = document.createElement('div');
        otherSection.className = 'downloads-section';
        
        const otherSectionHeader = document.createElement('h3');
        otherSectionHeader.textContent = '其他下载';
        otherSection.appendChild(otherSectionHeader);
        
        otherDownloads.forEach(download => {
          const downloadItem = this.createDownloadItem(download);
          otherSection.appendChild(downloadItem);
        });
        
        downloadsList.appendChild(otherSection);
      }
    }
    
    // 添加标题和清除按钮
    const headerContainer = document.createElement('div');
    headerContainer.className = 'downloads-header';
    
    const header = document.createElement('h2');
    header.textContent = '下载';
    
    const clearButton = document.createElement('button');
    clearButton.className = 'clear-downloads-button';
    clearButton.textContent = '清除下载记录';
    clearButton.addEventListener('click', () => {
      this.downloadManager.clearAllDownloadRecords();
      
      // 更新视图
      downloadsList.innerHTML = '';
      const emptyMessage = document.createElement('div');
      emptyMessage.className = 'empty-message';
      emptyMessage.textContent = '没有下载记录';
      downloadsList.appendChild(emptyMessage);
    });
    
    headerContainer.appendChild(header);
    headerContainer.appendChild(clearButton);
    
    container.appendChild(headerContainer);
    container.appendChild(downloadsList);
    
    this.webviewContainer.appendChild(container);
  }

  private createDownloadItem(download: any): HTMLElement {
    const downloadItem = document.createElement('div');
    downloadItem.className = 'download-item';
    downloadItem.dataset.id = download.id;
    
    const icon = document.createElement('div');
    icon.className = 'download-icon';
    // 根据文件类型设置图标
    
    const info = document.createElement('div');
    info.className = 'download-info';
    
    const name = document.createElement('div');
    name.className = 'download-name';
    name.textContent = download.filename;
    
    const details = document.createElement('div');
    details.className = 'download-details';
    
    if (download.state === 'in_progress') {
      const progress = document.createElement('progress');
      progress.className = 'download-progress';
      progress.max = download.totalBytes || 100;
      progress.value = download.receivedBytes || 0;
      
      const status = document.createElement('span');
      status.className = 'download-status';
      
      if (download.totalBytes) {
        const percent = Math.round((download.receivedBytes / download.totalBytes) * 100);
        status.textContent = `${this.formatBytes(download.receivedBytes)} / ${this.formatBytes(download.totalBytes)} (${percent}%)`;
      } else {
        status.textContent = `${this.formatBytes(download.receivedBytes)}`;
      }
      
      details.appendChild(progress);
      details.appendChild(status);
    } else if (download.state === 'completed') {
      details.textContent = `已完成 - ${this.formatBytes(download.totalBytes)} - ${this.formatDate(download.endTime)}`;
    } else if (download.state === 'failed') {
      details.textContent = `下载失败 - ${download.error || '未知错误'}`;
    } else if (download.state === 'canceled') {
      details.textContent = '下载已取消';
    } else if (download.state === 'paused') {
      details.textContent = '下载已暂停';
    }
    
    info.appendChild(name);
    info.appendChild(details);
    
    const actions = document.createElement('div');
    actions.className = 'download-actions';
    
    // 根据下载状态添加不同的操作按钮
    if (download.state === 'in_progress') {
      const cancelButton = document.createElement('button');
      cancelButton.textContent = '取消';
      cancelButton.addEventListener('click', () => {
        this.downloadManager.cancelDownload(download.id);
        this.updateDownloadItem(download.id);
      });
      
      actions.appendChild(cancelButton);
    } else if (download.state === 'completed') {
      const openButton = document.createElement('button');
      openButton.textContent = '打开';
      openButton.addEventListener('click', () => {
        // 使用shell.openPath打开文件
        electronIpc.send('open-file', download.savePath);
      });
      
      const showButton = document.createElement('button');
      showButton.textContent = '显示位置';
      showButton.addEventListener('click', () => {
        // 使用shell.showItemInFolder显示文件位置
        electronIpc.send('show-item-in-folder', download.savePath);
      });
      
      actions.appendChild(openButton);
      actions.appendChild(showButton);
    } else if (download.state === 'failed' || download.state === 'canceled') {
      const retryButton = document.createElement('button');
      retryButton.textContent = '重试';
      retryButton.addEventListener('click', () => {
        this.downloadManager.retryDownload(download.id);
        // 由于重试会创建新下载，需要刷新整个下载列表
        this.showDownloads();
      });
      
      actions.appendChild(retryButton);
    } else if (download.state === 'paused') {
      const resumeButton = document.createElement('button');
      resumeButton.textContent = '恢复';
      resumeButton.addEventListener('click', () => {
        this.downloadManager.resumeDownload(download.id);
        this.updateDownloadItem(download.id);
      });
      
      actions.appendChild(resumeButton);
    }
    
    // 添加删除记录按钮
    const removeButton = document.createElement('button');
    removeButton.textContent = '删除';
    removeButton.addEventListener('click', () => {
      this.downloadManager.removeDownloadRecord(download.id);
      downloadItem.remove();
      
      // 检查是否需要显示空消息
      const downloadsList = downloadItem.closest('.downloads-list');
      if (downloadsList && downloadsList.querySelectorAll('.download-item').length === 0) {
        downloadsList.innerHTML = '';
        const emptyMessage = document.createElement('div');
        emptyMessage.className = 'empty-message';
        emptyMessage.textContent = '没有下载记录';
        downloadsList.appendChild(emptyMessage);
      }
    });
    
    actions.appendChild(removeButton);
    
    downloadItem.appendChild(icon);
    downloadItem.appendChild(info);
    downloadItem.appendChild(actions);
    
    return downloadItem;
  }

  private updateDownloadItem(id: string): void {
    // 找到下载项并更新UI
    const downloadElement = document.querySelector(`.download-item[data-id="${id}"]`);
    if (downloadElement) {
      const download = this.downloadManager.getAllDownloads().find(d => d.id === id);
      if (download) {
        const newDownloadElement = this.createDownloadItem(download);
        downloadElement.replaceWith(newDownloadElement);
      }
    }
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    
    return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + ' ' + sizes[i];
  }

  private formatDate(timestamp: number): string {
    const date = new Date(timestamp);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  }

  // 添加设置页面
  private showSettings(): void {
    // 创建一个新标签页显示设置
    const tabId = this.generateTabId();
    
    // 创建标签页
    const tab: Tab = {
      id: tabId,
      title: '设置',
      url: 'about:settings',
      isActive: true
    };
    
    // 将所有标签设为非活动状态
    this.tabs.forEach(t => t.isActive = false);
    
    // 添加新标签
    this.tabs.push(tab);
    this.currentTabId = tabId;
    
    // 更新UI
    this.renderTabs();
    
    // 创建设置视图
    this.createSettingsView(tabId);
    this.updateUrlBar('about:settings');
  }

  private createSettingsView(tabId: string): void {
    // 隐藏所有webview
    Array.from(this.webviewContainer.children).forEach(child => {
      (child as HTMLElement).style.display = 'none';
    });
    
    // 创建设置视图容器
    const container = document.createElement('div');
    container.id = `webview-${tabId}`;
    container.className = 'browser-view settings-view';
    
    // 获取当前设置
    const settings = this.settingsManager.getSettings();
    
    // 添加标题
    const header = document.createElement('h2');
    header.textContent = '浏览器设置';
    container.appendChild(header);
    
    // 创建设置表单
    const form = document.createElement('form');
    form.className = 'settings-form';
    
    // 一般设置部分
    this.addSettingsSection(form, '一般设置', [
      {
        type: 'text',
        id: 'homePage',
        label: '主页',
        value: settings.homePage
      },
      {
        type: 'select',
        id: 'startupPage',
        label: '启动时',
        value: settings.startupPage,
        options: [
          { value: 'homePage', label: '打开主页' },
          { value: 'newTab', label: '打开新标签页' },
          { value: 'continue', label: '继续上次会话' }
        ]
      },
      {
        type: 'select',
        id: 'defaultSearchEngine',
        label: '默认搜索引擎',
        value: settings.defaultSearchEngine,
        options: [
          { value: 'baidu', label: '百度' },
          { value: 'bing', label: 'Bing' },
          { value: 'google', label: 'Google' }
        ]
      }
    ]);
    
    // 隐私设置部分
    this.addSettingsSection(form, '隐私设置', [
      {
        type: 'checkbox',
        id: 'clearHistoryOnExit',
        label: '退出时清除历史记录',
        checked: settings.clearHistoryOnExit
      },
      {
        type: 'checkbox',
        id: 'doNotTrack',
        label: '向网站发送"请勿跟踪"请求',
        checked: settings.doNotTrack
      },
      {
        type: 'checkbox',
        id: 'blockThirdPartyCookies',
        label: '阻止第三方Cookie',
        checked: settings.blockThirdPartyCookies
      }
    ]);
    
    // 下载设置部分
    this.addSettingsSection(form, '下载设置', [
      {
        type: 'path',
        id: 'downloadPath',
        label: '下载位置',
        value: settings.downloadPath,
        buttonText: '浏览...'
      },
      {
        type: 'checkbox',
        id: 'askWhereToSaveBeforeDownloading',
        label: '下载前询问保存位置',
        checked: settings.askWhereToSaveBeforeDownloading
      }
    ]);
    
    // 外观设置部分
    this.addSettingsSection(form, '外观设置', [
      {
        type: 'select',
        id: 'theme',
        label: '主题',
        value: settings.theme,
        options: [
          { value: 'light', label: '浅色' },
          { value: 'dark', label: '深色' },
          { value: 'system', label: '跟随系统' }
        ]
      },
      {
        type: 'checkbox',
        id: 'showBookmarksBar',
        label: '显示书签栏',
        checked: settings.showBookmarksBar
      }
    ]);
    
    // 链接行为设置
    this.addSettingsSection(form, '链接行为', [
      {
        type: 'select',
        id: 'linkBehavior',
        label: '点击链接时',
        value: settings.linkBehavior,
        options: [
          { value: 'new-tab', label: '在新标签页中打开' },
          { value: 'current-tab', label: '在当前页面打开' },
          { value: 'new-window', label: '在新窗口中打开' }
        ]
      }
    ]);
    
    // 高级设置部分
    this.addSettingsSection(form, '高级设置', [
      {
        type: 'checkbox',
        id: 'hardwareAcceleration',
        label: '使用硬件加速',
        checked: settings.hardwareAcceleration
      }
    ]);
    
    // 代理设置
    const proxySection = document.createElement('div');
    proxySection.className = 'proxy-settings';
    
    const proxyEnabled = document.createElement('div');
    proxyEnabled.className = 'setting-item';
    
    const proxyEnabledCheckbox = document.createElement('input');
    proxyEnabledCheckbox.type = 'checkbox';
    proxyEnabledCheckbox.id = 'proxyEnabled';
    proxyEnabledCheckbox.checked = settings.proxySettings.enabled;
    
    const proxyEnabledLabel = document.createElement('label');
    proxyEnabledLabel.htmlFor = 'proxyEnabled';
    proxyEnabledLabel.textContent = '使用代理服务器';
    
    proxyEnabled.appendChild(proxyEnabledCheckbox);
    proxyEnabled.appendChild(proxyEnabledLabel);
    
    const proxyDetails = document.createElement('div');
    proxyDetails.className = 'proxy-details';
    proxyDetails.style.display = settings.proxySettings.enabled ? 'block' : 'none';
    
    const proxyServer = document.createElement('div');
    proxyServer.className = 'setting-item';
    
    const proxyServerLabel = document.createElement('label');
    proxyServerLabel.htmlFor = 'proxyServer';
    proxyServerLabel.textContent = '服务器';
    
    const proxyServerInput = document.createElement('input');
    proxyServerInput.type = 'text';
    proxyServerInput.id = 'proxyServer';
    proxyServerInput.value = settings.proxySettings.server;
    
    proxyServer.appendChild(proxyServerLabel);
    proxyServer.appendChild(proxyServerInput);
    
    const proxyPort = document.createElement('div');
    proxyPort.className = 'setting-item';
    
    const proxyPortLabel = document.createElement('label');
    proxyPortLabel.htmlFor = 'proxyPort';
    proxyPortLabel.textContent = '端口';
    
    const proxyPortInput = document.createElement('input');
    proxyPortInput.type = 'number';
    proxyPortInput.id = 'proxyPort';
    proxyPortInput.value = settings.proxySettings.port.toString();
    
    proxyPort.appendChild(proxyPortLabel);
    proxyPort.appendChild(proxyPortInput);
    
    proxyDetails.appendChild(proxyServer);
    proxyDetails.appendChild(proxyPort);
    
    proxyEnabledCheckbox.addEventListener('change', () => {
      proxyDetails.style.display = proxyEnabledCheckbox.checked ? 'block' : 'none';
    });
    
    proxySection.appendChild(proxyEnabled);
    proxySection.appendChild(proxyDetails);
    
    const proxySettingsSection = document.createElement('div');
    proxySettingsSection.className = 'settings-section';
    
    const proxySettingsSectionTitle = document.createElement('h3');
    proxySettingsSectionTitle.textContent = '代理设置';
    
    proxySettingsSection.appendChild(proxySettingsSectionTitle);
    proxySettingsSection.appendChild(proxySection);
    
    // 添加按钮
    const buttonsContainer = document.createElement('div');
    buttonsContainer.className = 'settings-buttons';
    
    const saveButton = document.createElement('button');
    saveButton.type = 'button';
    saveButton.textContent = '保存设置';
    saveButton.addEventListener('click', () => {
      // 获取所有设置值
      const newSettings = {
        homePage: (document.getElementById('homePage') as HTMLInputElement).value,
        startupPage: (document.getElementById('startupPage') as HTMLSelectElement).value as any,
        defaultSearchEngine: (document.getElementById('defaultSearchEngine') as HTMLSelectElement).value,
        
        clearHistoryOnExit: (document.getElementById('clearHistoryOnExit') as HTMLInputElement).checked,
        doNotTrack: (document.getElementById('doNotTrack') as HTMLInputElement).checked,
        blockThirdPartyCookies: (document.getElementById('blockThirdPartyCookies') as HTMLInputElement).checked,
        
        downloadPath: (document.getElementById('downloadPath') as HTMLInputElement).value,
        askWhereToSaveBeforeDownloading: (document.getElementById('askWhereToSaveBeforeDownloading') as HTMLInputElement).checked,
        
        theme: (document.getElementById('theme') as HTMLSelectElement).value as any,
        showBookmarksBar: (document.getElementById('showBookmarksBar') as HTMLInputElement).checked,
        
        hardwareAcceleration: (document.getElementById('hardwareAcceleration') as HTMLInputElement).checked,
        
        linkBehavior: (document.getElementById('linkBehavior') as HTMLSelectElement).value as 'new-tab' | 'current-tab' | 'new-window',
        
        proxySettings: {
          enabled: (document.getElementById('proxyEnabled') as HTMLInputElement).checked,
          server: (document.getElementById('proxyServer') as HTMLInputElement).value,
          port: parseInt((document.getElementById('proxyPort') as HTMLInputElement).value) || 0
        }
      };
      
      // 更新设置
      this.settingsManager.setSetting('linkBehavior', newSettings.linkBehavior);
      this.settingsManager.setSetting('theme', newSettings.theme);
      this.settingsManager.setSetting('showBookmarksBar', newSettings.showBookmarksBar);
      this.settingsManager.setSetting('hardwareAcceleration', newSettings.hardwareAcceleration);
      this.settingsManager.setSetting('proxySettings', newSettings.proxySettings);
      
      // 应用设置
      this.applySettings(newSettings);
      
      // 显示保存成功消息
      this.showNotification('设置已保存');
    });
    
    const resetButton = document.createElement('button');
    resetButton.type = 'button';
    resetButton.textContent = '恢复默认设置';
    resetButton.addEventListener('click', () => {
      if (confirm('确定要恢复默认设置吗？这将覆盖所有自定义设置。')) {
        this.settingsManager.resetSettings();
        // 重新加载设置页面
        this.showSettings();
      }
    });
    
    buttonsContainer.appendChild(saveButton);
    buttonsContainer.appendChild(resetButton);
    
    form.appendChild(proxySettingsSection);
    form.appendChild(buttonsContainer);
    
    container.appendChild(form);
    
    this.webviewContainer.appendChild(container);
  }
  
  /**
   * 添加设置区域
   */
  private addSettingsSection(form: HTMLElement, title: string, settings: any[]): void {
    const section = document.createElement('div');
    section.className = 'settings-section';
    
    const sectionTitle = document.createElement('h3');
    sectionTitle.textContent = title;
    section.appendChild(sectionTitle);
    
    settings.forEach(setting => {
      const settingItem = document.createElement('div');
      settingItem.className = 'setting-item';
      
      if (setting.type === 'text' || setting.type === 'number') {
        const label = document.createElement('label');
        label.htmlFor = setting.id;
        label.textContent = setting.label;
        
        const input = document.createElement('input');
        input.type = setting.type;
        input.id = setting.id;
        input.value = setting.value;
        
        settingItem.appendChild(label);
        settingItem.appendChild(input);
      } 
      else if (setting.type === 'path') {
        const label = document.createElement('label');
        label.htmlFor = setting.id;
        label.textContent = setting.label;
        
        const inputContainer = document.createElement('div');
        inputContainer.className = 'path-input-container';
        
        const input = document.createElement('input');
        input.type = 'text';
        input.id = setting.id;
        input.value = setting.value;
        input.readOnly = true;
        
        const browseButton = document.createElement('button');
        browseButton.type = 'button';
        browseButton.textContent = setting.buttonText || '浏览...';
        browseButton.addEventListener('click', () => {
          electronIpc.send('select-directory');
          electronIpc.once('selected-directory', (_: any, dir: string) => {
            if (dir) {
              input.value = dir;
            }
          });
        });
        
        inputContainer.appendChild(input);
        inputContainer.appendChild(browseButton);
        
        settingItem.appendChild(label);
        settingItem.appendChild(inputContainer);
      }
      else if (setting.type === 'checkbox') {
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.id = setting.id;
        input.checked = setting.checked;
        
        const label = document.createElement('label');
        label.htmlFor = setting.id;
        label.textContent = setting.label;
        
        settingItem.appendChild(input);
        settingItem.appendChild(label);
      }
      else if (setting.type === 'select') {
        const label = document.createElement('label');
        label.htmlFor = setting.id;
        label.textContent = setting.label;
        
        const select = document.createElement('select');
        select.id = setting.id;
        
        setting.options.forEach((option: any) => {
          const optionEl = document.createElement('option');
          optionEl.value = option.value;
          optionEl.textContent = option.label;
          optionEl.selected = option.value === setting.value;
          select.appendChild(optionEl);
        });
        
        settingItem.appendChild(label);
        settingItem.appendChild(select);
      }
      
      section.appendChild(settingItem);
    });
    
    form.appendChild(section);
  }
  
  /**
   * 显示通知
   */
  private showNotification(message: string): void {
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    // 2秒后移除通知
    setTimeout(() => {
      document.body.removeChild(notification);
    }, 2000);
  }
  
  /**
   * 应用设置
   */
  private applySettings(settings: any): void {
    // 应用主题设置
    if (settings.theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else if (settings.theme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    } else {
      // 跟随系统
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        document.documentElement.setAttribute('data-theme', 'dark');
      } else {
        document.documentElement.setAttribute('data-theme', 'light');
      }
    }
    
    // 应用书签栏设置
    const bookmarksBar = document.getElementById('bookmarks-bar');
    if (bookmarksBar) {
      bookmarksBar.style.display = settings.showBookmarksBar ? 'flex' : 'none';
    }
    
    // 应用链接行为设置
    console.log('应用链接行为设置:', settings.linkBehavior);
    
    // 应用代理设置
    if (settings.proxySettings.enabled) {
      // 向主进程发送代理设置
      electronIpc.send('set-proxy', {
        server: settings.proxySettings.server,
        port: settings.proxySettings.port
      });
    } else {
      // 禁用代理
      ipcRenderer.send('disable-proxy');
    }
    
    // 应用硬件加速设置
    ipcRenderer.send('set-hardware-acceleration', settings.hardwareAcceleration);
    
    // 如果修改了下载路径设置
    if (settings.downloadPath !== this.settingsManager.getSettings().downloadPath) {
      // 通知主进程更新下载路径
      ipcRenderer.send('set-download-path', settings.downloadPath);
    }
  }

  // 添加拖拽处理方法
  private handleDragStart(e: DragEvent, index: number): void {
    if (!e.dataTransfer) return;
    
    const target = e.target as HTMLElement;
    
    // 保存被拖拽的标签索引
    e.dataTransfer.setData('text/plain', index.toString());
    
    // 设置拖拽效果
    e.dataTransfer.effectAllowed = 'move';
    
    // 添加拖拽样式
    target.classList.add('dragging');
    
    // 设置拖拽图像
    const dragImage = target.cloneNode(true) as HTMLElement;
    dragImage.style.width = `${target.offsetWidth}px`;
    dragImage.style.height = `${target.offsetHeight}px`;
    dragImage.style.opacity = '0.5';
    document.body.appendChild(dragImage);
    e.dataTransfer.setDragImage(dragImage, 0, 0);
    
    // 下一个事件循环后移除拖拽图像
    setTimeout(() => {
      document.body.removeChild(dragImage);
    }, 0);
  }

  private handleDragOver(e: DragEvent): void {
    // 阻止默认行为以允许放置
    e.preventDefault();
    
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'move';
    }
  }

  private handleDragEnter(e: DragEvent): void {
    // 当拖拽元素进入目标区域时，添加样式指示
    const target = e.target as HTMLElement;
    if (target.classList.contains('tab')) {
      target.classList.add('drag-over');
    }
  }

  private handleDragLeave(e: DragEvent): void {
    // 当拖拽元素离开目标区域时，移除样式
    const target = e.target as HTMLElement;
    if (target.classList.contains('tab')) {
      target.classList.remove('drag-over');
    }
  }

  private handleDrop(e: DragEvent, targetIndex: number): void {
    e.preventDefault();
    
    if (!e.dataTransfer) return;
    
    // 获取被拖拽的标签索引
    const sourceIndex = parseInt(e.dataTransfer.getData('text/plain'));
    
    // 移除目标的拖拽样式
    const target = e.target as HTMLElement;
    const closestTab = target.closest('.tab');
    if (closestTab) {
      closestTab.classList.remove('drag-over');
    }
    
    // 移动标签
    if (sourceIndex !== targetIndex) {
      this.moveTab(sourceIndex, targetIndex);
    }
  }

  private handleDragEnd(e: DragEvent): void {
    // 移除所有拖拽相关样式
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(tab => {
      tab.classList.remove('dragging');
      tab.classList.remove('drag-over');
    });
  }

  private moveTab(sourceIndex: number, targetIndex: number): void {
    // 从数组中移除源标签
    const [movedTab] = this.tabs.splice(sourceIndex, 1);
    
    // 在目标位置插入源标签
    this.tabs.splice(targetIndex, 0, movedTab);
    
    // 重新渲染标签
    this.renderTabs();
  }

  /**
   * 创建隐私浏览标签页
   */
  private createPrivateTab(url: string = 'about:blank'): void {
    const tabId = this.generateTabId();
    
    // 创建标签页
    const tab: Tab = {
      id: tabId,
      title: '隐私浏览',
      url: url,
      isActive: true,
      isPrivate: true
    };
    
    // 将所有标签设为非活动状态
    this.tabs.forEach(t => t.isActive = false);
    
    // 添加新标签
    this.tabs.push(tab);
    this.currentTabId = tabId;
    
    // 更新UI
    this.renderTabs();
    this.createWebView(tab);
    this.updateUrlBar(url);
  }

  /**
   * 创建标签页分组
   */
  private createTabGroup(name: string, color: string = '#4285f4'): string {
    const groupId = `group-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    
    this.tabGroups.set(groupId, {
      id: groupId,
      name,
      color,
      collapsed: false,
      tabs: []
    });
    
    return groupId;
  }

  /**
   * 将标签页添加到分组
   */
  private addTabToGroup(tabId: string, groupId: string): void {
    const group = this.tabGroups.get(groupId);
    if (!group) return;
    
    // 查找标签在数组中的索引
    const tabIndex = this.tabs.findIndex(tab => tab.id === tabId);
    if (tabIndex === -1) return;
    
    // 更新标签的分组信息
    this.tabs[tabIndex].groupId = groupId;
    
    // 将标签ID添加到分组的标签数组中
    if (!group.tabs.includes(tabId)) {
      group.tabs.push(tabId);
    }
    
    // 重新渲染标签
    this.renderTabs();
  }

  /**
   * 从分组中移除标签页
   */
  private removeTabFromGroup(tabId: string): void {
    // 查找标签在数组中的索引
    const tabIndex = this.tabs.findIndex(tab => tab.id === tabId);
    if (tabIndex === -1) return;
    
    const groupId = this.tabs[tabIndex].groupId;
    if (!groupId) return;
    
    const group = this.tabGroups.get(groupId);
    if (group) {
      // 从分组的标签数组中移除标签ID
      const index = group.tabs.indexOf(tabId);
      if (index !== -1) {
        group.tabs.splice(index, 1);
      }
      
      // 如果分组为空，删除分组
      if (group.tabs.length === 0) {
        this.tabGroups.delete(groupId);
      }
    }
    
    // 移除标签的分组信息
    this.tabs[tabIndex].groupId = undefined;
    
    // 重新渲染标签
    this.renderTabs();
  }

  /**
   * 创建新的分组并添加当前标签页
   */
  private groupCurrentTab(): void {
    if (!this.currentTabId) return;
    
    // 打开对话框输入分组名称
    const groupName = prompt('请输入分组名称：', '新分组');
    if (!groupName) return;
    
    // 打开颜色选择器
    const colors = ['#4285f4', '#ea4335', '#fbbc05', '#34a853', '#673ab7', '#ff5722', '#795548', '#607d8b'];
    const colorIndex = Math.floor(Math.random() * colors.length);
    const color = prompt('请输入分组颜色（十六进制代码）：', colors[colorIndex]);
    if (!color) return;
    
    // 创建分组
    const groupId = this.createTabGroup(groupName, color);
    
    // 将当前标签添加到分组
    this.addTabToGroup(this.currentTabId, groupId);
  }

  /**
   * 切换分组折叠状态
   */
  private toggleGroupCollapse(groupId: string): void {
    const group = this.tabGroups.get(groupId);
    if (!group) return;
    
    group.collapsed = !group.collapsed;
    this.renderTabs();
  }

  /**
   * 显示标签右键菜单
   */
  private showTabContextMenu(tabId: string, event: MouseEvent): void {
    event.preventDefault();
    
    // 查找标签
    const tab = this.tabs.find(t => t.id === tabId);
    if (!tab) return;
    
    // 创建菜单
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.style.left = `${event.pageX}px`;
    menu.style.top = `${event.pageY}px`;
    
    // 添加菜单项
    const menuItems: MenuItem[] = [
      {
        text: '关闭标签页',
        callback: () => this.closeTab(tabId)
      },
      {
        text: '关闭其他标签页',
        callback: () => this.closeOtherTabs(tabId)
      },
      {
        text: '关闭右侧标签页',
        callback: () => this.closeTabsToRight(tabId)
      },
      { type: 'separator' },
      {
        text: tab.groupId ? '从分组中移除' : '添加到分组',
        callback: () => {
          if (tab.groupId) {
            this.removeTabFromGroup(tabId);
          } else {
            this.activateTab(tabId);
            this.groupCurrentTab();
          }
        }
      },
      {
        text: '重新加载标签页',
        callback: () => {
          this.activateTab(tabId);
          this.refresh();
        }
      }
    ];
    
    menuItems.forEach((item: MenuItem) => {
      if (item.type === 'separator') {
        const separator = document.createElement('div');
        separator.className = 'menu-separator';
        menu.appendChild(separator);
      } else if (item.text && item.callback) {
        const menuItem = document.createElement('div');
        menuItem.className = 'menu-item';
        menuItem.textContent = item.text;
        menuItem.addEventListener('click', () => {
          document.body.removeChild(menu);
          item.callback?.();
        });
        menu.appendChild(menuItem);
      }
    });
    
    // 添加到页面
    document.body.appendChild(menu);
    
    // 点击其他区域关闭菜单
    const closeMenu = (e: MouseEvent) => {
      if (!menu.contains(e.target as Node)) {
        document.body.removeChild(menu);
        document.removeEventListener('click', closeMenu);
      }
    };
    
    // 延迟添加点击事件，防止立即触发
    setTimeout(() => {
      document.addEventListener('click', closeMenu);
    }, 0);
  }
  
  /**
   * 显示分组选择菜单
   */
  private showGroupSelectionMenu(tabId: string, event: MouseEvent): void {
    event.preventDefault();
    
    // 创建菜单
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.style.left = `${event.pageX}px`;
    menu.style.top = `${event.pageY}px`;
    
    // 添加"创建新分组"选项
    const newGroupItem = document.createElement('div');
    newGroupItem.className = 'menu-item';
    newGroupItem.textContent = '创建新分组...';
    newGroupItem.addEventListener('click', () => {
      document.body.removeChild(menu);
      this.activateTab(tabId);
      this.groupCurrentTab();
    });
    menu.appendChild(newGroupItem);
    
    // 添加分隔线
    const separator = document.createElement('div');
    separator.className = 'menu-separator';
    menu.appendChild(separator);
    
    // 添加现有分组
    this.tabGroups.forEach((group) => {
      const groupItem = document.createElement('div');
      groupItem.className = 'menu-item';
      
      const colorIndicator = document.createElement('span');
      colorIndicator.className = 'group-color-indicator';
      colorIndicator.style.backgroundColor = group.color;
      
      groupItem.appendChild(colorIndicator);
      groupItem.appendChild(document.createTextNode(group.name));
      
      groupItem.addEventListener('click', () => {
        document.body.removeChild(menu);
        this.addTabToGroup(tabId, group.id);
      });
      
      menu.appendChild(groupItem);
    });
    
    // 添加到页面
    document.body.appendChild(menu);
    
    // 点击其他区域关闭菜单
    const closeMenu = (e: MouseEvent) => {
      if (!menu.contains(e.target as Node)) {
        document.body.removeChild(menu);
        document.removeEventListener('click', closeMenu);
      }
    };
    
    // 延迟添加点击事件，防止立即触发
    setTimeout(() => {
      document.addEventListener('click', closeMenu);
    }, 0);
  }
  
  /**
   * 关闭其他标签页
   */
  private closeOtherTabs(tabId: string): void {
    const tabToKeep = this.tabs.find(tab => tab.id === tabId);
    if (!tabToKeep) return;
    
    // 收集要关闭的标签ID
    const tabsToClose = this.tabs.filter(tab => tab.id !== tabId).map(tab => tab.id);
    
    // 逐个关闭
    tabsToClose.forEach(id => this.closeTab(id));
    
    // 确保保留的标签是活动的
    this.activateTab(tabId);
  }
  
  /**
   * 关闭右侧标签页
   */
  private closeTabsToRight(tabId: string): void {
    const tabIndex = this.tabs.findIndex(tab => tab.id === tabId);
    if (tabIndex === -1) return;
    
    // 收集右侧标签ID
    const tabsToClose = this.tabs.slice(tabIndex + 1).map(tab => tab.id);
    
    // 逐个关闭
    tabsToClose.forEach(id => this.closeTab(id));
  }

  /**
   * 恢复会话或创建新标签页
   */
  private restoreSessionOrCreateNewTab(): void {
    const settings = this.settingsManager.getSettings();
    
    if (settings.startupPage === 'continue') {
      // 尝试恢复上次会话
      if (this.restoreSession()) {
        return;
      }
    }
    
    // 如果没有恢复会话或设置不是继续上次会话，则根据设置创建新标签页
    if (settings.startupPage === 'homePage') {
      this.createNewTab(settings.homePage);
    } else {
      this.createNewTab('about:blank');
    }
  }

  /**
   * 保存当前会话
   */
  private saveSession(): void {
    try {
      // 保存会话前准备数据，去除不可序列化的数据
      const sessionData: SessionData = {
        tabs: this.tabs.map(tab => ({
          id: tab.id,
          title: tab.title,
          url: tab.url,
          isActive: tab.isActive,
          isPrivate: tab.isPrivate || false,
          groupId: tab.groupId
        })),
        tabGroups: Array.from(this.tabGroups.values()).map(group => ({
          id: group.id,
          name: group.name,
          color: group.color,
          collapsed: group.collapsed,
          tabs: group.tabs
        }))
      };
      
      // 不保存隐私标签页
      sessionData.tabs = sessionData.tabs.filter(tab => !tab.isPrivate);
      
      // 序列化会话数据并保存
      localStorage.setItem(BrowserApp.SESSION_STORAGE_KEY, JSON.stringify(sessionData));
    } catch (error) {
      console.error('保存会话状态时出错:', error);
    }
  }

  /**
   * 恢复上次会话
   * @returns 是否成功恢复会话
   */
  private restoreSession(): boolean {
    try {
      const sessionData = localStorage.getItem(BrowserApp.SESSION_STORAGE_KEY);
      if (!sessionData) return false;
      
      const session = JSON.parse(sessionData) as SessionData;
      
      // 确保会话数据格式正确
      if (!session.tabs || !Array.isArray(session.tabs)) {
        console.warn('会话数据格式不正确，无法恢复');
        return false;
      }
      
      // 首先恢复标签分组
      if (session.tabGroups && Array.isArray(session.tabGroups)) {
        session.tabGroups.forEach((group: SessionTabGroup) => {
          const groupId = group.id;
          this.tabGroups.set(groupId, {
            id: groupId,
            name: group.name,
            color: group.color,
            collapsed: group.collapsed || false,
            tabs: group.tabs || []
          });
        });
      }
      
      // 然后恢复标签页
      if (session.tabs.length > 0) {
        session.tabs.forEach((tab: SessionTab) => {
          this.createNewTab(tab.url, tab.id, tab.title, tab.groupId);
        });
        
        // 恢复活动标签
        const activeTab = session.tabs.find((tab: SessionTab) => tab.isActive);
        if (activeTab) {
          this.activateTab(activeTab.id);
        }
        
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('恢复会话出错:', error);
      return false;
    }
  }

  /**
   * 监听窗口关闭事件，保存会话
   */
  private setupSessionSaving(): void {
    // 保存会话状态的逻辑
    window.addEventListener('beforeunload', () => {
      this.saveSession();
    });
    
    // 每5分钟自动保存一次会话状态
    setInterval(() => {
      try {
        this.saveSession();
      } catch (error) {
        console.error('自动保存会话状态时出错:', error);
      }
    }, 5 * 60 * 1000);
  }

  /**
   * 显示webview内容区域右键菜单
   */
  private showWebViewContextMenu(tabId: string, event: MouseEvent): void {
    // 先移除任何现有菜单，避免重叠
    const existingMenus = document.querySelectorAll('.webview-context-menu');
    existingMenus.forEach(menu => {
      if (document.body.contains(menu)) {
        document.body.removeChild(menu);
      }
    });
    
    // 创建菜单
    const menu = document.createElement('div');
    menu.className = 'webview-context-menu';
    
    // 获取当前webview及上下文信息
    const webview = document.getElementById(`webview-${tabId}`) as WebviewTag;
    if (!webview) {
      console.error('找不到webview元素:', tabId);
      return;
    }
    
    const contextInfo = (webview as any).contextInfo || {
      type: 'default',
      srcUrl: '',
      linkUrl: '',
      linkText: '',
      selectedText: ''
    };
    
    // 计算菜单位置，确保在视口内
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const menuWidth = 220; // 菜单宽度
    const menuHeight = 300; // 估计的菜单高度
    
    // 安全检查 - 确保坐标是有效数字
    let left = typeof event.pageX === 'number' ? event.pageX : 10;
    let top = typeof event.pageY === 'number' ? event.pageY : 10;
    
    if (isNaN(left) || !isFinite(left) || left < 0) left = 10;
    if (isNaN(top) || !isFinite(top) || top < 0) top = 10;
    
    // 确保菜单不会超出右边界
    if (left + menuWidth > viewportWidth) {
      left = viewportWidth - menuWidth - 5;
    }
    
    // 确保菜单不会超出底部边界
    if (top + menuHeight > viewportHeight) {
      top = viewportHeight - menuHeight - 5;
    }
    
    // 设置菜单位置
    menu.style.position = 'fixed';
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    menu.style.zIndex = '10000';
    
    // 添加到DOM - 先设置为不可见，然后一次性添加所有菜单项后再显示
    menu.style.opacity = '0';
    document.body.appendChild(menu);
    
    // 准备菜单项
    const menuItems = this.getContextMenuItems(webview, contextInfo);
    
    // 创建菜单项的助手函数
    menuItems.forEach(item => {
      if (item.type === 'separator') {
        const separator = document.createElement('div');
        separator.className = 'webview-menu-separator';
        menu.appendChild(separator);
      } else {
        const menuItem = document.createElement('div');
        menuItem.className = 'webview-menu-item';
        
        const iconSpan = document.createElement('span');
        iconSpan.className = 'webview-menu-item-icon';
        iconSpan.textContent = item.icon || '';
        
        const textSpan = document.createElement('span');
        textSpan.textContent = item.text;
        
        menuItem.appendChild(iconSpan);
        menuItem.appendChild(textSpan);
        
        if (item.shortcut) {
          const shortcutSpan = document.createElement('span');
          shortcutSpan.className = 'webview-menu-item-shortcut';
          shortcutSpan.textContent = item.shortcut;
          menuItem.appendChild(shortcutSpan);
        }
        
        if (item.disabled) {
          menuItem.style.opacity = '0.5';
          menuItem.style.cursor = 'default';
        } else {
          menuItem.addEventListener('click', () => {
            this.closeContextMenu();
            item.callback && item.callback();
          });
        }
        
        menu.appendChild(menuItem);
      }
    });
    
    // 点击其他区域关闭菜单
    const closeHandler = (e: MouseEvent) => {
      if (!menu.contains(e.target as Node)) {
        this.closeContextMenu();
      }
    };
    
    // 只在下一帧添加点击监听，防止立即关闭
    requestAnimationFrame(() => {
      document.addEventListener('mousedown', closeHandler);
      (menu as HTMLElement).dataset.closeHandler = 'active'; // 标记已添加事件处理
      
      // 显示菜单
      menu.style.opacity = '1';
    });
  }
  
  /**
   * 关闭上下文菜单
   */
  private closeContextMenu(): void {
    const menus = document.querySelectorAll('.webview-context-menu');
    menus.forEach(menu => {
      if (document.body.contains(menu)) {
        // 移除关联的事件监听器
        if ((menu as HTMLElement).dataset.closeHandler === 'active') {
          document.removeEventListener('mousedown', this.closeContextMenu);
        }
        document.body.removeChild(menu);
      }
    });
  }
  
  /**
   * 获取上下文菜单项目
   */
  private getContextMenuItems(webview: WebviewTag, contextInfo: any): any[] {
    const items = [];
    
    // 1. 导航相关菜单项
    items.push({ 
      text: '返回', 
      icon: '◀️', 
      shortcut: 'Alt+←', 
      disabled: !webview.canGoBack, 
      callback: () => this.goBack() 
    });
    
    items.push({ 
      text: '前进', 
      icon: '▶️', 
      shortcut: 'Alt+→', 
      disabled: !webview.canGoForward, 
      callback: () => this.goForward() 
    });
    
    items.push({ 
      text: '刷新', 
      icon: '🔄', 
      shortcut: 'F5', 
      callback: () => this.refresh() 
    });
    
    items.push({ type: 'separator' });
    
    // 2. 根据上下文类型添加特定菜单项
    
    // 如果点击了链接
    if (contextInfo.type === 'link' || contextInfo.type === 'imageLink') {
      if (contextInfo.linkUrl) {
        items.push({ 
          text: '在新标签页中打开', 
          icon: '📄', 
          callback: () => this.createNewTab(contextInfo.linkUrl) 
        });
        
        items.push({ 
          text: '在隐私标签页中打开', 
          icon: '🔒', 
          callback: () => this.createPrivateTab(contextInfo.linkUrl) 
        });
        
        items.push({ 
          text: '复制链接地址', 
          icon: '📋', 
          callback: () => {
            navigator.clipboard.writeText(contextInfo.linkUrl)
              .then(() => this.showNotification('已复制链接地址'))
              .catch(err => console.error('复制失败:', err));
          }
        });
        
        items.push({ type: 'separator' });
      }
    }
    
    // 如果点击了图片
    if (contextInfo.type === 'image' || contextInfo.type === 'imageLink') {
      if (contextInfo.srcUrl) {
        items.push({ 
          text: '在新标签页中查看图片', 
          icon: '🖼️', 
          callback: () => this.createNewTab(contextInfo.srcUrl) 
        });
        
        items.push({ 
          text: '复制图片', 
          icon: '📋', 
          callback: () => {
            try {
              // 在浏览器支持的情况下复制图片到剪贴板
              const img = new Image();
              img.src = contextInfo.srcUrl;
              img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                ctx?.drawImage(img, 0, 0);
                
                canvas.toBlob(blob => {
                  if (blob) {
                    try {
                      const item = new ClipboardItem({ 'image/png': blob });
                      navigator.clipboard.write([item])
                        .then(() => this.showNotification('已复制图片'))
                        .catch(() => this.showNotification('复制图片失败'));
                    } catch (e) {
                      // 如果ClipboardItem不支持，复制图片地址
                      navigator.clipboard.writeText(contextInfo.srcUrl)
                        .then(() => this.showNotification('设备不支持复制图片，已复制图片地址'))
                        .catch(err => console.error('复制失败:', err));
                    }
                  }
                });
              };
            } catch (e) {
              // 兜底方案：复制图片URL
              navigator.clipboard.writeText(contextInfo.srcUrl)
                .then(() => this.showNotification('已复制图片地址'))
                .catch(err => console.error('复制失败:', err));
            }
          }
        });
        
        items.push({ 
          text: '复制图片地址', 
          icon: '🔗', 
          callback: () => {
            navigator.clipboard.writeText(contextInfo.srcUrl)
              .then(() => this.showNotification('已复制图片地址'))
              .catch(err => console.error('复制失败:', err));
          }
        });
        
        items.push({ 
          text: '图片另存为...', 
          icon: '💾', 
          callback: () => {
            const filename = contextInfo.srcUrl.split('/').pop() || 'image.jpg';
            electronIpc.send('save-image', { url: contextInfo.srcUrl, filename });
          }
        });
        
        items.push({ type: 'separator' });
      }
    }
    
    // 如果有选中的文本
    if (contextInfo.selectedText) {
      items.push({ 
        text: '复制', 
        icon: '📋', 
        shortcut: 'Ctrl+C', 
        callback: () => {
          navigator.clipboard.writeText(contextInfo.selectedText)
            .then(() => this.showNotification('已复制文本'))
            .catch(err => console.error('复制失败:', err));
        }
      });
      
      items.push({ 
        text: '搜索"' + this.truncateText(contextInfo.selectedText, 20) + '"', 
        icon: '🔍', 
        callback: () => {
          const searchEngine = this.settingsManager.getSettings().defaultSearchEngine || 'baidu';
          let searchUrl;
          
          switch (searchEngine) {
            case 'google':
              searchUrl = `https://www.google.com/search?q=${encodeURIComponent(contextInfo.selectedText)}`;
              break;
            case 'bing':
              searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(contextInfo.selectedText)}`;
              break;
            case 'baidu':
            default:
              searchUrl = `https://www.baidu.com/s?wd=${encodeURIComponent(contextInfo.selectedText)}`;
              break;
          }
          
          this.createNewTab(searchUrl);
        }
      });
    } else {
      // 基本剪贴板操作
      items.push({ 
        text: '复制', 
        icon: '📋', 
        shortcut: 'Ctrl+C', 
        callback: () => {
          try {
            (webview as any).copy();
          } catch (e) {
            console.error('复制操作失败:', e);
          }
        }
      });
      
      items.push({ 
        text: '粘贴', 
        icon: '📝', 
        shortcut: 'Ctrl+V', 
        callback: () => {
          try {
            (webview as any).paste();
          } catch (e) {
            console.error('粘贴操作失败:', e);
          }
        }
      });
      
      items.push({ 
        text: '全选', 
        icon: '✅', 
        shortcut: 'Ctrl+A', 
        callback: () => {
          try {
            (webview as any).selectAll();
          } catch (e) {
            console.error('全选操作失败:', e);
          }
        }
      });
    }
    
    items.push({ type: 'separator' });
    
    // 页面操作
    items.push({ 
      text: '打印...', 
      icon: '🖨️', 
      shortcut: 'Ctrl+P', 
      callback: () => {
        try {
          (webview as any).print();
        } catch (e) {
          console.error('打印操作失败:', e);
        }
      }
    });
    
    items.push({ 
      text: '查看页面源代码', 
      icon: '📝', 
      shortcut: 'Ctrl+U', 
      callback: () => {
        const url = webview.src;
        this.createNewTab(`view-source:${url}`);
      }
    });
    
    items.push({ 
      text: '检查元素', 
      icon: '⚙️', 
      shortcut: 'Ctrl+Shift+I', 
      callback: () => {
        try {
          (webview as any).openDevTools();
        } catch (e) {
          console.error('打开开发者工具失败:', e);
        }
      }
    });
    
    return items;
  }
  
  /**
   * 截断文本，用于显示选中内容
   */
  private truncateText(text: string, maxLength: number): string {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }
}

// 初始化应用
document.addEventListener('DOMContentLoaded', () => {
  new BrowserApp();
});

// 如果需要导出 BrowserApp 类
export { BrowserApp }; 