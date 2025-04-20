/**
 * 历史记录数据结构
 */
export interface HistoryItem {
  id: string;
  title: string;
  url: string;
  visitTime: number;
  favicon?: string;
}

/**
 * 历史记录管理器类
 */
export class HistoryManager {
  private static readonly STORAGE_KEY = 'electron-browser-history';
  private static readonly MAX_HISTORY_ITEMS = 1000; // 最大历史记录数
  private historyItems: HistoryItem[] = [];

  constructor() {
    this.loadHistory();
  }

  /**
   * 加载历史记录
   */
  private loadHistory(): void {
    try {
      const historyJson = localStorage.getItem(HistoryManager.STORAGE_KEY);
      if (historyJson) {
        this.historyItems = JSON.parse(historyJson);
      }
    } catch (error) {
      console.error('加载历史记录出错:', error);
      this.historyItems = [];
    }
  }

  /**
   * 保存历史记录
   */
  private saveHistory(): void {
    try {
      localStorage.setItem(HistoryManager.STORAGE_KEY, JSON.stringify(this.historyItems));
    } catch (error) {
      console.error('保存历史记录出错:', error);
    }
  }

  /**
   * 添加历史记录
   */
  addHistoryItem(title: string, url: string, favicon?: string): HistoryItem {
    // 创建新的历史记录项
    const historyItem: HistoryItem = {
      id: Date.now().toString(),
      title,
      url,
      visitTime: Date.now(),
      favicon
    };

    // 检查是否有相同URL的记录，如果有则删除旧记录
    this.historyItems = this.historyItems.filter(item => item.url !== url);
    
    // 添加新记录到数组开头
    this.historyItems.unshift(historyItem);
    
    // 如果历史记录超过最大限制，则删除最旧的记录
    if (this.historyItems.length > HistoryManager.MAX_HISTORY_ITEMS) {
      this.historyItems = this.historyItems.slice(0, HistoryManager.MAX_HISTORY_ITEMS);
    }
    
    this.saveHistory();
    return historyItem;
  }

  /**
   * 获取所有历史记录
   */
  getAllHistory(): HistoryItem[] {
    return [...this.historyItems];
  }

  /**
   * 根据日期获取历史记录
   * @param startDate 开始日期
   * @param endDate 结束日期
   */
  getHistoryByDateRange(startDate: Date, endDate: Date): HistoryItem[] {
    const startTime = startDate.getTime();
    const endTime = endDate.getTime();
    
    return this.historyItems.filter(item => {
      return item.visitTime >= startTime && item.visitTime <= endTime;
    });
  }

  /**
   * 按日期分组获取历史记录
   */
  getHistoryGroupedByDate(): Record<string, HistoryItem[]> {
    const groupedHistory: Record<string, HistoryItem[]> = {};
    
    this.historyItems.forEach(item => {
      const date = new Date(item.visitTime);
      const dateStr = date.toDateString();
      
      if (!groupedHistory[dateStr]) {
        groupedHistory[dateStr] = [];
      }
      
      groupedHistory[dateStr].push(item);
    });
    
    return groupedHistory;
  }

  /**
   * 搜索历史记录
   */
  searchHistory(query: string): HistoryItem[] {
    if (!query.trim()) {
      return [];
    }
    
    const lowerQuery = query.toLowerCase();
    
    return this.historyItems.filter(item => {
      return item.title.toLowerCase().includes(lowerQuery) || 
             item.url.toLowerCase().includes(lowerQuery);
    });
  }

  /**
   * 清除特定URL的历史记录
   */
  removeHistoryItem(id: string): boolean {
    const initialLength = this.historyItems.length;
    this.historyItems = this.historyItems.filter(item => item.id !== id);
    
    if (this.historyItems.length !== initialLength) {
      this.saveHistory();
      return true;
    }
    
    return false;
  }

  /**
   * 清除所有历史记录
   */
  clearAllHistory(): void {
    this.historyItems = [];
    this.saveHistory();
  }

  /**
   * 清除特定时间范围内的历史记录
   */
  clearHistoryRange(startDate: Date, endDate: Date): number {
    const startTime = startDate.getTime();
    const endTime = endDate.getTime();
    
    const initialLength = this.historyItems.length;
    
    this.historyItems = this.historyItems.filter(item => {
      return !(item.visitTime >= startTime && item.visitTime <= endTime);
    });
    
    const removedCount = initialLength - this.historyItems.length;
    
    if (removedCount > 0) {
      this.saveHistory();
    }
    
    return removedCount;
  }
} 