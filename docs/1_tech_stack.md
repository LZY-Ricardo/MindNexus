# 1. Tech Stack & Architecture Definition

## Project Identity
* **Name:** MindNexus
* **Type:** Electron Desktop Application (Local-First RAG Knowledge Base)
* **Language:** JavaScript (ES6+), **No TypeScript**.

## Development Conventions
- 代码注释统一使用中文（简体）。

## Core Technology Stack
| Layer | Technology | Version/Note |
| :--- | :--- | :--- |
| **Runtime** | **Electron** | Latest Stable (v30+) |
| **Build System** | **Electron-Vite** | React Template |
| **Frontend** | **React** | v18+ (Functional Components + Hooks) |
| **Styling** | **Tailwind CSS** | v3.4+ |
| **UI Components** | **shadcn/ui** | Based on Radix UI, using `lucide-react` for icons |
| **State Management**| **Zustand** | For global app state (user preferences, sidebar state) |
| **Database (Meta)** | **better-sqlite3** | Synchronous SQLite driver. For file metadata & settings. |
| **Database (Vector)**| **@lancedb/lancedb** | Embedded vector store. No Docker required. |
| **AI / ML** | **@xenova/transformers**| Local embedding generation (`all-MiniLM-L6-v2`). |
| **LLM Interaction** | **Native Fetch** | **NO LANGCHAIN**. Connect to local Ollama via HTTP. |

## Database Schema

### 1. SQLite (`userData/database.sqlite`)
Use `better-sqlite3`.

```sql
-- Files Table: Tracks imported documents
CREATE TABLE IF NOT EXISTS files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT UNIQUE NOT NULL,      -- Sync with Vector Store
  name TEXT NOT NULL,
  path TEXT NOT NULL,
  type TEXT,                      -- 'pdf', 'docx', 'md', 'txt'
  size INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  status TEXT DEFAULT 'pending'   -- 'pending', 'indexed', 'error'
);

-- Settings Table: App preferences
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

### 2. LanceDB (userData/vectors/)

Table: knowledge

Schema:

vector: vector[384] (Float32Array)

text: String (The chunk content)

source_uuid: String (Foreign key to SQLite files.uuid)

metadata: JSON (Page number, chunk index)

#### Directory Structure (Strict)
/src
  /main                 # [Backend] Electron Main Process
    index.js            # App Entry, Window Creation
    database.js         # SQLite & LanceDB initialization
    ipc.js              # IPC Event Handlers
    services/
      ingestor.js       # File reading, splitting, embedding logic
      llm.js            # Ollama fetch wrapper
      search.js         # Vector search logic
  /preload
    index.js            # ContextBridge (Exposes API to Renderer)
  /renderer             # [Frontend] React UI
    /src
      /components       # shadcn/ui components (Button, Input...)
      /features         # Feature specific components
        /Chat           # Chat interface components
        /FloatWindow    # Search bar & drop zone
      /layouts          # MainLayout (Sidebar), BlankLayout
      /pages            # Dashboard, Settings
      /lib              # utils, cn()
      App.jsx
