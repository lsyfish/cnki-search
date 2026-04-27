const http = require('http');
const WebSocket = require('ws');

function getTabList() {
  return new Promise((resolve, reject) => {
    http.get('http://localhost:9222/json', (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

let msgId = 1;
const pending = {};

function sendCmd(ws, method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = msgId++;
    pending[id] = { resolve, reject };
    ws.send(JSON.stringify({ id, method, params }));
    setTimeout(() => { if (pending[id]) { delete pending[id]; reject(new Error('Timeout')); } }, 15000);
  });
}

async function evaluate(ws, expr) {
  const r = await sendCmd(ws, 'Runtime.evaluate', { expression: expr, returnByValue: true });
  return r.result.value;
}

async function main() {
  const tabs = await getTabList();
  const tab = tabs.find(t => t.type === 'page');
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise(r => ws.on('open', r));
  ws.on('message', data => {
    const msg = JSON.parse(data);
    if (msg.id && pending[msg.id]) {
      const { resolve } = pending[msg.id];
      delete pending[msg.id];
      resolve(msg.result);
    }
  });

  const result = await evaluate(ws, `JSON.stringify({
    url: location.href,
    title: document.title,
    hasTcSlider: !!document.querySelector('.tc-slider-normal'),
    hasCaptcha: !!document.querySelector('.captcha'),
    hasSlideV: !!document.querySelector('#slide_v'),
    hasAnyCaptcha: !!document.querySelector('[class*="captcha"]'),
    captchaClasses: Array.from(document.querySelectorAll('[class*="captcha"]')).map(el => el.className + '|tag:' + el.tagName).join('; '),
    tcSliderClasses: Array.from(document.querySelectorAll('.tc-slider-normal')).map(el => el.className + '|tag:' + el.tagName).join('; '),
    bodySnippet: document.body.innerText.substring(0, 300)
  })`);
  
  const info = JSON.parse(result);
  console.log('URL:', info.url);
  console.log('Title:', info.title);
  console.log('has .tc-slider-normal:', info.hasTcSlider, '→', info.tcSliderClasses);
  console.log('has .captcha:', info.hasCaptcha);
  console.log('has #slide_v:', info.hasSlideV);
  console.log('has [class*=captcha]:', info.hasAnyCaptcha, '→', info.captchaClasses);
  console.log('\nBody snippet:', info.bodySnippet);
  
  ws.close();
}

main().catch(console.error);
