with open('src/App.tsx', 'r') as f:
    content = f.read()

# Make sure all mentions of 'surprise' state are removed
content = content.replace(" | 'surprise'", "")

with open('src/App.tsx', 'w') as f:
    f.write(content)
