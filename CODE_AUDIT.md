# ADHD-Sage Code Audit Report

## 1. Frontend (React/Vite)

### Performance & Architectural Bottlenecks
*   **Massive Monolithic Components:**
    *   `src/App.tsx` (1304 lines) and `src/components/ParanormalApp.tsx` (1254 lines) are extremely large. They manage far too much state (over 20 `useState` hooks in `App.tsx` alone) and complex rendering logic.
    *   *Impact:* Every state update in these massive components triggers a re-render of the entire component tree within them, leading to significant performance degradation, especially during typing (`input` state) or handling incoming chat streams.
    *   *Suggestion:* Refactor these into smaller, single-responsibility components. Extract the chat UI, the sidebar, the settings, and the various views (lattice, vault, labyrinth) into their own isolated components. Use context or a state management library (like Zustand, or React Context strategically) to pass state down rather than prop-drilling or keeping it all at the top level.
*   **Inefficient State Management for Complex Objects:**
    *   The `messages` array in `App.tsx` and `chatLog` in `ParanormalApp.tsx` are managed via simple `useState`. Appending to these arrays (especially during streaming responses) forces the entire giant component to re-render.
    *   *Suggestion:* Consider using `useReducer` for complex state transitions, or better yet, a lightweight external store (like Zustand) that allows components to subscribe *only* to the specific pieces of state they need (e.g., just the last message for a streaming update, or just the message list for the main view).
*   **Heavy Computations in Render Path:**
    *   Calculations like filtering `allMemories` based on `searchQuery` happen directly in the render path. While `useMemo` is used in some places (like `allMemories = useMemo(() => [...innerSpiral, ...outerSweep], ...)`), the filtering itself might be expensive if the arrays grow large.
    *   *Suggestion:* Ensure all heavy filtering and sorting are properly memoized or handled in Web Workers if the data sets get extremely large.
*   **`useCallback` and `useMemo` Usage:**
    *   While used frequently, passing these memoized functions/values down deep component trees defined within the monolithic components might still not prevent re-renders if the intermediate components aren't wrapped in `React.memo()`.
    *   *Suggestion:* Audit the use of `React.memo()` on child components to ensure `useCallback` is actually providing the intended performance benefit.

### Code Quality & Best Practices
*   **File Size:** Breaking down files like `App.tsx` and `ParanormalApp.tsx` will drastically improve readability and maintainability.
*   **Type Definitions:** Types like `ChatMessage` and `Attachment` are defined locally within components. Moving these to a dedicated `types.ts` file would improve reusability across the frontend and backend boundaries.

---

## 2. Backend (Express/Node.js)

### Performance & Architectural Bottlenecks
*   **Unhandled Promise Rejections in Routes:**
    *   While looking at the AI integration routes (`src/server/routes/ollama.ts`, `openrouter.ts`, `gemini.ts`), many asynchronous operations (`await fetch`, `await genAI...`) lack robust `try...catch` blocks at the top level of the route handlers, or they rely on basic Express error handling which might crash the process or leave requests hanging if not configured perfectly.
    *   *Suggestion:* Wrap asynchronous route logic in a higher-order function (e.g., an `asyncHandler`) that automatically catches errors and passes them to the Express `next(err)` middleware.
*   **Potential Memory Leaks / Blocking with Large Data:**
    *   In `src/server/routes/vfs.ts`, reading and decompressing potentially large `Buffer` objects in memory (`await decompress(r.data as Buffer)`) could lead to high memory usage if multiple users or large datasets are processed simultaneously.
    *   *Suggestion:* If files grow large, consider streaming the decompression directly to the response rather than loading the entire uncompressed string into memory at once.
*   **Lack of Connection Pooling / Context Reuse:**
    *   For the database connections (SQLite), better-sqlite3 is generally fast and synchronous, but if the app scales, long-running queries might block the event loop since Node.js is single-threaded. (Though SQLite is usually fast enough for local/personal use).
    *   *Suggestion:* Monitor query times. If they become a bottleneck, consider moving database operations to worker threads.

### AI Integrations (Gemini, Ollama, OpenRouter)
*   **Timeout Handling:**
    *   There is some evidence of timeouts (`AbortSignal.timeout()`), which is excellent practice. However, ensure this is consistent across *all* external API calls (especially OpenRouter and Gemini, not just local Ollama) to prevent hanging connections.
*   **Error Masking:**
    *   Ensure that when an AI service fails (e.g., rate limit, 500 error), the error is gracefully communicated to the frontend rather than causing an unhandled exception or returning a generic 500 without context.

---

## 3. Database (inner_spiral SQLite - `src/server/db.ts`)

### Performance & Architectural Bottlenecks
*   **Missing Indexes:**
    *   The `inner_spiral` table has `node_id` as `UNIQUE`, which creates an implicit index.
    *   However, queries in `src/server/vfs.ts` and `archive.ts` often filter or sort by `pinned`, `dopamine`, or `phi_index`.
    *   Examples:
        *   `SELECT node_id FROM inner_spiral WHERE pinned = 0 ORDER BY phi_index ASC LIMIT 1`
        *   `SELECT node_id FROM inner_spiral WHERE pinned = 0 ORDER BY dopamine ASC LIMIT 1`
    *   *Impact:* Without explicit indexes on `(pinned, phi_index)` and `(pinned, dopamine)`, these queries require full table scans, sorting the results in memory every time they run. As `inner_spiral` grows, this will become significantly slower.
    *   *Suggestion:* Add indexes for frequently queried patterns:
        ```sql
        CREATE INDEX idx_inner_spiral_eviction ON inner_spiral(pinned, phi_index);
        CREATE INDEX idx_inner_spiral_dopamine ON inner_spiral(pinned, dopamine);
        ```
*   **Context Buffer Pruning:**
    *   In `db.ts`, the context buffer pruning logic: `DELETE FROM context_buffer WHERE id IN (SELECT id FROM context_buffer ORDER BY id ASC LIMIT ?)` can be inefficient.
    *   *Suggestion:* A simpler approach might be tracking the max ID and deleting where ID < (maxID - 100), though the current approach is acceptable for small limits (100 items).

---

## 4. General Architecture & Configuration

*   **Build Process (`package.json`):**
    *   The backend build uses `esbuild` directly in the `build` script: `vite build && esbuild server.ts ...`. This is functional but can be harder to manage as the server grows.
    *   *Suggestion:* Consider using a dedicated build tool configuration for the backend (like a `tsup.config.ts` or a separate `tsconfig.node.json`) to manage complexities like externalizing packages more cleanly.
*   **Code Organization:**
    *   The separation of concerns between `src/server` (backend APIs) and `src/components` / `src/hooks` (frontend) is generally good. However, having them intermingled in `src` can sometimes lead to accidental imports of server-side code in the frontend or vice versa.
    *   *Suggestion:* Consider a stricter monorepo setup (e.g., using npm workspaces or pnpm) with distinct `apps/frontend` and `apps/backend` (or `packages/core`) directories to enforce clean boundaries, especially as the project scales.

---

## Summary of Priority Actions

1.  **High Priority:** Add database indexes to `inner_spiral` in `src/server/db.ts` to prevent full table scans during memory pruning/fetching.
2.  **High Priority:** Break apart `src/App.tsx` and `src/components/ParanormalApp.tsx` into smaller, manageable components to resolve frontend rendering bottlenecks.
3.  **Medium Priority:** Implement robust, standardized asynchronous error handling (like an `asyncHandler` wrapper) across all Express routes in `src/server/routes/*.ts`.
4.  **Medium Priority:** Review state management strategy for chat logs to avoid re-rendering entire top-level components on every new message token.
