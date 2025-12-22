# 4. Core Business Logic & Algorithms

## A. Text Processing Logic (The "Splitter")
**Constraint:** Do NOT use LangChain. Implement this manually in `src/main/services/ingestor.js`.

**Algorithm: `splitText(text)`**
1.  **Params:** `chunkSize = 500` chars, `overlap = 50` chars.
2.  **Logic:**
    * Iterate through the text string.
    * Slice text from `currentIndex` to `currentIndex + chunkSize`.
    * **Optimization:** Before slicing, look for the nearest period (`.`) or newline (`\n`) within the last 50 chars of the slice range to avoid cutting sentences in half.
    * Move `currentIndex` forward by `(chunkSize - overlap)`.
3.  **Output:** An array of strings (Chunks).

## B. The Ingestion Pipeline (File -> Knowledge)
**Trigger:** `IPC: file:process`

1.  **Receive:** Main process gets file path.
2.  **Metadata:**
    * Generate `uuid` (v4).
    * Get file size, name, extension.
    * INSERT into SQLite `files` table (Status: 'processing').
3.  **Extraction:**
    * If `.pdf`: Use `pdf-parse`.
    * If `.docx`: Use `mammoth`.
    * If `.md/.txt`: Use `fs.readFileSync`.
4.  **Vectorization:**
    * Run `splitText()` on the extracted content.
    * Loop through chunks:
        * Call `@xenova/transformers` pipeline('feature-extraction') to get embedding.
        * Prepare record: `{ id: uuid(), vector: [...], text: chunk, source_uuid: file_uuid }`.
    * Batch INSERT into LanceDB.
5.  **Finalize:**
    * UPDATE SQLite `files` status to 'indexed'.
    * Notify Renderer.

## C. RAG Search & Chat Flow
**Trigger:** `IPC: rag:chat-start`

1.  **Search Phase:**
    * Convert User Query -> Vector.
    * Query LanceDB for top 5 closest chunks.
2.  **Prompt Construction:**
    * Template:
        ```text
        You are a helpful knowledge assistant.
        Context:
        ${chunks.map(c => c.text).join('\n---\n')}
        
        User Question: ${userQuery}
        
        Answer based ONLY on the context above. If unsure, say "I don't know".
        ```
3.  **Inference Phase:**
    * Send the constructed prompt to **Ollama** (`POST http://localhost:11434/api/chat`).
    * Enable `stream: true`.
    * Forward data chunks to Frontend via `rag:chat-token`.