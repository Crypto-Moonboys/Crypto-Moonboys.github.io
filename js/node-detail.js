(function () {
  'use strict';
  function escapeText(value) { return String(value == null ? '' : value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;'); }
  function money(value) { var n=Number(value); if(!Number.isFinite(n))return '—'; if(Math.abs(n)>=1e12)return '$'+(n/1e12).toFixed(2)+'T'; if(Math.abs(n)>=1e9)return '$'+(n/1e9).toFixed(2)+'B'; if(Math.abs(n)>=1e6)return '$'+(n/1e6).toFixed(2)+'M'; if(Math.abs(n)>=1e3)return '$'+(n/1e3).toFixed(2)+'K'; return '$'+n.toLocaleString(undefined,{maximumSignificantDigits:6}); }
  function base(){ return window.MOONBOYS_API && typeof window.MOONBOYS_API.getApiBase==='function' ? window.MOONBOYS_API.getApiBase() : ''; }
  function link(label,url){ return url ? '<a target="_blank" rel="noopener noreferrer" href="'+escapeText(url)+'">'+escapeText(label)+'</a>' : ''; }
  async function init(){
    var root=document.getElementById('node-detail'); if(!root)return;
    var id=document.body.getAttribute('data-node-id')||''; if(!id)return;
    try{
      var response=await fetch(base()+'/api/nodes/'+encodeURIComponent(id),{credentials:'omit'}); if(!response.ok)throw new Error('Node record unavailable');
      var data=await response.json(), n=data.node, m=n.market||{}, links=n.links||{};
      document.title=n.name+' | Crypto Moonboys Node Wiki';
      root.innerHTML='<section class="node-detail-hero"><p class="nodes-kicker">CRYPTO NODES WIKI</p><h1>'+escapeText(n.name)+'</h1><p>'+escapeText(n.node_type)+'</p><div class="node-detail-meta">'+
        '<div><dt>Token</dt><dd>'+escapeText((n.token&&n.token.ticker)||'N/A')+'</dd></div><div><dt>Status</dt><dd>'+escapeText(n.status)+'</dd></div><div><dt>Price</dt><dd>'+money(m.price_usd)+'</dd></div><div><dt>24h volume</dt><dd>'+money(m.volume_24h_usd)+'</dd></div><div><dt>Largest tracked market</dt><dd>'+escapeText(m.main_exchange||'—')+'</dd></div><div><dt>Last verified</dt><dd>'+escapeText((n.verification&&n.verification.last_verified)||'Pending review')+'</dd></div></div></section>'+
        '<section class="node-detail-section"><h2>How the node / mining process works</h2><p>'+escapeText(n.process||'Technical process pending verification.')+'</p></section>'+
        '<section class="node-detail-section"><h2>Requirements</h2><p><strong>Hardware:</strong> '+escapeText(n.hardware||'See official documentation')+'</p><p><strong>Reward model:</strong> '+escapeText(n.reward_type||'See official documentation')+'</p></section>'+
        '<section class="node-detail-section"><h2>Official sources</h2><div class="node-source-links">'+link('Website',links.website)+link('Documentation',links.docs)+link('Whitepaper',links.whitepaper)+link('Roadmap',links.roadmap)+link('GitHub',links.github)+'</div></section>'+
        '<section class="node-detail-section"><h2>Verification</h2><p>Technical facts are curated separately from live market fields. '+escapeText((data.open_review_items||[]).length)+' open review item(s).</p></section>';
    }catch(error){ root.innerHTML='<section class="node-detail-section"><h1>Node record unavailable</h1><p>'+escapeText(error.message||String(error))+'</p><p><a href="/wiki/nodes.html">Return to Nodes Directory</a></p></section>'; }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
}());
