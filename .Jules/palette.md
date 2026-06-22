## 2024-06-21 - Dynamic ARIA labels for toggle buttons
**Learning:** Found an accessibility issue pattern specific to this app's components, where toggle buttons don't have aria labels, so screen readers can't read their current state or what they do.
**Action:** When adding ARIA labels to toggle buttons, ensure the label reflects the *action* that will happen upon clicking, based on the current state (e.g., `isOpen ? "Close..." : "Open..."`).
## 2026-06-22 - Hide file inputs accessibly
**Learning:** Using \`hidden\` or \`display: none\` on a file input completely removes it from the accessibility tree, making it unreachable via keyboard navigation or screen readers.
**Action:** When creating custom file upload buttons (by wrapping an input in a label), use \`sr-only\` on the input instead of \`hidden\`. Also, apply \`focus-within\` styles to the parent label so that keyboard users receive a visible focus indicator when tabbing to the hidden input.
