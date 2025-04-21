import { defineConfig } from 'vite';
import { resolve } from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, './src')
    }
  },
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html')
      },
      output: {
        assetFileNames: (assetInfo) => {
          const name = assetInfo.name || '';
          const info = name.split('.');
          let extType = info[info.length - 1];
          if (/\.(mp4|webm|ogg|mp3|wav|flac|aac)(\?.*)?$/i.test(name)) {
            extType = 'media';
          } else if (/\.(png|jpe?g|gif|svg|webp)(\?.*)?$/i.test(name)) {
            extType = 'img';
          } else if (/\.(woff2?|eot|ttf|otf)(\?.*)?$/i.test(name)) {
            extType = 'fonts';
          }
          return `assets/${extType}/[name]-[hash][extname]`;
        },
        chunkFileNames: 'assets/js/[name]-[hash].js',
        entryFileNames: 'assets/js/[name]-[hash].js'
      }
    }
  },
  optimizeDeps: {
    exclude: ['electron']
  },
  server: {
    watch: {
      usePolling: true
    }
  },
  // 添加插件来处理预加载脚本
  plugins: [
    {
      name: 'vite-plugin-electron-preload',
      closeBundle() {
        const fs = require('fs');
        const path = require('path');
        
        // 确保预加载脚本被复制到输出目录
        const sourcePreload = resolve(__dirname, 'src/webview-preload.js');
        const destPreload = resolve(__dirname, 'dist/webview-preload.js');
        
        if (fs.existsSync(sourcePreload)) {
          fs.copyFileSync(sourcePreload, destPreload);
          console.log('已复制 webview-preload.js 到输出目录');
        } else {
          console.error('未找到 webview-preload.js');
        }
      }
    }
  ]
}); 