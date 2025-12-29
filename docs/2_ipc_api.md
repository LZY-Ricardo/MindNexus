# 2. IPC API Documentation (Frontend-Backend Interface)

This document defines the communication channels between the **Renderer Process (React)** and the **Main Process (Node.js)**.

**Convention:**

- All channels utilize `ipcRenderer.invoke` (Promise-based) unless specified as `on` (Listener).
- Format: `namespace:action`.

## A. Window Management (`win`)

| Channel            | Type   | Payload             | Response | Description                                                   |
| :----------------- | :----- | :------------------ | :------- | :------------------------------------------------------------ |
| `win:toggle-float` | Invoke | `null`              | `void`   | Toggles the visibility of the Floating Window.                |
| `win:set-size`     | Invoke | `{ width, height }` | `void`   | Resizes the current window (used for Float window expansion). |
| `win:open-main`    | Invoke | `null`              | `void`   | Opens/Focuses the Main Application Window.                    |

## B. File System & Ingestion (`file`)

| Channel        | Type   | Payload                | Response                             | Description                                                |
| :------------- | :----- | :--------------------- | :----------------------------------- | :--------------------------------------------------------- |
| `file:process` | Invoke | `{ filePath: string }` | `{ success: boolean, uuid: string }` | Triggered when file is dropped. Starts ingestion pipeline. |
| `file:list`    | Invoke | `{ limit: number }`    | `Array<FileObject>`                  | Get list of processed files from SQLite.                   |
| `file:delete`  | Invoke | `{ uuid: string }`     | `{ success: boolean }`               | Removes file from SQLite and vectors from LanceDB.         |

## C. Knowledge & AI (`rag`)

### 1. Semantic Search

- **Channel:** `rag:search`
- **Payload:** `{ query: string, limit: number }`
- **Response:**
  ```json
  [{ "text": "...", "score": 0.85, "source_uuid": "..." }]
  ```

### 2. Chat with Stream (Ollama)

- **Start Channel:** `rag:chat-start`
- **Payload:** `{ query: string, history: Array, model: "llama3" }`
- **Response:** `void` (Triggers stream events below)

- **Stream Event (Main -> Renderer):** `rag:chat-token`
- **Payload:** `{ token: string, done: boolean }`

## D. Type Definitions (JSDoc Reference)

Although we use JS, follow these shapes:

```javascript
/**
 * @typedef {Object} FileObject
 * @property {string} uuid
 * @property {string} name
 * @property {string} path
 * @property {string} status - 'pending' | 'indexed'
 */
```

## E. Ollama (`ollama`)

| Channel             | Type   | Payload | Response                                    | Description                                     |
| :------------------ | :----- | :------ | :------------------------------------------ | :---------------------------------------------- |
| `ollama:check`      | Invoke | `null`  | `{ connected: boolean }`                    | Checks if Ollama is reachable via `/api/tags`. |
| `ollama:list-models`| Invoke | `null`  | `{ connected: boolean, models: Array }`     | Lists local models from Ollama `/api/tags`.    |
