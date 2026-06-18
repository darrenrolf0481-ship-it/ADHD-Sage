import re

with open('src/App.tsx', 'r') as f:
    content = f.read()

# 1. Fix the view === 'surprise' logic
# find things like: ) : view === 'surprise' ? ( <ParanormalApp /> ) : (
content = re.sub(
    r"\)\s*:\s*view\s*===\s*'surprise'\s*\?\s*\(\s*<ParanormalApp\s*/>\s*",
    r"",
    content
)
# Just in case ParanormalApp is left
content = content.replace("<ParanormalApp />", "")

# 2. Fix the state type argument errors for 'surprise'
# Find the button rendering "Paranormal OS" that we might have missed
content = re.sub(
    r"<button\s*onClick=\{[^\}]+\}\s*className=\{[^\}]+\}\s*>\s*<Radio[^>]+>\s*<span[^>]*>Paranormal OS</span>\s*</button>",
    "",
    content,
    flags=re.DOTALL
)

# And remove the exact button block if regex failed
content = re.sub(
    r"<button[^>]+onClick=\{\(\) => setView\('surprise'\)\}[^>]+>.*?Paranormal OS.*?</button>",
    "",
    content,
    flags=re.DOTALL | re.IGNORECASE
)

with open('src/App.tsx', 'w') as f:
    f.write(content)
