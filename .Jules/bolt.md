# Bolt's Journal - Critical Learnings Only

## 2026-09-21 - Pre-tokenizing data structures in pairwise graph computations
**Learning:** Pairwise node similarity algorithms in visualization components (`MemoryLattice`) can accidentally execute $O(N^2)$ expensive regex string splits and array scans if tokenization isn't pre-computed outside the inner loop.
**Action:** Always pre-tokenize or pre-calculate node properties into `Set` or `Map` data structures before nested pairwise comparisons ($O(N)$ vs $O(N^2)$).

## 2026-06-25 - Native Node C++ module dependencies in pnpm sandbox
**Learning:** Native C++ extensions like `@mongodb-js/zstd` require native system header/library packages (`libzstd-dev`) and proper symlinks to build correctly when pnpm scripts are unapproved.
**Action:** Verify native module compilation early or rely on standard runtime fallbacks.
