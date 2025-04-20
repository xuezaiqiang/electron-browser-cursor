/**
 * 书签数据结构
 */
export interface Bookmark {
  id: string;
  title: string;
  url: string;
  createdAt: number;
}

/**
 * 书签管理器类
 */
export class BookmarkManager {
  private static readonly STORAGE_KEY = 'electron-browser-bookmarks';
  private bookmarks: Bookmark[] = [];

  constructor() {
    this.loadBookmarks();
  }

  /**
   * 加载书签
   */
  private loadBookmarks(): void {
    try {
      const bookmarksJson = localStorage.getItem(BookmarkManager.STORAGE_KEY);
      if (bookmarksJson) {
        this.bookmarks = JSON.parse(bookmarksJson);
      }
    } catch (error) {
      console.error('加载书签出错:', error);
      this.bookmarks = [];
    }
  }

  /**
   * 保存书签
   */
  private saveBookmarks(): void {
    try {
      localStorage.setItem(BookmarkManager.STORAGE_KEY, JSON.stringify(this.bookmarks));
    } catch (error) {
      console.error('保存书签出错:', error);
    }
  }

  /**
   * 获取所有书签
   */
  getAllBookmarks(): Bookmark[] {
    return [...this.bookmarks];
  }

  /**
   * 添加书签
   */
  addBookmark(title: string, url: string): Bookmark {
    const bookmark: Bookmark = {
      id: Date.now().toString(),
      title,
      url,
      createdAt: Date.now()
    };

    this.bookmarks.push(bookmark);
    this.saveBookmarks();
    return bookmark;
  }

  /**
   * 删除书签
   */
  removeBookmark(id: string): boolean {
    const initialLength = this.bookmarks.length;
    this.bookmarks = this.bookmarks.filter(bookmark => bookmark.id !== id);
    
    if (this.bookmarks.length !== initialLength) {
      this.saveBookmarks();
      return true;
    }
    
    return false;
  }

  /**
   * 检查URL是否已经添加为书签
   */
  isBookmarked(url: string): boolean {
    return this.bookmarks.some(bookmark => bookmark.url === url);
  }

  /**
   * 根据URL获取书签
   */
  getBookmarkByUrl(url: string): Bookmark | undefined {
    return this.bookmarks.find(bookmark => bookmark.url === url);
  }

  /**
   * 根据ID获取书签
   */
  getBookmarkById(id: string): Bookmark | undefined {
    return this.bookmarks.find(bookmark => bookmark.id === id);
  }

  /**
   * 更新书签
   */
  updateBookmark(id: string, data: Partial<Bookmark>): boolean {
    const bookmarkIndex = this.bookmarks.findIndex(bookmark => bookmark.id === id);
    
    if (bookmarkIndex === -1) {
      return false;
    }
    
    this.bookmarks[bookmarkIndex] = {
      ...this.bookmarks[bookmarkIndex],
      ...data
    };
    
    this.saveBookmarks();
    return true;
  }
} 