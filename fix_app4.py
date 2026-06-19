with open('src/App.tsx', 'r') as f:
    lines = f.readlines()

new_lines = []
skip = False
skip_count = 0

for i, line in enumerate(lines):
    if "onClick={() => setView('surprise')}" in line:
        skip = True
        skip_count = 6
    if skip and skip_count > 0:
        skip_count -= 1
        continue
    if "v: 'surprise'" in line:
        continue
    new_lines.append(line)

with open('src/App.tsx', 'w') as f:
    f.writelines(new_lines)
