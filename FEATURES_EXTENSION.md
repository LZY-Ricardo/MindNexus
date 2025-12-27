# MindNexus 功能扩展文档

> 版本：1.0.0
> 更新日期：2025-12-27

---

## 目录

- [一、功能概述](#一功能概述)
- [二、功能详细说明](#二功能详细说明)
  - [1. 知识库/分组管理](#1-知识库分组管理)
  - [2. 多会话管理](#2-多会话管理)
  - [3. 高级搜索与混合检索](#3-高级搜索与混合检索)
  - [4. 数据统计与分析](#4-数据统计与分析)
  - [5. 数据备份与恢复](#5-数据备份与恢复)
  - [6. 语音交互功能](#6-语音交互功能)
- [三、功能关联与集成](#三功能关联与集成)
- [四、配置选项说明](#四配置选项说明)
- [五、故障排除](#五故障排除)

---

## 一、功能概述

MindNexus 当前已实现的核心功能包括文件索引、RAG 对话、悬浮球交互等。为进一步提升用户体验和系统实用性，本文档详细描述了六大扩展功能的设计与实现方案。

| 功能 | 优先级 | 复杂度 | 依赖 |
|------|--------|--------|------|
| 知识库/分组管理 | 高 | 中 | 数据库扩展 |
| 多会话管理 | 高 | 低 | IPC 扩展 |
| 高级搜索与混合检索 | 中 | 高 | 搜索服务重构 |
| 数据统计与分析 | 低 | 中 | 数据聚合 |
| 数据备份与恢复 | 高 | 中 | 文件系统操作 |
| 语音交互功能 | 低 | 高 | Web Audio API |

---

## 二、功能详细说明

### 1. 知识库/分组管理

#### 1.1 功能简介

允许用户创建多个独立的知识库（如：工作、学习、个人），每个知识库可包含独立的文件集合。文件可在知识库之间移动或复制。

#### 1.2 使用方法

**创建知识库：**
1. 进入"知识库管理"页面（路由：`/knowledge`）
2. 点击"新建知识库"按钮
3. 输入知识库名称和描述
4. 选择图标颜色（可选）
5. 确认创建

**管理文件：**
- 在文件列表页，右键点击文件可选择"移动到知识库"
- 拖拽文件到悬浮窗时，可选择目标知识库

#### 1.3 技术实现原理

**数据库架构变更：**

```sql
-- 新增知识库表
CREATE TABLE knowledge_bases (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    color TEXT DEFAULT '#6366f1',
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    is_default INTEGER DEFAULT 0
);

-- 修改文件表，添加知识库关联
ALTER TABLE files ADD COLUMN kb_id TEXT;
ALTER TABLE files ADD COLUMN tags TEXT; -- JSON 数组格式

-- 创建索引
CREATE INDEX idx_files_kb_id ON files(kb_id);
```

**IPC 通信扩展：**

```javascript
// src/main/ipc.js 新增接口

ipcMain.handle('kb:create', async (_event, payload) => {
  const { name, description, color } = payload
  const id = randomUUID()
  db.prepare(
    `INSERT INTO knowledge_bases (id, name, description, color)
     VALUES (@id, @name, @description, @color)`
  ).run({ id, name, description, color })
  return { success: true, id }
})

ipcMain.handle('kb:list', async () => {
  return db.prepare(`SELECT * FROM knowledge_bases ORDER BY created_at DESC`).all()
})

ipcMain.handle('kb:update', async (_event, payload) => {
  const { id, name, description, color } = payload
  db.prepare(
    `UPDATE knowledge_bases
     SET name = @name, description = @description, color = @color
     WHERE id = @id`
  ).run({ id, name, description, color })
  return { success: true }
})

ipcMain.handle('kb:delete', async (_event, payload) => {
  const { id, moveFilesTo } = payload
  // 先移动或删除关联文件
  if (moveFilesTo) {
    db.prepare(`UPDATE files SET kb_id = @moveTo WHERE kb_id = @id`).run({ moveTo: moveFilesTo, id })
  } else {
    // 删除文件及其向量数据
    const files = db.prepare(`SELECT uuid FROM files WHERE kb_id = @id`).all({ id })
    for (const file of files) {
      await deleteFileData(file.uuid)
    }
  }
  db.prepare(`DELETE FROM knowledge_bases WHERE id = @id`).run({ id })
  return { success: true }
})

ipcMain.handle('file:move', async (_event, payload) => {
  const { uuid, kbId } = payload
  db.prepare(`UPDATE files SET kb_id = @kbId WHERE uuid = @uuid`).run({ kbId, uuid })
  return { success: true }
})

ipcMain.handle('file:set-tags', async (_event, payload) => {
  const { uuid, tags } = payload
  const tagsJson = JSON.stringify(tags || [])
  db.prepare(`UPDATE files SET tags = @tags WHERE uuid = @uuid`).run({ tags: tagsJson, uuid })
  return { success: true }
})
```

**向量库隔离：**

LanceDB 需要在向量数据中添加 `kb_id` 字段用于隔离搜索：

```javascript
// 修改向量记录结构
{
  id: randomUUID(),
  vector,
  text: chunk,
  source_uuid: fileUuid,
  kb_id: kbId,  // 新增字段
  metadata: { chunk_index: i }
}
```

搜索时需要按知识库过滤：

```javascript
// src/main/services/search.js 修改
export async function search(query, limit = 5, kbId = null) {
  const table = await openKnowledgeTable()
  if (!table) return []

  const vector = await embedText(query)

  let queryBuilder = table.vectorSearch(vector).distanceType('cosine')

  // 添加知识库过滤
  if (kbId) {
    queryBuilder = queryBuilder.where(`kb_id = "${kbId}"`)
  }

  const rows = await queryBuilder
    .select(['text', 'source_uuid'])
    .limit(limit)
    .toArray()

  return rows.map(/* ... */)
}
```

#### 1.4 应用场景

| 场景 | 描述 |
|------|------|
| 工作知识库 | 存储项目文档、会议记录、技术规范 |
| 学习笔记库 | 存储课程笔记、学习资料、复习总结 |
| 个人资料库 | 存储个人日记、财务记录、健康信息 |

#### 1.5 配置选项

```javascript
// src/renderer/src/lib/store.js 新增配置
{
  currentKbId: null,      // 当前选中的知识库 ID
  defaultKbId: null,      // 默认知识库 ID
  kbViewMode: 'grid',     // 'grid' | 'list' 视图模式
}
```

---

### 2. 多会话管理

#### 2.1 功能简介

支持创建多个独立的聊天会话，每个会话保存完整的对话历史。用户可以切换会话、重命名会话、删除会话。

#### 2.2 使用方法

**会话操作：**
- 点击"新建会话"按钮创建空白会话
- 点击左侧会话列表切换会话
- 双击会话名称进行重命名
- 右键菜单可删除或导出会话

#### 2.3 技术实现原理

**数据库架构：**

```sql
CREATE TABLE chat_sessions (
    id TEXT PRIMARY KEY,
    kb_id TEXT,                    -- 关联的知识库
    title TEXT NOT NULL,
    model TEXT,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE TABLE chat_messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL,            -- 'user' | 'assistant'
    content TEXT NOT NULL,
    sources TEXT,                  -- JSON 数组
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
);

CREATE INDEX idx_chat_messages_session ON chat_messages(session_id);
```

**状态管理扩展：**

```javascript
// src/renderer/src/lib/store.js
export const useStore = create((set) => ({
  // 现有状态...

  // 会话管理
  sessions: [],
  currentSessionId: null,

  loadSessions: async () => {
    const sessions = await window.api.invoke('session:list')
    set({ sessions })
  },

  createSession: async (kbId) => {
    const result = await window.api.invoke('session:create', { kbId })
    set((state) => ({
      sessions: [result.session, ...state.sessions],
      currentSessionId: result.session.id
    }))
  },

  switchSession: (sessionId) => {
    set({ currentSessionId: sessionId })
  },

  deleteSession: async (sessionId) => {
    await window.api.invoke('session:delete', { sessionId })
    set((state) => ({
      sessions: state.sessions.filter(s => s.id !== sessionId),
      currentSessionId: state.currentSessionId === sessionId ? null : state.currentSessionId
    }))
  }
}))
```

**IPC 接口：**

```javascript
// src/main/ipc.js
ipcMain.handle('session:create', async (_event, payload) => {
  const { kbId } = payload
  const id = randomUUID()
  const title = '新对话 ' + new Date().toLocaleTimeString()

  db.prepare(
    `INSERT INTO chat_sessions (id, kb_id, title)
     VALUES (@id, @kbId, @title)`
  ).run({ id, kbId, title })

  return { session: { id, kbId, title } }
})

ipcMain.handle('session:list', async () => {
  return db.prepare(
    `SELECT * FROM chat_sessions ORDER BY updated_at DESC`
  ).all()
})

ipcMain.handle('session:messages', async (_event, payload) => {
  const { sessionId } = payload
  return db.prepare(
    `SELECT * FROM chat_messages WHERE session_id = @sessionId ORDER BY created_at ASC`
  ).all({ sessionId })
})

ipcMain.handle('session:update', async (_event, payload) => {
  const { id, title } = payload
  db.prepare(
    `UPDATE chat_sessions SET title = @title, updated_at = strftime('%s', 'now') WHERE id = @id`
  ).run({ title, id })
  return { success: true }
})

ipcMain.handle('session:delete', async (_event, payload) => {
  const { sessionId } = payload
  db.prepare(`DELETE FROM chat_messages WHERE session_id = @id`).run({ id: sessionId })
  db.prepare(`DELETE FROM chat_sessions WHERE id = @id`).run({ id: sessionId })
  return { success: true }
})
```

#### 2.4 页面变更

**新增 Sessions 页面：** `src/renderer/src/pages/Sessions.jsx`

**ChatPage 修改：**
- 左侧添加会话列表侧边栏
- 支持会话切换和新建
- 消息保存到数据库而非内存

#### 2.5 配置选项

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| sessionHistoryLimit | number | 50 | 单会话消息保留上限 |
| autoTitle | boolean | true | 是否自动生成会话标题 |
| sessionPersist | boolean | true | 是否持久化会话 |

---

### 3. 高级搜索与混合检索

#### 3.1 功能简介

在现有语义搜索基础上，增加关键词全文搜索和混合检索模式，支持按文件类型、日期、标签等多维度筛选。

#### 3.2 使用方法

**搜索模式切换：**
- 语义搜索：基于向量相似度，适合问题式查询
- 关键词搜索：基于关键词匹配，适合精确定位
- 混合搜索：结合两者优势，取最优结果

**高级筛选：**
- 文件类型：PDF / Word / Markdown / Text
- 日期范围：今天 / 本周 / 本月 / 自定义
- 标签筛选：选择一个或多个标签
- 知识库：限定搜索范围

#### 3.3 技术实现原理

**全文索引：**

SQLite FTS5 扩展实现关键词搜索：

```sql
-- 创建全文搜索虚拟表
CREATE VIRTUAL TABLE files_fts USING fts5(
    name, content, tags
);

-- 触发器同步数据
CREATE TRIGGER files_fts_insert AFTER INSERT ON files BEGIN
  INSERT INTO files_fts(rowid, name, content, tags)
  VALUES (new.id, new.name, new.content, new.tags);
END;

CREATE TRIGGER files_fts_delete AFTER DELETE ON files BEGIN
  DELETE FROM files_fts WHERE rowid = old.id;
END;

CREATE TRIGGER files_fts_update AFTER UPDATE ON files BEGIN
  DELETE FROM files_fts WHERE rowid = old.id;
  INSERT INTO files_fts(rowid, name, content, tags)
  VALUES (new.id, new.name, new.content, new.tags);
END;
```

**混合检索算法：**

```javascript
// src/main/services/search.js 重构

/**
 * 混合搜索：结合语义搜索和关键词搜索
 * @param {string} query - 搜索查询
 * @param {Object} options - 搜索选项
 * @param {string} options.mode - 'semantic' | 'keyword' | 'hybrid'
 * @param {number} options.limit - 返回结果数量
 * @param {string} options.kbId - 知识库 ID
 * @param {string[]} options.types - 文件类型筛选
 * @param {string[]} options.tags - 标签筛选
 * @param {number} options.dateFrom - 起始时间戳
 * @param {number} options.dateTo - 结束时间戳
 */
export async function search(query, options = {}) {
  const {
    mode = 'hybrid',
    limit = 5,
    kbId = null,
    types = null,
    tags = null,
    dateFrom = null,
    dateTo = null,
    semanticWeight = 0.6,  // 语义搜索权重
    keywordWeight = 0.4     // 关键词搜索权重
  } = options

  const results = new Map()

  // 语义搜索
  if (mode === 'semantic' || mode === 'hybrid') {
    const semanticResults = await semanticSearch(query, { limit: limit * 2, kbId })
    for (const r of semanticResults) {
      results.set(r.source_uuid, {
        ...r,
        semanticScore: r.score,
        finalScore: r.score * semanticWeight
      })
    }
  }

  // 关键词搜索
  if (mode === 'keyword' || mode === 'hybrid') {
    const keywordResults = await keywordSearch(query, { kbId })
    for (const r of keywordResults) {
      const existing = results.get(r.source_uuid)
      if (existing) {
        existing.finalScore += r.score * keywordWeight
        existing.keywordScore = r.score
      } else {
        results.set(r.source_uuid, {
          ...r,
          keywordScore: r.score,
          finalScore: r.score * keywordWeight
        })
      }
    }
  }

  // 应用筛选条件
  let filtered = Array.from(results.values())
  if (types?.length) {
    filtered = filtered.filter(r => types.includes(r.fileType))
  }
  if (tags?.length) {
    filtered = filtered.filter(r => {
      const fileTags = JSON.parse(r.tags || '[]')
      return tags.some(t => fileTags.includes(t))
    })
  }
  if (dateFrom || dateTo) {
    filtered = filtered.filter(r => {
      if (dateFrom && r.createdAt < dateFrom) return false
      if (dateTo && r.createdAt > dateTo) return false
      return true
    })
  }

  // 按最终分数排序
  return filtered
    .sort((a, b) => b.finalScore - a.finalScore)
    .slice(0, limit)
}

async function keywordSearch(query, { kbId } = {}) {
  await initDatabase()

  let sql = `
    SELECT f.uuid, f.name, f.type, f.tags, f.created_at,
           snip(files_fts.content) as snippet,
           bm25(files_fts) as score
    FROM files f
    JOIN files_fts ON f.id = files_fts.rowid
    WHERE files_fts MATCH @query
  `

  const params = { query: query.replace(/['"]/g, '') }

  if (kbId) {
    sql += ` AND f.kb_id = @kbId`
    params.kbId = kbId
  }

  const rows = db.prepare(sql).all(params)

  // 将 BM25 分数转换为 0-1 范围
  const maxScore = Math.max(...rows.map(r => r.score), 1)

  return rows.map(row => ({
    source_uuid: row.uuid,
    text: row.snippet || '',
    score: 1 - (row.score / maxScore),  // BM25 越小越好，需要反转
    fileName: row.name,
    fileType: row.type,
    tags: row.tags,
    createdAt: row.created_at
  }))
}
```

#### 3.4 新增搜索页面

**路由：** `/search`

**组件：** `src/renderer/src/pages/SearchPage.jsx`

```jsx
// 主要功能模块
- 搜索输入框（支持快捷键 Ctrl+K）
- 搜索模式切换器
- 高级筛选面板（可折叠）
- 结果列表（显示匹配度、摘要）
- 搜索历史
```

#### 3.5 配置选项

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| defaultSearchMode | string | 'hybrid' | 默认搜索模式 |
| semanticWeight | number | 0.6 | 语义搜索权重（0-1） |
| keywordWeight | number | 0.4 | 关键词搜索权重（0-1） |
| searchHistoryLimit | number | 20 | 搜索历史保留条数 |

---

### 4. 数据统计与分析

#### 4.1 功能简介

提供知识库使用情况的可视化统计，包括文件数量、对话次数、存储空间、热门查询等数据。

#### 4.2 使用方法

访问"统计"页面（路由：`/analytics`）查看：
- 概览卡片：总文件数、总对话数、存储使用量
- 图表：文件类型分布、对话趋势、搜索热度
- 列表：最近活动、高频问题

#### 4.3 技术实现原理

**数据聚合查询：**

```javascript
// src/main/services/analytics.js

export async function getDashboardStats() {
  await initDatabase()

  const stats = {}

  // 文件统计
  stats.fileCount = db.prepare(`SELECT COUNT(*) as count FROM files`).get().count
  stats.indexedCount = db.prepare(`SELECT COUNT(*) as count FROM files WHERE status = 'indexed'`).get().count
  stats.totalSize = db.prepare(`SELECT SUM(size) as total FROM files`).get().total || 0

  // 对话统计
  stats.sessionCount = db.prepare(`SELECT COUNT(*) as count FROM chat_sessions`).get().count
  stats.messageCount = db.prepare(`SELECT COUNT(*) as count FROM chat_messages`).get().count

  // 知识库统计
  stats.kbCount = db.prepare(`SELECT COUNT(*) as count FROM knowledge_bases`).get().count

  // 存储（LanceDB 数据库大小）
  const dbPath = join(app.getPath('userData'), 'lancedb')
  stats.vectorDbSize = await getDirectorySize(dbPath)

  return stats
}

export async function getFileTypeDistribution() {
  return db.prepare(`
    SELECT type, COUNT(*) as count, SUM(size) as totalSize
    FROM files
    WHERE status = 'indexed'
    GROUP BY type
    ORDER BY count DESC
  `).all()
}

export async function getConversationTrend(days = 30) {
  const since = Date.now() / 1000 - days * 86400

  return db.prepare(`
    SELECT
      DATE(created_at, 'unixepoch') as date,
      COUNT(*) as count
    FROM chat_messages
    WHERE created_at > @since
    GROUP BY date
    ORDER BY date
  `).all({ since })
}

export async function getRecentActivity(limit = 20) {
  const activities = []

  // 文件活动
  const files = db.prepare(`
    SELECT 'file' as type, name, created_at, 'indexed' as action
    FROM files
    WHERE status = 'indexed'
    ORDER BY created_at DESC
    LIMIT @limit
  `).all({ limit })

  // 对话活动
  const sessions = db.prepare(`
    SELECT 'session' as type, title as name, created_at, 'created' as action
    FROM chat_sessions
    ORDER BY created_at DESC
    LIMIT @limit
  `).all({ limit })

  // 合并排序
  return [...files, ...sessions]
    .sort((a, b) => b.created_at - a.created_at)
    .slice(0, limit)
}
```

**前端图表：**

使用轻量级图表库（如 `recharts`）：

```bash
npm install recharts
```

```jsx
// src/renderer/src/pages/AnalyticsPage.jsx
import { PieChart, BarChart, LineChart } from 'recharts'

// 示例：文件类型分布饼图
<PieChart width={300} height={300}>
  <Pie data={fileTypeData} dataKey="count" nameKey="type" />
</PieChart>
```

#### 4.4 数据指标说明

| 指标 | 说明 | 计算方式 |
|------|------|----------|
| 文件总数 | 已上传的文件数量 | COUNT(files) |
| 索引成功数 | 完成向量化的文件 | COUNT(files WHERE status='indexed') |
| 存储使用量 | 向量库占用空间 | LanceDB 目录大小 |
| 对话总数 | 历史会话数量 | COUNT(chat_sessions) |
| 活跃天数 | 有对话记录的天数 | COUNT(DISTINCT DATE(created_at)) |

#### 4.5 配置选项

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| analyticsRetentionDays | number | 90 | 统计数据保留天数 |
| chartRefreshInterval | number | 60000 | 图表刷新间隔（毫秒） |

---

### 5. 数据备份与恢复

#### 5.1 功能简介

支持将整个知识库数据（SQLite 数据库、LanceDB 向量库、配置文件）打包备份，并可从备份文件恢复。

#### 5.2 使用方法

**备份：**
1. 进入设置页面的"备份与恢复"选项卡
2. 点击"创建备份"按钮
3. 选择保存位置
4. 等待备份完成

**恢复：**
1. 点击"从备份恢复"按钮
2. 选择备份文件（.mindnexus 格式）
3. 确认恢复操作（会覆盖当前数据）
4. 等待恢复完成并重启应用

#### 5.3 技术实现原理

**备份格式：**

```
backup-20250127-143056.mindnexus (ZIP 格式)
├── manifest.json          # 备份元信息
├── data/
│   ├── mindnexus.db       # SQLite 数据库
│   └── lancedb/           # LanceDB 向量库
└── config/
    └── settings.json      # 用户设置
```

**备份实现：**

```javascript
// src/main/services/backup.js
import { createWriteStream, existsSync, readdirSync, statSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { readFile, rm, writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { app } from 'electron'
import Archiver from 'archiver'

const BACKUP_VERSION = '1.0'

export async function createBackup(outputPath) {
  const userDataPath = app.getPath('userData')
  const dbPath = join(userDataPath, 'mindnexus.db')
  const lancedbPath = join(userDataPath, 'lancedb')
  const configPath = join(userDataPath, 'settings.json')

  // 创建清单
  const manifest = {
    version: BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    appVersion: app.getVersion(),
    files: {}
  }

  // 统计文件
  if (existsSync(dbPath)) {
    manifest.files.database = { size: statSync(dbPath).size }
  }
  if (existsSync(lancedbPath)) {
    manifest.files.lancedb = { entries: countFiles(lancedbPath) }
  }

  const output = createWriteStream(outputPath)
  const archive = Archiver('zip', { zlib: { level: 9 } })

  return new Promise((resolve, reject) => {
    output.on('close', () => {
      resolve({
        success: true,
        size: archive.pointer(),
        path: outputPath
      })
    })

    archive.on('error', reject)

    archive.pipe(output)

    // 添加清单
    archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' })

    // 添加数据库
    if (existsSync(dbPath)) {
      archive.file(dbPath, { name: 'data/mindnexus.db' })
    }

    // 添加向量库
    if (existsSync(lancedbPath)) {
      archive.directory(lancedbPath, 'data/lancedb')
    }

    // 添加配置
    if (existsSync(configPath)) {
      archive.file(configPath, { name: 'config/settings.json' })
    }

    archive.finalize()
  })
}

export async function restoreFromBackup(backupPath) {
  const unzipper = require('unzipper')
  const userDataPath = app.getPath('userData')

  // 验证备份文件
  const directory = await unzipper.Open.file(backupPath)
  const manifestFile = directory.files.find(f => f.path === 'manifest.json')

  if (!manifestFile) {
    throw new Error('无效的备份文件：缺少 manifest.json')
  }

  const manifestBuffer = await manifestFile.buffer()
  const manifest = JSON.parse(manifestBuffer.toString())

  if (manifest.version !== BACKUP_VERSION) {
    throw new Error(`备份版本不兼容：${manifest.version} vs ${BACKUP_VERSION}`)
  }

  // 关闭数据库连接
  await closeDatabase()

  // 备份当前数据（以防回滚）
  const currentBackup = join(userDataPath, `backup-before-restore-${Date.now()}.zip`)
  if (existsSync(join(userDataPath, 'mindnexus.db'))) {
    await createBackup(currentBackup)
  }

  try {
    // 删除现有数据
    const dbPath = join(userDataPath, 'mindnexus.db')
    const lancedbPath = join(userDataPath, 'lancedb')

    if (existsSync(dbPath)) rmSync(dbPath)
    if (existsSync(lancedbPath)) rmSync(lancedbPath, { recursive: true, force: true })

    // 解压备份
    await directory.extract({
      concurrency: 2,
      filter: (file) => {
        // 重定向到正确位置
        file.path = file.path.replace(/^data\//, '').replace(/^config\//, '')
        return true
      },
      path: userDataPath
    })

    return { success: true, rollbackPath: currentBackup }
  } catch (error) {
    // 恢复失败时尝试回滚
    if (existsSync(currentBackup)) {
      await restoreFromBackup(currentBackup)
    }
    throw error
  }
}

function countFiles(dir) {
  let count = 0
  const items = readdirSync(dir)
  for (const item of items) {
    const path = join(dir, item)
    const stat = statSync(path)
    if (stat.isDirectory()) {
      count += countFiles(path)
    } else {
      count++
    }
  }
  return count
}
```

**IPC 接口：**

```javascript
// src/main/ipc.js
ipcMain.handle('backup:create', async (_event, payload) => {
  const { savePath } = payload
  return await createBackup(savePath)
})

ipcMain.handle('backup:restore', async (_event, payload) => {
  const { backupPath } = payload
  return await restoreFromBackup(backupPath)
})

ipcMain.handle('backup:validate', async (_event, payload) => {
  const { backupPath } = payload
  return await validateBackup(backupPath)
})
```

#### 5.4 自动备份配置

```javascript
// 自动备份设置
{
  autoBackup: true,              // 是否启用自动备份
  autoBackupInterval: 86400,     // 自动备份间隔（秒），默认每天
  autoBackupCount: 7,            // 保留备份数量
  autoBackupPath: ''             // 自定义备份路径（空则使用默认）
}
```

#### 5.5 故障排除

| 问题 | 可能原因 | 解决方法 |
|------|----------|----------|
| 备份文件过大 | 向量库占用空间大 | 清理不需要的文件后重新备份 |
| 恢复失败 | 版本不兼容 | 使用相同版本的应用恢复 |
| 恢复后数据丢失 | 备份文件损坏 | 检查备份文件完整性 |

---

### 6. 语音交互功能

#### 6.1 功能简介

支持语音输入提问，以及将 AI 回答转换为语音播报。使用浏览器原生 Web Speech API，无需额外依赖。

#### 6.2 使用方法

**语音输入：**
1. 点击输入框旁的麦克风图标
2. 允许麦克风权限
3. 开始说话
4. 说话完成后自动识别并填入文本

**语音播报：**
1. 开启回答的语音播报开关
2. AI 回答时会自动朗读
3. 支持暂停/继续/停止控制

#### 6.3 技术实现原理

**语音识别：**

```javascript
// src/renderer/src/hooks/useSpeechRecognition.js
import { useEffect, useState, useRef } from 'react'

export function useSpeechRecognition({ onResult, onEnd, onError } = {}) {
  const [isListening, setIsListening] = useState(false)
  const [isSupported, setIsSupported] = useState(false)
  const recognitionRef = useRef(null)

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition

    if (!SpeechRecognition) {
      setIsSupported(false)
      return
    }

    setIsSupported(true)

    const recognition = new SpeechRecognition()
    recognition.lang = 'zh-CN'
    recognition.continuous = false
    recognition.interimResults = true

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map(result => result[0].transcript)
        .join('')

      onResult?.(transcript, event.results[event.results.length - 1].isFinal)
    }

    recognition.onerror = (event) => {
      console.error('[SpeechRecognition]', event.error)
      setIsListening(false)
      onError?.(event.error)
    }

    recognition.onend = () => {
      setIsListening(false)
      onEnd?.()
    }

    recognitionRef.current = recognition

    return () => {
      recognition.abort()
    }
  }, [onResult, onEnd, onError])

  const start = () => {
    if (recognitionRef.current && !isListening) {
      recognitionRef.current.start()
      setIsListening(true)
    }
  }

  const stop = () => {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop()
      setIsListening(false)
    }
  }

  return { isListening, isSupported, start, stop }
}
```

**语音合成：**

```javascript
// src/renderer/src/hooks/useSpeechSynthesis.js
import { useState, useEffect, useRef } from 'react'

export function useSpeechSynthesis() {
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [voices, setVoices] = useState([])
  const utteranceRef = useRef(null)

  useEffect(() => {
    const loadVoices = () => {
      const availableVoices = window.speechSynthesis.getVoices()
      // 优先选择中文语音
      const chineseVoices = availableVoices.filter(v => v.lang.includes('zh'))
      setVoices(chineseVoices.length > 0 ? chineseVoices : availableVoices)
    }

    loadVoices()
    window.speechSynthesis.onvoiceschanged = loadVoices

    return () => {
      window.speechSynthesis.cancel()
    }
  }, [])

  const speak = (text, options = {}) => {
    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel()
    }

    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = options.lang || 'zh-CN'
    utterance.rate = options.rate || 1
    utterance.pitch = options.pitch || 1
    utterance.volume = options.volume || 1

    if (options.voice) {
      utterance.voice = options.voice
    }

    utterance.onstart = () => setIsSpeaking(true)
    utterance.onend = () => setIsSpeaking(false)
    utterance.onerror = () => setIsSpeaking(false)

    utteranceRef.current = utterance
    window.speechSynthesis.speak(utterance)
  }

  const pause = () => {
    window.speechSynthesis.pause()
    setIsSpeaking(false)
  }

  const resume = () => {
    window.speechSynthesis.resume()
    setIsSpeaking(true)
  }

  const cancel = () => {
    window.speechSynthesis.cancel()
    setIsSpeaking(false)
  }

  return { speak, pause, resume, cancel, isSpeaking, voices }
}
```

**集成到 ChatPage：**

```jsx
// src/renderer/src/pages/ChatPage.jsx 修改
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition'
import { useSpeechSynthesis } from '@/hooks/useSpeechSynthesis'

export default function ChatPage() {
  const [enableVoiceOutput, setEnableVoiceOutput] = useState(false)
  const { speak, cancel: stopSpeaking, isSpeaking, voices } = useSpeechSynthesis()

  // 语音输入
  const { isListening, isSupported: speechSupported, start: startListening, stop: stopListening } = useSpeechRecognition({
    onResult: (transcript, isFinal) => {
      setInput(transcript)
      if (isFinal) {
        // 自动发送
        setTimeout(() => send(), 500)
      }
    }
  })

  // 监听回答完成，触发语音播报
  useEffect(() => {
    const off = window.api.on('rag:chat-token', (data) => {
      const done = Boolean(data?.done)

      if (done && enableVoiceOutput) {
        const lastMessage = messages[messages.length - 1]
        if (lastMessage?.role === 'assistant' && lastMessage?.content) {
          speak(lastMessage.content)
        }
      }
    })

    return () => off?.()
  }, [enableVoiceOutput, messages])

  return (
    <div className="flex h-full flex-col gap-3">
      {/* 现有内容... */}

      <div className="flex gap-2">
        <Button
          variant={isListening ? 'destructive' : 'outline'}
          size="icon"
          onClick={isListening ? stopListening : startListening}
          disabled={!speechSupported || streaming}
        >
          <MicIcon />
        </Button>

        <Input value={input} onChange={(e) => setInput(e.target.value)} />

        <Button
          variant={enableVoiceOutput ? 'default' : 'outline'}
          size="icon"
          onClick={() => setEnableVoiceOutput(!enableVoiceOutput)}
        >
          <VolumeIcon />
        </Button>

        <Button onClick={send}>发送</Button>
      </div>
    </div>
  )
}
```

#### 6.4 配置选项

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| speechLang | string | 'zh-CN' | 识别语言 |
| speechRate | number | 1.0 | 播放语速（0.1-10） |
| speechPitch | number | 1.0 | 播放音调（0-2） |
| speechVolume | number | 1.0 | 播放音量（0-1） |
| autoSpeak | boolean | false | 是否自动播报 |

#### 6.5 兼容性说明

| 平台 | 语音识别 | 语音合成 |
|------|----------|----------|
| Windows | 支持 | 支持 |
| macOS | 支持 | 支持 |
| Linux | 部分支持 | 支持 |

---

## 三、功能关联与集成

### 功能关系图

```
┌─────────────────────────────────────────────────────────────┐
│                     MindNexus 核心系统                        │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐      ┌──────────────┐                     │
│  │ 知识库管理    │◄────►│ 多会话管理    │                     │
│  │ (KB Management)│    │ (Sessions)   │                     │
│  └───────┬───────┘      └───────┬───────┘                     │
│          │                      │                            │
│          ▼                      ▼                            │
│  ┌──────────────────────────────────────┐                    │
│  │           高级搜索                    │                    │
│  │    (混合检索 + 多维筛选)               │                    │
│  └───────────────┬──────────────────────┘                    │
│                  │                                           │
│                  ▼                                           │
│  ┌──────────────────────────────────────┐                    │
│  │           对话引擎                    │                    │
│  │    (RAG + 流式输出 + 语音播报)        │                    │
│  └───────────────┬──────────────────────┘                    │
│                  │                                           │
│  ┌───────────────┴───────────────┐                           │
│  │                               │                           │
│  ▼                               ▼                           │
│ ┌────────────┐            ┌────────────┐                     │
│ │数据统计    │            │备份恢复     │                     │
│ │(Analytics)│            │(Backup)    │                     │
│ └────────────┘            └────────────┘                     │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### 集成接口

```javascript
// 统一的 IPC 接口命名规范
{
  // 知识库
  'kb:create', 'kb:list', 'kb:update', 'kb:delete',

  // 会话
  'session:create', 'session:list', 'session:get',
  'session:update', 'session:delete', 'session:messages',

  // 搜索
  'search:semantic', 'search:keyword', 'search:hybrid',

  // 备份
  'backup:create', 'backup:restore', 'backup:validate',

  // 统计
  'analytics:dashboard', 'analytics:trend', 'analytics:export'
}
```

---

## 四、配置选项说明

### 全局配置文件

位置：`%APPDATA%/MindNexus/settings.json` (Windows)

```json
{
  // 应用设置
  "theme": "dark",
  "language": "zh-CN",
  "autoLaunch": false,

  // Ollama 设置
  "ollamaUrl": "http://localhost:11434",
  "ollamaModel": "qwen3:8b",

  // 知识库设置
  "defaultKbId": null,
  "kbViewMode": "grid",

  // 搜索设置
  "defaultSearchMode": "hybrid",
  "semanticWeight": 0.6,
  "searchHistoryLimit": 20,

  // 会话设置
  "sessionHistoryLimit": 50,
  "autoTitle": true,

  // 语音设置
  "speechLang": "zh-CN",
  "speechRate": 1.0,
  "autoSpeak": false,

  // 备份设置
  "autoBackup": true,
  "autoBackupInterval": 86400,
  "autoBackupCount": 7,

  // 统计设置
  "analyticsRetentionDays": 90
}
```

### 配置参数取值范围

| 参数 | 类型 | 取值范围 |
|------|------|----------|
| semanticWeight | number | 0.0 - 1.0 |
| speechRate | number | 0.1 - 10.0 |
| speechPitch | number | 0.0 - 2.0 |
| speechVolume | number | 0.0 - 1.0 |
| autoBackupInterval | number | 3600 - 604800 (秒) |
| searchHistoryLimit | number | 0 - 100 |

---

## 五、故障排除

### 常见问题

#### Q1: Ollama 连接失败

**症状：** 发送消息时提示 "Ollama 请求失败"

**可能原因：**
1. Ollama 服务未启动
2. 端口号不正确
3. 防火墙阻止连接

**解决方法：**
```bash
# 检查 Ollama 是否运行
curl http://localhost:11434/api/tags

# 启动 Ollama
ollama serve
```

#### Q2: 向量数据库初始化失败

**症状：** 文件索引时报错 "LanceDB 未初始化"

**可能原因：**
1. 用户数据目录权限不足
2. 磁盘空间不足
3. 依赖库版本冲突

**解决方法：**
```bash
# 重新安装依赖
npm run postinstall

# 清理并重建
rm -rf node_modules
npm install
```

#### Q3: 语音识别不可用

**症状：** 麦克风按钮显示为灰色

**可能原因：**
1. 浏览器不支持 Web Speech API
2. 未授予麦克风权限

**解决方法：**
- 检查是否在支持的浏览器/环境中运行
- 在系统设置中允许应用访问麦克风

#### Q4: 备份恢复后数据不一致

**症状：** 恢复备份后文件数量不匹配

**可能原因：**
1. 备份文件不完整
2. 版本不兼容

**解决方法：**
- 使用 `backup:validate` 接口验证备份完整性
- 确保应用版本一致

### 日志位置

- **Windows**: `%APPDATA%/MindNexus/logs`
- **macOS**: `~/Library/Logs/MindNexus`
- **Linux**: `~/.config/MindNexus/logs`

### 调试模式

```bash
# 启动时添加调试标志
DEBUG=* npm run dev
```

---

## 附录

### A. 依赖新增清单

```json
{
  "dependencies": {
    "archiver": "^7.0.0",
    "unzipper": "^0.12.0",
    "recharts": "^2.12.0"
  }
}
```

### B. 数据库迁移脚本

```sql
-- Migration v1.1.0: 添加知识库支持
BEGIN TRANSACTION;

CREATE TABLE knowledge_bases (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    color TEXT DEFAULT '#6366f1',
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    is_default INTEGER DEFAULT 0
);

ALTER TABLE files ADD COLUMN kb_id TEXT;
ALTER TABLE files ADD COLUMN tags TEXT;

CREATE INDEX idx_files_kb_id ON files(kb_id);

-- 创建默认知识库
INSERT INTO knowledge_bases (id, name, description, is_default)
VALUES ('default', '默认知识库', '我的默认知识库', 1);

-- 更新现有文件
UPDATE files SET kb_id = 'default' WHERE kb_id IS NULL;

COMMIT;
```

```sql
-- Migration v1.2.0: 添加会话支持
BEGIN TRANSACTION;

CREATE TABLE chat_sessions (
    id TEXT PRIMARY KEY,
    kb_id TEXT,
    title TEXT NOT NULL,
    model TEXT,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE TABLE chat_messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    sources TEXT,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
);

CREATE INDEX idx_chat_messages_session ON chat_messages(session_id);

COMMIT;
```

```sql
-- Migration v1.3.0: 添加全文搜索
BEGIN TRANSACTION;

CREATE VIRTUAL TABLE files_fts USING fts5(
    name, content, tags
);

CREATE TRIGGER files_fts_insert AFTER INSERT ON files BEGIN
  INSERT INTO files_fts(rowid, name, content, tags)
  VALUES (new.rowid, new.name, '', COALESCE(new.tags, ''));
END;

CREATE TRIGGER files_fts_delete AFTER DELETE ON files BEGIN
  DELETE FROM files_fts WHERE rowid = old.rowid;
END;

CREATE TRIGGER files_fts_update AFTER UPDATE ON files BEGIN
  DELETE FROM files_fts WHERE rowid = old.rowid;
  INSERT INTO files_fts(rowid, name, content, tags)
  VALUES (new.rowid, new.name, '', COALESCE(new.tags, ''));
END;

COMMIT;
```

---

> 文档版本：1.0.0
> 最后更新：2025-12-27
> 维护者：MindNexus 开发团队
