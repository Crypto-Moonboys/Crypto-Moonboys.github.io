export function initGraphHexGL(canvasId){
  const canvas=document.getElementById(canvasId); if(!canvas) return; const ctx=canvas.getContext('2d');
  function resize(){ const parent=canvas.parentElement; const w=parent?parent.clientWidth:480; const h=Math.min(Math.max(w*0.55,200),340); canvas.width=w; canvas.height=h; draw(); }
  window.addEventListener('resize',resize); resize();
  function draw(){ const w=canvas.width, h=canvas.height; ctx.fillStyle='#090c16'; ctx.fillRect(0,0,w,h);
    const cx=w/2, cy=h/2, r=Math.min(cx,cy)*0.6;
    const nodes=[
      {label:'🏆 Arcade',color:'#f7c948',x:cx,y:cy,r:26},
      {label:'🐍',x:cx+r*Math.cos(0),y:cy+r*Math.sin(0),color:'#2ec5ff',r:12},
      {label:'🧩',x:cx+r*Math.cos(Math.PI/4),y:cy+r*Math.sin(Math.PI/4),color:'#ff4fd1',r:12},
      {label:'🧱',x:cx+r*Math.cos(Math.PI/2),y:cy+r*Math.sin(Math.PI/2),color:'#bc8cff',r:12},
      {label:'👾',x:cx+r*Math.cos(3*Math.PI/4),y:cy+r*Math.sin(3*Math.PI/4),color:'#3fb950',r:12},
      {label:'🟡',x:cx+r*Math.cos(Math.PI),y:cy+r*Math.sin(Math.PI),color:'#f7c948',r:12},
      {label:'🌑',x:cx+r*Math.cos(5*Math.PI/4),y:cy+r*Math.sin(5*Math.PI/4),color:'#8b949e',r:12},
      {label:'🧱',x:cx+r*Math.cos(3*Math.PI/2),y:cy+r*Math.sin(3*Math.PI/2),color:'#ff6b35',r:12},
      {label:'🟦',x:cx+r*Math.cos(7*Math.PI/4),y:cy+r*Math.sin(7*Math.PI/4),color:'#a78bfa',r:12},
      {label:'🏁',x:cx+r*Math.cos(Math.PI/6),y:cy+r*Math.sin(Math.PI/6),color:'#f7ab1a',r:14}
    ];
    nodes.forEach(n=>{ ctx.beginPath(); ctx.arc(n.x,n.y,n.r,0,Math.PI*2); ctx.fillStyle='#090c16'; ctx.fill(); ctx.strokeStyle=n.color; ctx.lineWidth=2; ctx.stroke(); ctx.fillStyle=n.color; ctx.font='bold 12px system-ui'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(n.label,n.x,n.y); });
  }
}
