import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const markup = readFileSync(path.join(ROOT, 'join-us-on-the-wax-blockchain.html'), 'utf8');
const script = readFileSync(path.join(ROOT, 'js/home-media-defer.js'), 'utf8');

test('WAX page keeps six player URLs but does not load any player or MP4 at startup', () => {
  const frames = [...markup.matchAll(/<iframe\b[^>]*><\/iframe>/gi)].map(m => m[0]);
  assert.equal(frames.length, 6);
  assert.ok(frames.every(frame => /\bdata-src="https:\/\/(?:www\.youtube\.com|rumble\.com)\/embed\//.test(frame)));
  assert.ok(frames.every(frame => /\shidden><\/iframe>$/i.test(frame)));
  assert.ok(frames.every(frame => !/\ssrc="/i.test(frame)), 'data-src is inert until Play');
  assert.equal((markup.match(/<button\b[^>]*data-media-activate/g)||[]).length, 6);
  assert.equal((markup.match(/<button\b[^>]*data-video-activate/g)||[]).length, 1);
  assert.equal((markup.match(/i\.ytimg\.com\/vi\//g)||[]).length, 0, 'No low-resolution YouTube thumbnails');
  const posters = [...markup.matchAll(/<button\b[^>]*data-media-activate[^>]*><img src="([^"]+)" width="([0-9]+)" height="([0-9]+)"/g)];
  assert.equal(posters.length, 6, 'All six embeds have local, high-resolution poster artwork');
  for (const poster of posters) {
    assert.ok(poster[1].startsWith('/img/homepage/'));
    assert.ok(Number(poster[2]) >= 1600 && Number(poster[3]) >= 1000);
  }
  assert.match(markup, /\.simple-home \.hero-intro h2,[\s\S]*?background:transparent !important/,
    'Hero headings must not regain dark rounded cards');
  assert.match(markup, /<video\b[^>]*controls[^>]*preload="none"[^>]*hidden>/);
  assert.match(markup, /<source data-src="\/img\/homepage\/Marilyn%20Monroe%20Graffiti-HD%20\(1\)\.mp4"/);
  assert.doesNotMatch(markup, /<source\s+src="[^"]*\.mp4"/);
  assert.match(markup, /<script defer src="\/js\/home-media-defer\.js"><\/script>/);
  assert.match(markup, /\.media-activate\s*\{/);
  assert.match(markup, /iframe\[hidden\], video\[hidden\], button\[hidden\] \{ display:none !important; \}/);
});

test('Play activates only selected YouTube; unrelated players remain inert', () => {
  const callbacks = new Map();
  const embed = {
    tagName: 'IFRAME', hidden:true, dataset: { src:'https://www.youtube.com/embed/pyvZa_USoNc?rel=0' },
    loading:'lazy',src:undefined
  };
  const other = {
    tagName: 'IFRAME', hidden:true, dataset: { src:'https://rumble.com/embed/v7b4ug0/?pub=3go0zf' },
    src:undefined
  };
  const btn = {
    previousElementSibling: embed, hidden:false,
    addEventListener(event, cb) { assert.equal(event,'click'); callbacks.set(this,cb); }
  };
  const otherBtn = {
    previousElementSibling:other, hidden:false,
    addEventListener(event, cb) { callbacks.set(this,cb); }
  };
  const doc = {
    querySelectorAll(query) {
      if (query==='button[data-media-activate]') return [btn,otherBtn];
      if (query==='button[data-video-activate]') return [];
      throw new Error('Unexpected selector '+query);
    }
  };
  vm.runInNewContext(script, { document:doc, window:{location:{href:'https://cryptomoonboys.com/join-us-on-the-wax-blockchain.html'}}, URL });
  assert.equal(embed.src,undefined);
  assert.equal(other.src,undefined);
  callbacks.get(btn)();
  assert.equal(embed.loading,'eager');
  assert.match(embed.src,/^https:\/\/www\.youtube\.com\/embed\/pyvZa_USoNc\?rel=0&autoplay=1$/);
  assert.equal(embed.hidden,false);
  assert.equal(btn.hidden,true);
  assert.equal(other.src,undefined);
  assert.equal(other.hidden,true);
  assert.equal(otherBtn.hidden,false);
});

test('native Marilyn MP4 does not get a src until clicked, then uses controls', async () => {
  const callbacks = new Map();
  let loads = 0, plays = 0;
  const source = {dataset:{src:'/img/homepage/Marilyn%20Monroe%20Graffiti-HD%20(1).mp4'}};
  const video = {
    tagName:'VIDEO',hidden:true,
    querySelector:selector => selector==='source[data-src]'? source:null,
    load(){loads++;}, play(){plays++;return Promise.resolve()}
  };
  const button = {
    previousElementSibling:video,hidden:false,
    addEventListener(event,cb){callbacks.set(event,cb);}
  };
  const doc = {querySelectorAll:s=>s==='button[data-media-activate]'?[]:s==='button[data-video-activate]'?[button]:[]};
  vm.runInNewContext(script,{document:doc, window:{location:{href:'https://cryptomoonboys.com/'}},URL});
  assert.equal(source.src,undefined);
  callbacks.get('click')();
  assert.equal(source.src,source.dataset.src);
  assert.equal(video.hidden,false);
  assert.equal(button.hidden,true);
  assert.equal(loads,1);
  assert.equal(plays,1);
});

test('untrusted third-party iframe URLs are never activated', () => {
  const buttons=[],frames=[];
  for(const url of ['https://evil.example/embed/test','https://www.youtube.com.evil.example/embed/1','http://www.youtube.com/embed/1']){
    const f={tagName:'IFRAME',hidden:true,dataset:{src:url},src:undefined};
    const b={previousElementSibling:f,hidden:false,addEventListener(event,cb){this.click=cb}};
    frames.push(f);buttons.push(b);
  }
  const doc={querySelectorAll:s=>s==='button[data-media-activate]'?buttons:[]};
  vm.runInNewContext(script,{document:doc,window:{location:{href:'https://cryptomoonboys.com/'}},URL});
  buttons.forEach(b=>b.click());
  assert.ok(frames.every(f=>f.src===undefined&&f.hidden));
});
