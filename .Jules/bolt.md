# Bolt's Journal - Critical Learnings Only

## 2026-06-25 - Native Node C++ module dependencies in pnpm sandbox
**Learning:** Native C++ extensions like `@mongodb-js/zstd` require native system header/library packages (`libzstd-dev`) and proper symlinks to build correctly when pnpm scripts are unapproved.
**Action:** Verify native module compilation early or rely on standard runtime fallbacks.

## 2026-06-25 - React.memo on Framer Motion message list trees
**Learning:** React components containing multiple `<motion.div>` elements (like chat history lists) cause continuous style/DOM recalculations on every keystroke if parent state updates (`input`). Wrapping the list in `React.memo` eliminates 100% of re-renders during typing.
**Action:** Always memoize list components with motion/animation elements when parent handles frequent input events.
