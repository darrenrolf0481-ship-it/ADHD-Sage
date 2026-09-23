# Bolt's Journal - Critical Learnings Only

## 2026-09-23 - Pre-tokenizing Set collections for O(N^2) graph link calculations
**Learning:** In visualization graph components like `MemoryLattice`, computing pairwise token similarity in an O(N^2) loop without pre-tokenization causes N(N-1) redundant regex splits and O(|A|*|B|) array scans per pair, causing UI thread freezing when sliders re-trigger `useMemo`.
**Action:** Always pre-compute token `Set`s in O(N) before O(N^2) similarity loops to allow O(1) set lookups.

## 2026-06-25 - Native Node C++ module dependencies in pnpm sandbox
**Learning:** Native C++ extensions like `@mongodb-js/zstd` require native system header/library packages (`libzstd-dev`) and proper symlinks to build correctly when pnpm scripts are unapproved.
**Action:** Verify native module compilation early or rely on standard runtime fallbacks.
