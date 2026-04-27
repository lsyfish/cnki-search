const http = require('http');
const WebSocket = require('ws');

function getTabs() {
  return new Promise((res, rej) => http.get('http://localhost:9222/json', (r) => {
    let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
  }).on('error', rej));
}

async function main() {
  const tabs = await getTabs();
  const tab = tabs.find(t => t.type === 'page');
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise(r => ws.on('open', r));
  const p = {}; let id = 1;
  ws.on('message', d => { const m = JSON.parse(d); if (m.id && p[m.id]) p[m.id](m.result); });
  function cmd(method, params) {
    return new Promise(r => { const i = id++; p[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
  }

  // 检查 iframe 中是否有该元素
  const r = await cmd('Runtime.evaluate', {
    expression: `(function() {
      // 检查主框架中的元素
      const mainEl = document.querySelector('[class*="tencent-captcha-dy__content"]');
      
      // 检查所有 iframe
      const iframes = Array.from(document.querySelectorAll('iframe'));
      const iframeInfo = iframes.map(f => ({ src: f.src, id: f.id, className: f.className }));
      
      // 检查是否在视口内
      let inViewport = false;
      if (mainEl) {
        const rect = mainEl.getBoundingClientRect();
        inViewport = rect.top >= 0 && rect.left >= 0 && rect.bottom <= window.innerHeight && rect.right <= window.innerWidth;
        
        // 检查父元素链是否有 display:none 或 overflow:hidden 把它藏起来
        let parent = mainEl.parentElement;
        const parentChain = [];
        while (parent && parentChain.length < 10) {
          const s = window.getComputedStyle(parent);
          parentChain.push({ tag: parent.tagName, id: parent.id, display: s.display, overflow: s.overflow, visibility: s.visibility, h: parent.getBoundingClientRect().height });
          parent = parent.parentElement;
        }
        
        return JSON.stringify({ inViewport, viewportH: window.innerHeight, viewportW: window.innerWidth, iframeCount: iframes.length, iframeInfo, parentChain });
      }
      return JSON.stringify({ mainEl: 'NOT_FOUND', iframeCount: iframes.length, iframeInfo });
    })()`,
    returnByValue: true
  });
  
  const info = JSON.parse(r.result.value);
  console.log('In viewport:', info.inViewport);
  console.log('Viewport:', info.viewportW, 'x', info.viewportH);
  console.log('IFrames:', info.iframeCount);
  if (info.iframeInfo) {
    info.iframeInfo.forEach(f => console.log(' iframe:', f.src.substring(0, 80)));
  }
  console.log('\nParent chain:');
  if (info.parentChain) {
    info.parentChain.forEach(p => console.log(` <${p.tag}#${p.id}> display:${p.display} overflow:${p.overflow} h:${p.h}`));
  }
  
  ws.close();
}
main().catch(console.error);
