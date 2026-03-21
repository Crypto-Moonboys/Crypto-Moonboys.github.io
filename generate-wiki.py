import json
import os
from datetime import datetime

with open('sam-memory.json', 'r') as f:
    data = json.load(f)

os.makedirs('wiki', exist_ok=True)

# Load the official site template
with open('_article-template.html', 'r') as f:
    template = f.read()

# 🌙 UPDATE HOMEPAGE[](https://crypto-moonboys.github.io/) WITH CENTRED LOGO
with open('index.html', 'r') as f:
    homepage = f.read()

# Insert logo centred under main title on homepage
logo_html = """
<div style="text-align: center; margin: 40px 0 50px 0;">
    <img src="CRYPTO MOONBOYS GK NIFTY HEADS GKNIFTYHEADS niftys.png" 
         alt="Crypto Moonboys Official Logo" 
         style="max-width: 100%; height: auto; display: block; margin: 0 auto; border-radius: 16px; box-shadow: 0 10px 30px rgba(255,215,0,0.3);">
</div>
"""

# Add logo under title on homepage
homepage = homepage.replace("</h1>", "</h1>" + logo_html)
with open('index.html', 'w') as f:
    f.write(homepage)

print("🌙 Homepage updated with centred responsive logo")

# Generate all wiki pages with clean URLs (same logo logic)
for name, facts in data.get('facts', {}).items():
    slug = name.replace(' ', '-').lower().replace('“', '').replace('”', '').replace("'", "")
    content = template.replace("EDIT: TITLE", name)
    content = content.replace("EDIT: CONTENT", facts)
    content = content.replace("EDIT: DATE", datetime.now().strftime("%Y-%m-%d"))
    
    # Same centred logo on every wiki page
    content = content.replace("</h1>", "</h1>" + logo_html)
    
    # Existing images + citations
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
    
    print(f"✅ Added wiki page: {name}")

print("🌙 All Crypto Moonboys pages updated — homepage + wiki — logo centred & responsive on every device")
