import re

with open('src/App.tsx', 'r') as f:
    content = f.read()

# Fix Sparkles never used
content = re.sub(r"Sparkles,\s*", "", content)

with open('src/App.tsx', 'w') as f:
    f.write(content)
