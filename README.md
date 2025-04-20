# Electron Browser

一个基于Electron的跨平台浏览器应用。

## 功能特性

- 多标签页浏览
- 前进/后退/刷新等基本导航功能
- 地址栏输入URL
- 跨平台支持 (Windows/macOS/Linux)

## 技术栈

- Electron
- TypeScript
- Vite
- HTML/CSS

## 开发环境搭建

### 前提条件

- Node.js (>= 18.0.0)
- Yarn 包管理器

### 安装依赖

```bash
yarn install
```

### 开发模式运行

```bash
yarn dev
```

### 构建应用

```bash
yarn build
```

### 打包发布

```bash
# 所有平台
yarn package

# 仅Windows
yarn package:win

# 仅macOS
yarn package:mac

# 仅Linux
yarn package:linux
```

## 项目结构

```
electron-browser-cursor/
├── src/
│   ├── main/          # Electron主进程代码
│   └── renderer/      # 渲染进程代码
├── public/            # 静态资源
├── index.html         # 主HTML页面
├── package.json       # 项目配置
├── tsconfig.json      # TypeScript配置
└── vite.config.ts     # Vite配置
```

## 许可证

MIT 