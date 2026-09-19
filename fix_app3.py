import re

with open('src/App.tsx', 'r') as f:
    content = f.read()

# 1. Fix the view === 'surprise' logic
# Ensure ParanormalApp import exists
if "import { ParanormalApp }" not in content:
    content = re.sub(
        r"(import MemoryVault from '\./components/MemoryVault';)",
        r"\1\nimport { ParanormalApp } from './components/ParanormalApp';",
        content
    )

# Ensure AppView is imported in App.tsx
if "AppView" not in content and "import type {" in content:
    content = re.sub(
        r"import type \{ ([^\}]+) \} from '\./types';",
        r"import type { \1, AppView } from './types';",
        content
    )

# Fix the view state type argument to include 'surprise' / use AppView
content = re.sub(
    r"useState<'chat' \| 'lattice' \| 'vault' \| 'journal' \| 'capabilities'>",
    r"useState<AppView>",
    content
)

# Fix the ternary logic so view === 'surprise' renders <ParanormalApp />
if "view === 'surprise'" not in content:
    content = re.sub(
        r"\)\s*:\s*view\s*===\s*'journal'\s*\?\s*\(\s*<JournalView\s*/>\s*\)\s*:\s*\(",
        r") : view === 'journal' ? (\n              <JournalView />\n            ) : view === 'surprise' ? (\n              <ParanormalApp />\n            ) : (",
        content
    )

# 2. Fix state type argument errors and button handler cleanup for 'surprise'
# Ensure setView('surprise') button blocks are cleanly matched if needed
content = re.sub(
    r"<button\s*onClick=\{[^\}]+\}\s*className=\{[^\}]+\}\s*>\s*<Radio[^>]+>\s*<span[^>]*>Paranormal OS</span>\s*</button>",
    "",
    content,
    flags=re.DOTALL
)

with open('src/App.tsx', 'w') as f:
    f.write(content)
