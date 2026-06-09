import json
with open('mcp-servers.json', 'r') as f:
    data = json.load(f)

for server in data['servers']:
    if server['id'] == 'serena':
        server['command'] = 'npx'
        server['args'] = ['-y', '@modelcontextprotocol/server-serena']

with open('mcp-servers.json', 'w') as f:
    json.dump(data, f, indent=2)
