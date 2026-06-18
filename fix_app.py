with open('src/App.tsx', 'r') as f:
    content = f.read()

content = content.replace(r"\'translate-x-0\'", "'translate-x-0'")
content = content.replace(r"\'-translate-x-full\'", "'-translate-x-full'")

with open('src/App.tsx', 'w') as f:
    f.write(content)
