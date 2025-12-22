# Project Spec: MindNexus (Final MVP Edition)

## 1. 项目概览 (Project Overview)
**MindNexus** 是一个基于 **Electron** 的本地优先（Local-First）桌面端个人知识库应用。
它采用 **双窗口架构**（主窗口+悬浮窗），利用 **RAG（检索增强生成）** 技术，实现对本地文件（PDF/Word/Markdown）的自动读取、碎片化存储和语义检索。

**核心约束 (Constraints):**
* **语言:** 纯 **JavaScript (ES6+)**，不要使用 TypeScript。
* **架构:** Electron 双进程架构（Main Process + Renderer Process）。
* **AI 交互:** **严禁使用 LangChain**。必须使用原生 `fetch` 调用本地 Ollama 接口，使用自定义函数进行文本切片。
* **数据隐私:** 所有数据处理在本地完成。

---

## 2. 技术栈详细选型 (Tech Stack)

### 2.1 核心框架
* **Runtime:** Electron (Latest Stable)
* **Build Tool:** `electron-vite` (React模板)
* **UI Framework:** React 18+
* **UI Library:** `shadcn/ui` (基于 Radix UI) + `Tailwind CSS`
* **Icons:** `lucide-react`

### 2.2 后端 (Main Process)
* **Environment:** Node.js
* **Metadata DB:** `better-sqlite3` (用于存文件列表、设置)
* **Vector DB:** `@lancedb/lancedb` (用于存向量数据)
* **Embedding:** `@xenova/transformers` (模型: `all-MiniLM-L6-v2`)
* **File Parsing:** `pdf-parse` (PDF), `mammoth` (Word), `fs` (Markdown/Text)

---

## 3. 数据库设计 (Database Schema)

### 3.1 SQLite (Metadata)
文件位置: `userData/database.sqlite`

```sql
CREATE TABLE IF NOT EXISTS files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT UNIQUE,              -- UUID v4
    name TEXT NOT NULL,            -- 文件名
    path TEXT NOT NULL,            -- 文件绝对路径
    type TEXT,                     -- 'pdf', 'docx', 'md'
    size INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_indexed BOOLEAN DEFAULT 0   -- 0:未处理, 1:已存入向量库
);

```

### 3.2 LanceDB (Vector Store)

文件位置: `userData/vectors/`
表名: `knowledge`

**Schema 定义:**

* `id`: String (Chunk UUID)
* `vector`: Vector (384维)
* `text`: String (切片后的文本内容)
* `source_id`: String (关联 files.uuid)
* `metadata`: JSON (包含页码、来源路径等)

---

## 4. 核心功能实现逻辑 (Implementation Logic)

### 4.1 文本切片逻辑 (Custom Splitter - No LangChain)

在 Main Process 中实现一个工具函数 `splitText(text, size=500, overlap=50)`：

1. 接收长文本。
2. 按字符长度 `size` 切分。
3. 保留 `overlap` 长度的重叠部分，确保语义连续性。
4. 尽量在换行符 `\n` 或句号 `.` 处截断（简单的边界检测）。

### 4.2 文件摄入流水线 (Ingestion)

**触发:** 拖拽文件到悬浮窗 -> Renderer 发送 `IPC:FILE_UPLOAD`。
**流程:**

1. **Main:** 接收文件路径，存入 SQLite (状态: `processing`)。
2. **Parse:** 根据后缀调用解析库提取纯文本。
3. **Split:** 调用自定义 `splitText` 函数，得到 chunks 数组。
4. **Embed:** 使用 `@xenova/transformers` 的 pipeline 将每个 chunk 转为 vector。
5. **Save:** 将 `{vector, text, source_id}` 批量插入 LanceDB。
6. **Finish:** 更新 SQLite 状态 -> 通知 Renderer 刷新。

### 4.3 RAG 搜索与对话 (Search & Chat)

**触发:** 用户提问 -> Renderer 发送 `IPC:CHAT_START`。
**流程:**

1. **Main:** 将用户问题 (Query) 转为 vector。
2. **Search:** 在 LanceDB 搜索最相似的 top 5 个 chunks。
3. **Prompt:** 拼接字符串：
`"基于以下上下文回答问题:\n上下文: ${chunks.join('\n')}\n问题: ${query}"`
4. **Inference:** 使用原生 `fetch` 请求本地 Ollama:
* URL: `http://localhost:11434/api/chat`
* Method: `POST`
* Body: `{ model: "llama3", messages: [...], stream: true }`


5. **Stream:** 读取 response body流，通过 `IPC:CHAT_TOKEN` 逐字发回前端。

---

## 5. 目录结构规范 (Directory Structure)

```text
src/
├── main/                 # 后端逻辑
│   ├── index.js          # App入口 & 窗口创建
│   ├── database.js       # SQLite & LanceDB 初始化
│   ├── vectorStore.js    # 向量化 & 搜索逻辑
│   ├── fileParser.js     # 文件读取 & splitText函数实现
│   └── ipc.js            # 所有 IPC 路由处理
├── preload/
│   └── index.js          # ContextBridge
├── renderer/             # 前端界面
│   ├── src/
│   │   ├── components/   # UI 组件
│   │   ├── layouts/      # MainLayout (Sidebar), FloatLayout
│   │   ├── pages/        # Dashboard, Chat
│   │   ├── lib/          # utils
│   │   └── App.jsx
│   └── index.html

```

---

## 6. 开发指令 (Initial Instructions)

请按照以下步骤初始化项目：

1. **环境搭建:** 使用 `npm create @quick-start/electron` 初始化项目（React, JavaScript）。
2. **依赖安装:** 安装 `better-sqlite3`, `@lancedb/lancedb`, `@xenova/transformers`, `pdf-parse`, `mammoth`, `lucide-react`, `clsx`, `tailwind-merge`。
3. **配置别名:** 配置 Vite 使得 `@` 指向 `src/renderer/src`。
4. **优先实现:** 请先编写 `src/main/database.js` 和 `src/main/ipc.js` 的基础骨架，确保主进程能成功启动并连接 SQLite。

```
