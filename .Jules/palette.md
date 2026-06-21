## 2024-06-21 - Dynamic ARIA labels for toggle buttons
**Learning:** Found an accessibility issue pattern specific to this app's components, where toggle buttons don't have aria labels, so screen readers can't read their current state or what they do.
**Action:** When adding ARIA labels to toggle buttons, ensure the label reflects the *action* that will happen upon clicking, based on the current state (e.g., `isOpen ? "Close..." : "Open..."`).
