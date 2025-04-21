// webview-preload.js
// 这个脚本会被注入到每个 webview 中

// 获取 electron ipcRenderer
const { ipcRenderer } = require('electron');

// 重写 window.open 函数
const originalWindowOpen = window.open;
window.open = function(url, target, features) {
  // 如果有 URL，发送消息给父窗口
  if (url) {
    try {
      // 使用 ipcRenderer 发送消息到主页面
      console.log('webview-preload: window.open 被调用，URL:', url);
      ipcRenderer.sendToHost('window-open', url);
    } catch (error) {
      console.error('发送消息时出错:', error);
    }
  }
  
  // 返回一个空对象以避免错误
  const fakeWindow = {
    closed: false,
    close: function() { this.closed = true; }
  };
  
  return fakeWindow;
};

// 监听点击事件，处理 target="_blank" 链接
document.addEventListener('click', function(e) {
  // 查找被点击的链接
  let link = e.target;
  while (link && link.tagName !== 'A') {
    link = link.parentElement;
  }
  
  // 如果找到链接并且有 target="_blank"
  if (link && link.target === '_blank') {
    e.preventDefault();  // 阻止默认行为
    
    const url = link.href;
    if (url) {
      try {
        console.log('webview-preload: 拦截到 target="_blank" 链接点击，URL:', url);
        ipcRenderer.sendToHost('window-open', url);
      } catch (error) {
        console.error('发送消息时出错:', error);
      }
    }
  }
});

// 告诉主页面预加载脚本已加载
console.log('webview-preload: 脚本已加载'); 