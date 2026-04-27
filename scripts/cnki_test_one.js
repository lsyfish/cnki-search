/**
 * 单条测试：验证 [1] 高德胜 生活德育简论
 */
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
    setTimeout(() => {
      if (pending[id]) { delete pending[id]; reject(new Error('Timeout: ' + method)); }
    }, 20000);
  });
}

async function evaluate(ws, expr) {
  const r = await sendCmd(ws, 'Runtime.evaluate', { expression: expr, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
  return r.result.value;
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

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

  const searchUrl = 'https://kns.cnki.net/kns8s/defaultresult/index?dbcode=CJFD&kw=%E7%94%9F%E6%B4%BB%E5%BE%B7%E8%82%B2%E7%AE%80%E8%AE%BA&korder=TI';
  console.log('Navigating...');
  await sendCmd(ws, 'Page.navigate', { url: searchUrl });
  await sleep(3500);

  // 等待 .fz14
  for (let i = 0; i < 8; i++) {
    const ok = await evaluate(ws, `!!document.querySelector('.fz14')`);
    if (ok) break;
    await sleep(600);
  }

  const rawJson = await evaluate(ws, `
    JSON.stringify((function() {
      const results = [];
      const titleLinks = document.querySelectorAll('#gridTable .fz14, .result-table-list .fz14');
      titleLinks.forEach(titleEl => {
        const row = titleEl.closest('tr');
        if (!row) return;
        const cells = Array.from(row.querySelectorAll('td'));
        let titleIdx = -1;
        cells.forEach((td, i) => { if (td.contains(titleEl)) titleIdx = i; });
        results.push({
          title: titleEl.textContent.trim(),
          author: cells[titleIdx + 1] ? cells[titleIdx + 1].textContent.trim() : '',
          journal: cells[titleIdx + 2] ? cells[titleIdx + 2].textContent.trim() : '',
          year: cells[titleIdx + 3] ? cells[titleIdx + 3].textContent.trim().substring(0, 4) : '',
        });
      });
      const countText = document.body.innerText.match(/共找到\\s*([\\d,，]+)\\s*条结果/);
      return { results: results.slice(0, 8), totalCount: countText ? countText[1] : '?' };
    })())
  `);

  console.log('\n=== 结果 ===');
  const data = JSON.parse(rawJson);
  console.log('总计:', data.totalCount, '条');
  data.results.forEach((r, i) => {
    console.log(`\n[${i+1}]`);
    console.log('  标题:', r.title);
    console.log('  作者:', r.author);
    console.log('  期刊:', r.journal);
    console.log('  年份:', r.year);
  });

  ws.close();
}

main().catch(console.error);
