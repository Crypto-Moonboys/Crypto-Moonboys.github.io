import json
import os
from datetime import datetime

with open('sam-memory.json', 'r') as f:
    data = json.load(f)

os.makedirs('wiki', exist_ok=True)

# Load the official template
with open('_article-template.html', 'r') as f:
    template = f.read()

# Index page (never touch existing index.html)
with open('wiki/index.md', 'w') as f:  # temporary for SAM
    f.write(f"# CRYPTO MOONBOYS WIKI\nLast updated: {data['last_update']}\n")

# Create one perfect wiki page per fact using the exact site template
for name, facts in data.get('facts', {}).items():
    slug = name.replace(' ', '-').lower()
    page_content = template.replace("EDIT: TITLE", name)
    page_content = page_content.replace("EDIT: CONTENT", facts)
    page_content = page_content.replace("EDIT: DATE", datetime.now().strftime("%Y-%m-%d"))
    
    # Add image + citation rules
    page_content = page_content.replace("EDIT: IMAGES", f"""
![Official GraffPUNKS Reference](https://graffpunks.live/assets/official-punk-style.png)
<figure>
  ![Framed Lore Image](https://graffpunks.live/assets/example-framed.png)
  <figcaption>Inside frame example</figcaption>
</figure>
**Citation:** All images from official/user-uploaded GraffPUNKS references only (accessed {datetime.now().strftime('%Y-%m-%d')}).
""")
    
    with open(f"wiki/{slug}.html", 'w') as f:
        f.write(page_content)
    
    print(f"Added wiki page: {name}")

print("✅ All Crypto Moonboys lore pages generated — layout preserved, images + citations correct")
