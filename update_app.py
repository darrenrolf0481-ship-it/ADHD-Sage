import re

with open('src/App.tsx', 'r') as f:
    content = f.read()

# 1. Remove ParanormalApp import
content = re.sub(r"import\s+\{\s*ParanormalApp\s*\}\s+from\s+'./components/ParanormalApp';\n", "", content)

# 2. Remove Surprise/Paranormal OS from navigation views
nav_regex = r"""\s*\{\s*id:\s*'surprise',\s*label:\s*'Paranormal\s*OS',\s*icon:\s*Radio\s*\},?"""
content = re.sub(nav_regex, "", content)

# 3. Remove view render logic for surprise
render_regex = r"\s*\):\s*view\s*===\s*'surprise'\s*\?\s*\(\s*<ParanormalApp\s*/>"
content = re.sub(render_regex, "", content)

# 4. Refactor general layout styling in App.tsx
# Replace background color and general layout container
content = content.replace('bg-[#08080C]', 'bg-[#0A0A0B]')
content = content.replace('text-slate-200', 'text-[#E4E4E7]')
content = content.replace('bg-white/5', 'bg-[#1C1C1E]')

# Update Sidebar / Frequency Monitor Styles
# The sidebar container
content = re.sub(
    r'className={`fixed inset-y-0 left-0 w-72 bg-\[#0A0A0B\]/90 md:bg-\[#1C1C1E\] backdrop-blur-xl border-r border-white/10 flex flex-col z-50 transition-transform duration-300 md:relative md:translate-x-0 \$\{isSidebarOpen \? \'translate-x-0\' : \'-translate-x-full\'\}`}',
    r'className={`fixed inset-y-0 left-0 w-72 bg-[var(--bg)] md:bg-[var(--stabilized)] border-r border-white/5 flex flex-col z-50 transition-transform duration-300 md:relative md:translate-x-0 ${isSidebarOpen ? \'translate-x-0\' : \'-translate-x-full\'}`}',
    content
)

# Update sidebar header
content = content.replace(
    '<h1 className="text-lg font-bold tracking-tight text-white">ADHD Sage Labs</h1>',
    '<h1 className="text-lg font-bold tracking-tight text-[#E4E4E7] font-mono uppercase">ADHD-Sage [Forensic]</h1>'
)

# Update the Chat Bubble rendering (Anomaly Cards)
content = re.sub(
    r'className={`flex gap-3 md:gap-4 \$\{msg\.role === \'user\' \? \'justify-end\' : \'justify-start\'\}`}',
    r'className={`flex gap-3 md:gap-4 ${msg.role === \'user\' ? \'justify-end\' : \'justify-start\'}`}',
    content
)

# Message bubbles
content = re.sub(
    r'className={`relative max-w-\[85%\] md:max-w-\[75%\] rounded-2xl px-4 py-3 \$\{msg\.role === \'user\' \? \'bg-gradient-to-r from-blue-600 to-cyan-500 text-white rounded-tr-sm shadow-lg shadow-cyan-500/20\' : \'bg-\[#1C1C1E\] border border-white/10 text-\[#E4E4E7\] rounded-tl-sm\'\}`}',
    r'className={`relative max-w-[85%] md:max-w-[75%] px-4 py-3 border-l-2 ${msg.role === \'user\' ? \'bg-[var(--stabilized)] border-[var(--highlight)] text-white shadow-lg shadow-cyan-500/10\' : \'bg-[var(--bg)] border-[var(--ink)] text-[var(--ink)]\'}`}',
    content
)

# The Input Terminal (Command Console)
content = re.sub(
    r'className={`w-full bg-\[#1C1C1E\] border border-white/10 rounded-2xl p-4 pr-12 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 resize-none max-h-48 scrollbar-hide text-\[#E4E4E7\] placeholder-slate-500 transition-all font-sans \$\{isLoading \? \'opacity-50 cursor-not-allowed\' : \'\'\}`}',
    r'className={`w-full bg-[var(--stabilized)] border border-white/5 p-4 pr-12 focus:outline-none focus:border-[var(--highlight)] focus:ring-1 focus:ring-[var(--highlight)] resize-none max-h-48 scrollbar-hide text-[var(--ink)] placeholder-slate-500 transition-all font-mono text-sm ${isLoading ? \'opacity-50 cursor-not-allowed\' : \'\'}`}',
    content
)

with open('src/App.tsx', 'w') as f:
    f.write(content)
