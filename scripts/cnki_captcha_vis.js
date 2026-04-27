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

  const r = await cmd('Runtime.evaluate', {
    expression: `(function() {
      const el = document.querySelector('[class*="tencent-captcha-dy__content"]');
      if (!el) return 'NO_EL';
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      const parentStyle = el.parentElement ? window.getComputedStyle(el.parentElement) : {};
      return JSON.stringify({
        w: rect.width, h: rect.height,
        display: style.display,
        visibility: style.visibility,
        opacity: style.opacity,
        parentDisplay: parentStyle.display,
        parentVisibility: parentStyle.visibility,
        zIndex: style.zIndex,
        position: style.position,
        top: style.top, left: style.left
      });
    })()`,
    returnByValue: true
  });
  console.log(r.result.value);
  ws.close();
}
main().catch(console.error);
