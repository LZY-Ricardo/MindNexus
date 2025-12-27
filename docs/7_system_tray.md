# Phase 7: System Tray & Background Behavior

## 1. 目标 (Objectives)
* **系统托盘 (Tray):** 在系统任务栏右下角显示应用图标。
* **后台常驻:** 点击主窗口的 "X" (关闭) 按钮时，不退出程序，而是隐藏到托盘。
* **右键菜单:** 托盘图标支持右键菜单：显示主界面、打开悬浮窗、彻底退出。
* **交互优化:** 单击托盘图标切换主窗口的显示/隐藏。

## 2. 技术实现 (Implementation)

### 2.1 资源准备
* 需要一个托盘图标文件。
* 路径: `resources/icon.png` (或者 `.ico` for Windows)。
* *注意: 确保构建资源目录中包含此图标。*

### 2.2 后端逻辑 (`src/main/index.js`)

#### A. 引入模块
需要引入 `Tray`, `Menu`, `nativeImage`。

#### B. 状态管理
需要一个全局变量 `isQuitting` (Boolean)，用于区分“用户点击关闭按钮”和“用户点击退出菜单”。
* 默认为 `false`。
* 当用户点击托盘菜单的 "Quit" 时，设为 `true`。

#### C. 托盘创建逻辑 `createTray()`
1.  使用 `nativeImage.createFromPath()` 加载图标。
2.  创建 `new Tray(icon)`。
3.  设置 Tooltip ("MindNexus").
4.  **左键点击事件:** 切换 `mainWindow` 的显示/隐藏。
5.  **右键菜单 (Context Menu):**
    * "Show Dashboard": `mainWindow.show()`
    * "Open Search Bar": `floatWindow.show()` (调用之前的 toggleFloat)
    * "Separator"
    * "Quit": 设置 `isQuitting = true` -> `app.quit()`

#### D. 窗口关闭拦截 (关键)
在 `createWindow()` 中，监听 `mainWindow` 的 `close` 事件：
```javascript
mainWindow.on('close', (event) => {
  if (!isQuitting) {
    event.preventDefault(); // 阻止默认的销毁行为
    mainWindow.hide();      // 仅仅隐藏窗口
    return false;
  }
});
