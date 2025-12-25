# Phase 5: UX Polish & Source Citations

## 1. 目标 (Objectives)
* **Markdown 渲染:** 支持代码高亮、表格、列表、粗体等富文本格式。
* **来源引用 (Citations):** 在 AI 回答下方显示参考的文件来源（文件名 + 页码/片段），增加可信度。

## 2. 技术方案 (Technical Implementation)

### 2.1 Frontend: Markdown Support
* **Libraries:**
    * `react-markdown`: 核心渲染库。
    * `remark-gfm`: 支持表格、删除线等 GitHub 风格语法。
    * `rehype-highlight`: 支持代码块语法高亮。
    * `@tailwindcss/typography`: 官方插件，提供 `prose` 类名，自动美化 HTML 标签样式。
* **Component (`MessageContent.jsx`):**
    * 封装一个组件，专门用于渲染消息内容。
    * 如果是 `user` 角色，保持简单文本。
    * 如果是 `ai` 角色，使用 `<ReactMarkdown>` 渲染。

### 2.2 Backend: Source Retrieval
* **Logic Update (`src/main/ipc.js` & `search.js`):**
    * 目前逻辑: `Search Vectors` -> `Stringify to Prompt` -> `LLM Stream`.
    * 修改后逻辑:
        1.  `Search Vectors` 得到 `chunks` (包含 `source_uuid`).
        2.  **Lookup:** 使用 `source_uuid` 在 SQLite `files` 表中查询对应的 `name` (文件名)。
        3.  **Emit Event:** 在开始 LLM 流式输出前，先发送一个 IPC 事件 `rag:sources` 给前端。
        4.  **Payload:** `[{ fileName: "面试.pdf", uuid: "...", score: 0.85 }, ...]`

### 2.3 Frontend: Source Display
* **State Update:** `messages` 数组中的每个消息对象新增 `sources` 字段。
* **Listener:** 在监听 `rag:chat-token` 的同时，监听 `rag:sources`。当收到来源时，更新当前正在生成的这条 AI 消息的状态。
* **UI:** 在消息气泡下方渲染一组 "Badges" (小标签)。点击标签可打开/定位文件 (Phase 6 预留功能)。

## 3. Dependency Changes
* `pnpm add react-markdown remark-gfm rehype-highlight @tailwindcss/typography`
         