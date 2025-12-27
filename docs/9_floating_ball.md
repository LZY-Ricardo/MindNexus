# Phase 9: Floating Ball Widget

## 1. 目标 (Objectives)
* **形态:** 悬浮窗改为一个 50x50px (或 60x60px) 的圆形球体。
* **交互:**
    * **拖拽:** 可以在屏幕任意位置拖动常驻。
    * **点击:** 单击球体，唤起/显示主应用窗口 (Dashboard)。
    * **右键:** 弹出菜单 (隐藏悬浮球、退出应用)。
* **视觉:** 半透明磨砂或品牌色，悬浮在所有窗口之上。

## 2. 技术实现 (Implementation)

### 2.1 主进程调整 (`src/main/index.js`)
* **窗口尺寸:** 修改 `floatWindow` 的初始化尺寸。
    * Width/Height: 60 (正方形).
    * Resizable: `false` (固定大小).
* **窗口属性:** 保持 `transparent: true`, `frame: false`, `alwaysOnTop: true`.
* **位置:** 默认初始化在屏幕右侧中部，而不是顶部居中。

### 2.2 前端样式 (`src/renderer/src/pages/FloatPage.jsx`)
* **容器:** 使用 Tailwind 实现圆形。
    * `w-14 h-14 rounded-full`.
    * `bg-primary text-primary-foreground`.
    * `shadow-xl`.
* **拖拽区 (关键):**
    * Electron 中使用 `-webkit-app-region: drag` 实现拖拽。
    * **注意:** 如果整个球都是 `drag` 区域，点击事件 (`onClick`) 可能会失效（在 Windows 上常见）。
    * **解决方案:** 整个球设为 `drag`，但在球心放一个透明或可视的图标层设为 `no-drag` 用于响应点击；或者利用 `onMouseUp` 结合位移判断来模拟点击。
    * **简化方案:** 整个球设为 `drag`，利用 `ipcRenderer` 发送消息。实际上 Electron 的 `drag` 区域在 macOS 上点击没问题，但在 Windows 上会吞掉点击。
    * **推荐方案:**
        * 外层 `div`: `app-region: no-drag` (作为容器).
        * 内部 `div` (Handle): `app-region: drag` (负责拖动).
        * *实际上，对于悬浮球，最简单的做法是：*
        * 整个球 `app-region: drag`。
        * 监听 `mouseup`。如果按下和抬起的时间/坐标差很小，视为点击。

### 2.3 IPC 通信
* **点击事件:** 调用现有的 `win:open-main` (在 Phase 2 定义过，若未实现则需补充)。
* **右键菜单:** 调用 `ipcRenderer.invoke('win:float-context-menu')` (需新增)。
