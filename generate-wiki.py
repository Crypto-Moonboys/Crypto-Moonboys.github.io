import json
import os
from datetime import datetime

with open('sam-memory.json', 'r') as f:
    data = json.load(f)

os.makedirs('wiki', exist_ok=True)

# Load the official site template
with open('_article-template.html', 'r') as f:
    template = f.read()

# 🌙 OFFICIAL LOGO — centred under every page title, fully responsive
logo_html = """
<div style="text-align: center; margin: 30px 0 50px 0;">
    <img src="crypto-moonboys-logo.png" 
         alt="Crypto Moonboys Official Logo" 
         style="max-width: 90%; height: auto; display: block; margin: 0 auto; border-radius: 16px; box-shadow: 0 10px 30px rgba(255, 215, 0, 0.3);">
</div>
"""

# Update homepage[](https://crypto-moonboys.github.io/)
with open('index.html', 'r') as f:
    homepage = f.read()
homepage = homepage.replace("</h1>", "</h1>" + logo_html)
with open('index.html', 'w') as f:
    f.write(homepage)
print("🌙 Homepage updated with centred responsive logo")

# Generate all wiki pages with clean URLs + logo
for name, facts in data.get('facts', {}).items():
    slug = name.replace(' ', '-').lower().replace('“', '').replace('”', '').replace("'", "")
    content = template.replace("EDIT: TITLE", name)
    content = content.replace("EDIT: CONTENT", facts)
    content = content.replace("EDIT: DATE", datetime.now().strftime("%Y-%m-%d"))
    
    # Insert logo under title on every wiki page
    content = content.replace("</h1>", "</h1>" + logo_html)
    
    # Keep existing images + citations
    content = content.replace("EDIT: IMAGES", f"""
![Official GraffPUNKS Reference](https://graffpunks.live/assets/official-punk-style.png)
<figure>
  ![Framed Lore Image](https://graffpunks.live/assets/example-framed.png)
  <figcaption>Inside frame example</figcaption>
</figure>
**Citation:** All images from official/user-uploaded GraffPUNKS references only (accessed {datetime.now().strftime('%Y-%m-%d')}).
""")
    
    with open(f"wiki/{slug}.html", 'w') as f:
        f.write(content)
    
    print(f"✅ Added page: {name}")

print("🌙 All pages updated — logo centred + responsive on every device")
