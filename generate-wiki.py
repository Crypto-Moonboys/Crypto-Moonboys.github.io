import json
import os
from datetime import datetime

with open('sam-memory.json', 'r') as f:
    data = json.load(f)

os.makedirs('wiki', exist_ok=True)

# Index page
with open('wiki/index.md', 'w') as f:
    f.write(f"# CRYPTO MOONBOYS WIKI\n\nLast updated: {data['last_update']}\n\n")

# One page per fact
for name, facts in data.get('facts', {}).items():
    with open(f"wiki/{name.replace(' ', '-').lower()}.md", 'w') as f:
        f.write(f"# {name}\n\n{facts}\n\n")

print("Crypto Moonboys wiki pages generated — live on GitHub Pages")
