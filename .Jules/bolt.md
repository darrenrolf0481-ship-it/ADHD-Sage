# Bolt's Journal - Critical Learnings Only

## 2026-06-25 - React.memo on Chat Message Lists prevents Framer Motion tree re-evaluations
**Learning:** In chat interfaces where input state changes on every keypress at the top component level, inline rendering of message lists causes Framer Motion animation nodes (`motion.div`) and DOM subtrees for all messages to re-evaluate on every single keystroke.
**Action:** Always extract message list rendering into a separate `React.memo`-wrapped subcomponent with stable props (`messages`, `isLoading`, `scrollRef`) to isolate input keystroke state changes from the chat history.

## 2026-06-25 - Native Node C++ module dependencies in pnpm sandbox
**Learning:** Native C++ extensions like `@mongodb-js/zstd` require native system header/library packages (`libzstd-dev`) and proper symlinks to build correctly when pnpm scripts are unapproved.
**Action:** Verify native module compilation early or rely on standard runtime fallbacks.
