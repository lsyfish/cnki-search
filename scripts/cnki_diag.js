const http = require('http');
const WebSocket = require('ws');

function getTabList() {
  return new Promise((resolve, reject) => {
    http.get('http://localhost:9222/json', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
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
    setTimeout(() => {
      if (pending[id]) { delete pending[id]; reject(new Error('Timeout')); }
    }, 20000);
  });
}

async function main() {
  const tabs = await getTabList();
  const tab = tabs.find(t => t.type === 'page');
  console.log('Tab URL:', tab.url);
  
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
  
  // Navigate to CNKI search
  const searchUrl = 'https://kns.cnki.net/kns8s/defaultresult/index?dbcode=CJFD&kw=%E7%94%9F%E6%B4%BB%E5%BE%B7%E8%82%B2%E7%AE%80%E8%AE%BA&korder=TI';
  console.log('Navigating to:', searchUrl);
  await sendCmd(ws, 'Page.navigate', { url: searchUrl });
  await new Promise(r => setTimeout(r, 5000));
  
  const result = await sendCmd(ws, 'Runtime.evaluate', {
    expression: `JSON.stringify({
      url: location.href,
      title: document.title,
      bodyLen: document.body.innerHTML.length,
      text400: document.body.innerText.substring(0, 400),
      hasFz14: !!document.querySelector('.fz14'),
      hasGrid: !!document.querySelector('#gridTable'),
      hasResultTable: !!document.querySelector('.result-table-list'),
      allClassNames: Array.from(document.querySelectorAll('[class]')).slice(0,20).map(el => el.className).join('|')
    })`,
    returnByValue: true
  });
  
  const info = JSON.parse(result.result.value);
  console.log('\n=== Page Info ===');
  console.log('URL:', info.url);
  console.log('Title:', info.title);
  console.log('Body length:', info.bodyLen);
  console.log('Has .fz14:', info.hasFz14);
  console.log('Has #gridTable:', info.hasGrid);
  console.log('Has .result-table-list:', info.hasResultTable);
  console.log('\nFirst 400 chars:');
  console.log(info.text400);
  console.log('\nFirst 20 class names:');
  console.log(info.allClassNames);
  
  ws.close();
}

main().catch(console.error);
