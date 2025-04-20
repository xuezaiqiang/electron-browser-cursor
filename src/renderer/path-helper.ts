/**
 * 路径辅助函数
 * 解决Electron和Vite之间ESM和CommonJS混用的问题
 */

/**
 * 连接路径片段
 * @param paths 路径片段数组
 * @returns 连接后的路径
 */
export function joinPath(...paths: string[]): string {
  return paths.join('/').replace(/\\/g, '/').replace(/\/+/g, '/');
}

/**
 * 获取路径的基本名称（文件名）
 * @param path 路径
 * @returns 文件名
 */
export function basename(path: string): string {
  return path.split('/').pop() || '';
}

/**
 * 获取路径的目录部分
 * @param path 路径
 * @returns 目录路径
 */
export function dirname(path: string): string {
  const parts = path.split('/');
  parts.pop();
  return parts.join('/') || '/';
}

/**
 * 获取文件扩展名
 * @param path 路径
 * @returns 扩展名（包含点号）
 */
export function extname(path: string): string {
  const filename = basename(path);
  const dotIndex = filename.lastIndexOf('.');
  return dotIndex === -1 ? '' : filename.substring(dotIndex);
}

/**
 * 标准化路径（解析..和.）
 * @param path 路径
 * @returns 标准化后的路径
 */
export function normalize(path: string): string {
  const parts = path.split('/');
  const result = [];
  
  for (const part of parts) {
    if (part === '..') {
      result.pop();
    } else if (part && part !== '.') {
      result.push(part);
    }
  }
  
  return result.join('/');
}

/**
 * 解析路径（组合基路径和相对路径）
 * @param basePath 基路径
 * @param relativePath 相对路径
 * @returns 解析后的路径
 */
export function resolve(basePath: string, relativePath: string): string {
  if (relativePath.startsWith('/')) {
    return normalize(relativePath);
  }
  
  return normalize(joinPath(basePath, relativePath));
} 