import re

with open('src/App.tsx', 'r') as f:
    content = f.read()

# Fix string interpolation syntax errors in App.tsx introduced earlier
content = re.sub(
    r"className=\{`flex gap-3 md:gap-4 \$\{msg\.role === \\'user\\' \? \\'justify-end\\' : \\'justify-start\\'}`\}",
    r"className={`flex gap-3 md:gap-4 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}",
    content
)

content = re.sub(
    r"className=\{`relative max-w-\[85%\] md:max-w-\[75%\] px-4 py-3 border-l-2 \$\{msg\.role === \\'user\\' \? \\'bg-\[var\(--stabilized\)\] border-\[var\(--highlight\)\] text-white shadow-lg shadow-cyan-500/10\\' : \\'bg-\[var\(--bg\)\] border-\[var\(--ink\)\] text-\[var\(--ink\)\]\\'}`\}",
    r"className={`relative max-w-[85%] md:max-w-[75%] px-4 py-3 border-l-2 ${msg.role === 'user' ? 'bg-[var(--stabilized)] border-[var(--highlight)] text-white shadow-lg shadow-cyan-500/10' : 'bg-[var(--bg)] border-[var(--ink)] text-[var(--ink)]'}`}",
    content
)

content = re.sub(
    r"className=\{`w-full bg-\[var\(--stabilized\)\] border border-white/5 p-4 pr-12 focus:outline-none focus:border-\[var\(--highlight\)\] focus:ring-1 focus:ring-\[var\(--highlight\)\] resize-none max-h-48 scrollbar-hide text-\[var\(--ink\)\] placeholder-slate-500 transition-all font-mono text-sm \$\{isLoading \? \\'opacity-50 cursor-not-allowed\\' : \\'\\'}`\}",
    r"className={`w-full bg-[var(--stabilized)] border border-white/5 p-4 pr-12 focus:outline-none focus:border-[var(--highlight)] focus:ring-1 focus:ring-[var(--highlight)] resize-none max-h-48 scrollbar-hide text-[var(--ink)] placeholder-slate-500 transition-all font-mono text-sm ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}",
    content
)

with open('src/App.tsx', 'w') as f:
    f.write(content)
