# Bolt's Journal - Critical Learnings Only

## 2026-06-25 - Native Node C++ module dependencies in pnpm sandbox
**Learning:** Native C++ extensions like `@mongodb-js/zstd` require native system header/library packages (`libzstd-dev`) and proper symlinks to build correctly when pnpm scripts are unapproved.
**Action:** Verify native module compilation early or rely on standard runtime fallbacks.
