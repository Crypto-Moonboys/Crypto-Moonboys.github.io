(function(){
  const banner=document.createElement('div');
  banner.style.cssText='position:sticky;top:0;z-index:9999;background:linear-gradient(90deg,#f7ab1a,#2ec5ff);color:#111;padding:10px 16px;text-align:center;font-weight:700;font-size:14px;border-bottom:2px solid rgba(0,0,0,.2)';
  banner.innerHTML='🏆 <strong>Null Drift Championship</strong> — Compete across all Moonboys Arcade games, including <strong>HexGL</strong>. Season resets every 90 days.';
  document.addEventListener('DOMContentLoaded',()=>{
    const header=document.getElementById('site-header');
    if(header && !document.getElementById('season-banner')){
      banner.id='season-banner';
      header.parentNode.insertBefore(banner,header.nextSibling);
    }
  });
})();
